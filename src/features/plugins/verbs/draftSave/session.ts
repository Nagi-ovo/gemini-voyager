/**
 * Draft auto-save for one site policy: unsent composer text is saved per
 * conversation after a pause in typing and put back into an empty composer when
 * that conversation opens again. A confirmed send drops the draft (catalog sites:
 * Enter, the send button or the form, then the composer emptying; Gemini: its own
 * send detection). Nothing here sends, submits or clears the composer itself.
 *
 * Every listener and timer is registered on the plugin's scope; disposing it
 * stops the session and leaves stored drafts in place.
 */
import type { Dispose, PluginScope } from '@/features/plugins/runtime/pluginScope';
import { DraftStore, draftStoreOptions } from '@/pages/content/draftSave/draftStore';
import { registerDraftFlush } from '@/pages/content/draftSave/draftUnloadFlush';
import { startGeminiDraftSendDetection } from '@/pages/content/draftSave/geminiDraftSendDetection';
import { watchRouteChanges } from '@/pages/content/utils/routeWatcher';

import { composerEnterIsOwned } from '../composerEnterOwner';
import { NEW_CHAT_DRAFT } from './draftKey';
import { type DraftPolicy, sanitizeDraftAt } from './draftPolicy';

/** Same pause as Gemini's before typing is written to storage. */
export const DRAFT_SAVE_DEBOUNCE_MS = 1000;
/** Same delay and retry budget as Gemini's restore while a navigated-to composer mounts. */
export const DRAFT_RESTORE_DELAY_MS = 500;
const RESTORE_ATTEMPTS = 5;
/** How long a send stays armed for the composer to empty or the route to change. */
export const SEND_INTENT_TIMEOUT_MS = 2000;
/** Hosts clear a sent prompt with an editor transaction that fires no `input` event. */
const SEND_CHECK_INTERVAL_MS = 250;

interface SendIntent {
  readonly key: string;
  readonly disposers: readonly Dispose[];
}

