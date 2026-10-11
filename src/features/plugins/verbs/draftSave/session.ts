/**
 * Gemini's draft auto-save (`pages/content/draftSave`) for a catalog site:
 * unsent composer text is saved per conversation after a pause in typing and
 * put back into an empty composer when that conversation opens again. A send
 * (Enter, the send button or the form, then the composer emptying) drops the
 * draft. Nothing here sends, submits or clears the composer itself.
 *
 * Every listener and timer is registered on the plugin's scope; disposing it
 * stops the session and leaves stored drafts in place.
 */
import { findComposer, insertIntoComposer, readComposer } from '@/core/services/composer';
import { setTextFieldValue } from '@/core/services/composer/textField';
import type { Dispose, PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { SiteAdapter } from '@/features/plugins/types';
import { DraftStore } from '@/pages/content/draftSave/draftStore';
import { watchRouteChanges } from '@/pages/content/utils/routeWatcher';

import { draftKeyFor, siteDraftPrefix } from './draftKey';

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

function isTextField(field: HTMLElement): field is HTMLTextAreaElement | HTMLInputElement {
  return field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement;
}

/** The trimmed text a draft records. */
function draftText(field: HTMLElement): string {
  return readComposer(field).trim();
}

export function startSiteDraftSave(scope: PluginScope, adapter: SiteAdapter, doc: Document): void {
  const sendButton = adapter.selectors.sendButton;
  const keyHere = (): string | null => draftKeyFor(adapter, location.href);
  const composer = (): HTMLElement | null => findComposer(adapter, { doc });

  let currentKey = keyHere();
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
    { prefix: siteDraftPrefix(adapter.id), sanitize: (content) => content },
  );

  const ownComposer = (target: EventTarget | null): HTMLElement | null => {
    const field = composer();
    return field && target instanceof Node && field.contains(target) ? field : null;
  };

  const flushPendingSave = (): void => {
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
    clearSendIntent();
  };

  const checkSent = (): void => {
    if (!sendIntent || sendIntent.key !== currentKey) return;
    const field = composer();
    if (field && draftText(field) === '') dropSentDraft(sendIntent.key);
  };

  const markSendIntent = (field: HTMLElement): void => {
    // An empty composer sends nothing; armed, it would drop the draft typed next.
    if (scope.isDisposed || currentKey === null || draftText(field) === '') return;
    clearSendIntent();
    sendIntent = {
      key: currentKey,
      disposers: [
        scope.timer(clearSendIntent, SEND_INTENT_TIMEOUT_MS),
        scope.timer(checkSent, SEND_CHECK_INTERVAL_MS, { repeat: true }),
      ],
    };
  };

  const onInput = (event: Event): void => {
    const field = ownComposer(event.target);
    if (!field) return;
    // The route watcher polls; the live route at the input event names the draft's conversation.
    const key = keyHere();
    if (key === null) return;
    const content = draftText(field);
    if (!content && sendIntent) {
      dropSentDraft(sendIntent.key);
      return;
    }
    pendingSave = { key, content };
    void cancelSaveTimer?.();
    cancelSaveTimer = scope.timer(flushPendingSave, DRAFT_SAVE_DEBOUNCE_MS);
  };

  /** Writes a stored draft into an empty composer, leaving focus where the user had it. */
  const writeDraft = (field: HTMLElement, content: string): boolean => {
    if (isTextField(field)) {
      // A plain field takes the value without focus, as Gemini's draft restore does.
      setTextFieldValue(field, content);
      return draftText(field) !== '';
    }
    const previous = doc.activeElement;
    // Rich editors need the selection inside them for a native editing command.
    const written = insertIntoComposer(field, content, 'replace');
    if (previous instanceof HTMLElement && previous !== doc.body && !field.contains(previous)) {
      previous.focus();
    }
    return written;
  };

  const tryRestore = (generation: number, key: string, content: string, attempts: number) => {
    if (scope.isDisposed || restored || generation !== navigation || keyHere() !== key) return;
    const field = composer();
    if (field) {
      // Whatever is already in the composer is the user's: never write over it.
      if (draftText(field) !== '') {
        restored = true;
        return;
      }
      if (writeDraft(field, content)) {
        restored = true;
        return;
      }
    }
    if (attempts > 0) {
      scope.timer(() => tryRestore(generation, key, content, attempts - 1), DRAFT_RESTORE_DELAY_MS);
    }
  };

  const restore = async (generation: number): Promise<void> => {
    const key = currentKey;
    if (key === null || restored || generation !== navigation) return;
    const saved = await store.load(key);
    if (scope.isDisposed || generation !== navigation) return;
    const content = saved?.trim();
    // Track what storage holds even when the restore is skipped: a host that refills its own
    // draft first would otherwise make clearing the composer look unchanged and keep this one.
    lastSavedContent = content ?? '';
    if (!content) {
      restored = true;
      return;
    }
    tryRestore(generation, key, content, RESTORE_ATTEMPTS);
  };

  const onRoute = (): void => {
    const next = keyHere();
    if (next === currentKey) return;
    const previous = currentKey;
    if (previous !== null && sendIntent?.key === previous) {
      // A first send moves the new-chat page to the conversation's route: the
      // still-debounced text was just sent and must not be saved back.
      dropSentDraft(previous);
    } else {
      // Leaving a conversation keeps its draft; the pending entry carries its own key.
      flushPendingSave();
    }
    clearSendIntent();
    currentKey = next;
    navigation += 1;
    lastSavedContent = '';
    restored = false;
    const generation = navigation;
    scope.timer(() => void restore(generation), DRAFT_RESTORE_DELAY_MS);
  };

  scope.on(doc, 'input', onInput, { capture: true });
  scope.on(
    doc,
    'keydown',
    (event) => {
      // IME confirmation also reports Enter; it only commits text.
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229)
        return;
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
  // A reload or full navigation inside the pause would keep the previous draft, even a cleared one.
  scope.on(doc.defaultView ?? window, 'pagehide', flushPendingSave);
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