export function startSiteDraftSave(scope: PluginScope, policy: DraftPolicy, doc: Document): void {
  const detection = policy.sendDetection;
  const sendButton = detection.kind === 'catalog' ? detection.sendButton : undefined;
  const keyHere = (): string | null =>
    policy.eligible(location, doc) ? policy.keyFor(location) : null;
  const composer = (): HTMLElement | null => policy.findInput(doc);

  let currentKey = keyHere();
  let currentIdentity = policy.restoreIdentity(doc);
  let inputRevision = 0;
  // Gemini's send replaces the composer silently; catalog hosts fire their own input while mounting it.
  const typedSince = (revision: number): boolean =>
    detection.kind === 'gemini' && inputRevision !== revision;
  let geminiSend: ReturnType<typeof startGeminiDraftSendDetection> | null = null;
  /** Bumped whenever the key changes, so a timer started for one conversation stops in another. */
  let navigation = 0;
  let restored = false;
  let lastSavedContent = '';
  let pendingSave: { key: string; content: string } | null = null;
  let cancelSaveTimer: Dispose | null = null;
  let sendIntent: SendIntent | null = null;

  const store = new DraftStore(
    (key, content) => {
      if (key === currentKey) lastSavedContent = content;
    },
    draftStoreOptions(policy, doc),
  );

  const ownComposer = (target: EventTarget | null): HTMLElement | null => {
    const field = composer();
    return field && target instanceof Node && field.contains(target) ? field : null;
  };

  const flushPendingSave = (): void => {
    if (scope.isDisposed) {
      pendingSave = null;
      return;
    }
    void cancelSaveTimer?.();
    cancelSaveTimer = null;
    const pending = pendingSave;
    pendingSave = null;
    if (!pending) return;
    if (pending.key === currentKey && pending.content === lastSavedContent) return;
    store.save(pending.key, pending.content);
  };

  const discardPendingSave = (key: string): void => {
    if (pendingSave?.key !== key) return;
    void cancelSaveTimer?.();
    cancelSaveTimer = null;
    pendingSave = null;
  };

  const clearSendIntent = (): void => {
    const intent = sendIntent;
    sendIntent = null;
    intent?.disposers.forEach((dispose) => void dispose());
  };

  const dropSentDraft = (key: string): void => {
    discardPendingSave(key);
    store.remove(key);
    inputRevision += 1;
    clearSendIntent();
  };

  const checkSent = (): void => {
    if (!sendIntent || sendIntent.key !== currentKey) return;
    const field = composer();
    if (field && policy.isEmpty(field)) dropSentDraft(sendIntent.key);
  };

  const markSendIntent = (field: HTMLElement): void => {
    // An empty composer sends nothing; armed, it would drop the draft typed next.
    const key = keyHere();
    if (scope.isDisposed || key === null || policy.isEmpty(field)) return;
    inputRevision += 1;
    clearSendIntent();
    sendIntent = {
      key,
      disposers: [
        scope.timer(clearSendIntent, SEND_INTENT_TIMEOUT_MS),
        scope.timer(checkSent, SEND_CHECK_INTERVAL_MS, { repeat: true }),
      ],
    };
  };

  const onInput = (event: Event): void => {
    if (scope.isDisposed) return;
    const field = ownComposer(event.target);
    if (!field) return;
    inputRevision += 1;
    geminiSend?.checkSent();
    // The route watcher polls; the live route at the input event names the draft's conversation.
    const key = keyHere();
    if (key === null) return;
    const content = sanitizeDraftAt(policy, 'input', policy.readText(field)).trim();
    if (!content && detection.kind === 'gemini' && key !== currentKey) return;
    if (!content && sendIntent) {
      dropSentDraft(sendIntent.key);
      return;
    }
    pendingSave = { key, content };
    void cancelSaveTimer?.();
    cancelSaveTimer = scope.timer(flushPendingSave, DRAFT_SAVE_DEBOUNCE_MS);
  };

  const tryRestore = (
    generation: number,
    key: string,
    content: string,
    attempts: number,
    identity: string,
    revision: number,
  ) => {
    if (
      scope.isDisposed ||
      restored ||
      generation !== navigation ||
      keyHere() !== key ||
      policy.restoreIdentity(doc) !== identity ||
      typedSince(revision)
    )
      return;
    const field = composer();
    if (field) {
      // Whatever is already in the composer is the user's: never write over it.
      if (!policy.isEmpty(field)) {
        restored = true;
        return;
      }
      if (policy.write(field, content)) {
        restored = true;
        return;
      }
    }
    if (attempts > 0) {
      scope.timer(
        () => tryRestore(generation, key, content, attempts - 1, identity, revision),
        DRAFT_RESTORE_DELAY_MS,
      );
    }
  };

  const restore = async (generation: number): Promise<void> => {
    const key = currentKey;
    if (key === null || restored || generation !== navigation) return;
    const identity = policy.restoreIdentity(doc);
    const revision = inputRevision;
    const saved = await store.load(key);
    // A late load must not refill an input that was typed into and then sent or cleared.
    if (
      scope.isDisposed ||
      generation !== navigation ||
      keyHere() !== key ||
      identity !== policy.restoreIdentity(doc) ||
      typedSince(revision)
    )
      return;
    const content = saved === null ? undefined : sanitizeDraftAt(policy, 'restore', saved).trim();
    // Track what storage holds even when the restore is skipped: a host that refills its own
    // draft first would otherwise make clearing the composer look unchanged and keep this one.
    lastSavedContent = content ?? '';
    if (!content) {
      restored = true;
      return;
    }
    tryRestore(generation, key, content, RESTORE_ATTEMPTS, identity, revision);
  };

  const onRoute = (): void => {
    const next = keyHere();
    const nextIdentity = policy.restoreIdentity(doc);
    if (next === currentKey && nextIdentity === currentIdentity) return;
    geminiSend?.checkSent();
    const previous = currentKey;
    // Only a first send changes the route; leaving a conversation within the send window
    // (the host ignored that Enter) must keep its draft. Send intents are catalog-only.
    const firstSend =
      detection.kind === 'catalog' &&
      previous === NEW_CHAT_DRAFT &&
      next !== null &&
      next !== NEW_CHAT_DRAFT;
    if (firstSend && sendIntent?.key === previous && currentIdentity === nextIdentity) {
      // A first send moves the new-chat page to the conversation's route: the
      // still-debounced text was just sent and must not be saved back.
      dropSentDraft(previous);
    } else {
      // Leaving a conversation keeps its draft; the pending entry carries its own key.
      flushPendingSave();
    }
    clearSendIntent();
    currentKey = next;
    currentIdentity = nextIdentity;
    navigation += 1;
    lastSavedContent = '';
    restored = false;
    const generation = navigation;
    scope.timer(() => void restore(generation), DRAFT_RESTORE_DELAY_MS);
  };

  if (detection.kind === 'gemini') {
    scope.effect(() => {
      geminiSend = startGeminiDraftSendDetection({
        doc,
        policy,
        signal: scope.signal,
        onSent: dropSentDraft,
        onIntent: () => {
          inputRevision += 1;
        },
      });
      return geminiSend.stop;
    }, 'draft-save:gemini-send');
  }
  scope.on(doc, 'input', onInput, { capture: true });
  if (detection.kind === 'catalog') {
    scope.on(
      doc,
      'keydown',
      (event) => {
        // IME confirmation also reports Enter; it only commits text.
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229)
          return;
        // A send shortcut may see this Enter after us and make it a newline; its sends are button clicks.
        if (composerEnterIsOwned(doc)) return;
        const field = ownComposer(event.target);
        if (field) markSendIntent(field);
      },
      { capture: true },
    );
    scope.on(
      doc,
      'click',
      (event) => {
        if (!sendButton || !(event.target instanceof Element)) return;
        let button: Element | null = null;
        try {
          button = event.target.closest(sendButton);
        } catch {
          return;
        }
        if (!button || button.matches(':disabled, [aria-disabled="true"]')) return;
        const field = composer();
        if (field) markSendIntent(field);
      },
      { capture: true },
    );
    scope.on(
      doc,
      'submit',
      (event) => {
        const field = composer();
        if (field && event.target instanceof Node && event.target.contains(field)) {
          markSendIntent(field);
        }
      },
      { capture: true },
    );
  }
  scope.effect(() => registerDraftFlush(flushPendingSave), 'draft-save:unload-flush');
  if (policy.flushOnPageHide) {
    // A reload or full navigation inside the pause would keep the previous draft, even a cleared one.
    scope.on(doc.defaultView ?? window, 'pagehide', flushPendingSave);
  }
  scope.effect(() => watchRouteChanges(onRoute), 'draft-save:route');
  // Disabling drops the unsaved tail like Gemini's toggle does; stored drafts stay.
  scope.effect(
    () => () => {
      pendingSave = null;
      sendIntent = null;
    },
    'draft-save:state',
  );

  void restore(navigation);
}
