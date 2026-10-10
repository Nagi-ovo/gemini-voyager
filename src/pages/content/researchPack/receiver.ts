/**
 * Receiving end of "Continue in ChatGPT / Claude", on the new chat tab the
 * background opened (see `features/researchPack/services/handoff.ts`).
 *
 * Order: peek → wait for the composer → claim → check again → insert. Only a
 * fresh new-chat page peeks, so ordinary page loads stay free of timers.
 * Claiming only once the composer exists means a login redirect or a slow
 * page leaves the record to expire instead of spending it. The pack goes only
 * into the site's main composer, only while it is empty and the tab is still
 * on the new-chat page; anything else inserts nothing. Nothing is sent: the
 * user reviews the pack and presses send.
 *
 * The text goes in through the shared `insertTextIntoChatInput`.
 */
import { createToaster } from '@/core/ui/toast/toaster';
import {
  HANDOFF_MESSAGES,
  type HandoffMessage,
  type HandoffTarget,
  handoffNewChatTargetForUrl,
} from '@/features/researchPack/services/handoff';
import { getTranslationSync } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import { insertTextIntoChatInput } from '../chatInput';
import type { StopNativeFeature } from '../featureLifecycle';
import { navigationApi } from './navigationApi';

export const RECEIVER_POLL_MS = 150;
/** The same element on this many polls in a row: the app has finished mounting it. */
export const RECEIVER_STABLE_POLLS = 3;
export const RECEIVER_COMPOSER_TIMEOUT_MS = 20_000;
export const RECEIVER_TOAST_MS = 6_000;

export interface ResearchPackReceiverDeps {
  send?: (message: HandoffMessage) => Promise<unknown>;
  insert?: (text: string, input: HTMLElement) => boolean;
  pageUrl?: () => string;
  isTopFrame?: () => boolean;
  t?: (key: TranslationKey) => string;
  /** `window.navigation`; null (no Navigation API) makes the receiver refuse. */
  navigation?: EventTarget | null;
}

interface NavigateEventLike extends Event {
  readonly destination?: { readonly url?: string };
}

/**
 * Every same-document navigation, as it happens: `navigate` fires for the
 * page's own pushState, replaceState, traversals and hash changes with the
 * destination before it commits, and `currententrychange` once it has. No
 * polling, so a round trip cannot slip between two checks (see `navigationApi`).
 */
function watchHandoffRoute(navigation: EventTarget, onChange: (href?: string) => void): () => void {
  const onNavigate = (event: Event) => onChange((event as NavigateEventLike).destination?.url);
  const onEntryChange = () => onChange();
  navigation.addEventListener('navigate', onNavigate);
  navigation.addEventListener('currententrychange', onEntryChange);
  return () => {
    navigation.removeEventListener('navigate', onNavigate);
    navigation.removeEventListener('currententrychange', onEntryChange);
  };
}

function isUsable(candidate: HTMLElement): boolean {
  return (
    candidate.isConnected &&
    !candidate.matches('[aria-disabled="true"]') &&
    !candidate.closest('[hidden], [inert], [aria-hidden="true"]')
  );
}

/**
 * Each site's main composer, never the adapter's generic `contenteditable`
 * fallback, which also matches canvases and edit-message boxes. The same
 * selectors identify these composers for Vim input and slash prompts.
 */
export const HANDOFF_COMPOSER_SELECTORS: Readonly<Record<HandoffTarget, string>> = {
  chatgpt: '#prompt-textarea[contenteditable="true"]',
  claude: '[data-testid="chat-input"][contenteditable="true"]',
};

/** The site's main composer, or null when there is none or more than one is usable. */
export function findHandoffComposer(
  target: HandoffTarget,
  doc: Document = document,
): HTMLElement | null {
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>(HANDOFF_COMPOSER_SELECTORS[target]),
  ).filter(isUsable);
  return candidates.length === 1 ? candidates[0] : null;
}

/** Whitespace, including the zero-width characters editors use to hold a caret. */
const BLANK_TEXT = /^[\s​﻿]*$/;

/**
 * Elements of an empty editor: the paragraph, its trailing `<br>`, and the
 * caret separator image ProseMirror adds. Placeholders are attributes or CSS
 * on the paragraph, never child nodes.
 */
function isEmptySkeletonElement(element: Element): boolean {
  switch (element.tagName) {
    case 'P':
    case 'BR':
      return true;
    case 'IMG':
      return isProseMirrorSeparator(element);
    default:
      return false;
  }
}

/** The only attributes ProseMirror gives its separator image. */
const SEPARATOR_ATTRIBUTES = new Set(['class', 'alt', 'mark-placeholder']);

/**
 * ProseMirror's decorative caret image, exactly as prosemirror-view renders it:
 * `<img class="ProseMirror-separator" alt="">`, plus `mark-placeholder="true"`
 * on the cursor wrapper. Never a source, never alt text; a class alone does not
 * make an image decorative.
 */
function isProseMirrorSeparator(element: Element): boolean {
  return (
    element.classList.contains('ProseMirror-separator') &&
    element.getAttribute('alt') === '' &&
    Array.from(element.attributes).every((attribute) => SEPARATOR_ATTRIBUTES.has(attribute.name))
  );
}

/**
 * A composer the pack may go into: nothing typed, pasted, attached or restored
 * as a draft. Empty text is not enough, since an image or a mention chip has
 * none; any element outside the empty-editor skeleton counts as content.
 */
function isEmptyComposer(composer: HTMLElement): boolean {
  const walker = composer.ownerDocument.createTreeWalker(
    composer,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!BLANK_TEXT.test(node.nodeValue ?? '')) return false;
    } else if (!isEmptySkeletonElement(node as Element)) {
      return false;
    }
  }
  return true;
}

/** Put the caret at the end so the insertion can never replace a selection. */
function collapseSelectionToEnd(composer: HTMLElement): void {
  const selection = composer.ownerDocument.getSelection();
  if (!selection) return;
  const range = composer.ownerDocument.createRange();
  range.selectNodeContents(composer);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function isClaim(value: unknown): value is { ok: true; markdown: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as { ok?: unknown; markdown?: unknown };
  return record.ok === true && typeof record.markdown === 'string' && record.markdown.length > 0;
}

export function startResearchPackReceiver(deps: ResearchPackReceiverDeps = {}): StopNativeFeature {
  const pageUrl = deps.pageUrl ?? (() => window.location.href);
  const isTopFrame = deps.isTopFrame ?? (() => window.top === window);
  const target = handoffNewChatTargetForUrl(pageUrl());
  const navigation = 'navigation' in deps ? deps.navigation : navigationApi();
  if (!target || !isTopFrame() || !navigation) return () => {};
  const startDocument = document;
  /**
   * Set for good by any departure from the new-chat page. Coming back (an SPA
   * round trip such as / -> /c/A -> /) does not clear it: the composer on
   * screen may still belong to the conversation the tab passed through.
   */
  let departed = false;
  /** Still the new-chat page this receiver started on, in the same document, never left. */
  const onNewChat = (): boolean =>
    !departed && document === startDocument && handoffNewChatTargetForUrl(pageUrl()) === target;

  const send = deps.send ?? ((message: HandoffMessage) => chrome.runtime.sendMessage(message));
  const insert =
    deps.insert ?? ((text: string, input: HTMLElement) => insertTextIntoChatInput(text, input));
  const t = deps.t ?? getTranslationSync;

  // Teardown is synchronous: every timer, the composer wait and the toast go at once.
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const toaster = createToaster();
  let abandonWait: (() => void) | null = null;

  // Watched from the first peek until the pack is in or given up on.
  let stopRoute: (() => void) | null = watchHandoffRoute(navigation, (href) => {
    if (departed) return;
    if (handoffNewChatTargetForUrl(href ?? pageUrl()) === target && document === startDocument) {
      return;
    }
    departed = true;
    unwatchRoute();
    abandonWait?.();
  });
  function unwatchRoute(): void {
    stopRoute?.();
    stopRoute = null;
  }

  const later = (run: () => void, ms: number): ReturnType<typeof setTimeout> => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!stopped) run();
    }, ms);
    timers.add(timer);
    return timer;
  };

  const toast = (key: TranslationKey, tone: 'success' | 'error'): void => {
    toaster.show({ message: t(key), tone, durationMs: RECEIVER_TOAST_MS });
  };

  /** Resolve with the composer once it has held still, or null on timeout or teardown. */
  const waitForComposer = (): Promise<HTMLElement | null> =>
    new Promise((resolve) => {
      const deadline = Date.now() + RECEIVER_COMPOSER_TIMEOUT_MS;
      let previous: HTMLElement | null = null;
      let stable = 0;
      // Settled once: a departure or teardown also cancels the next poll.
      let settled = false;
      let nextPoll: ReturnType<typeof setTimeout> | null = null;
      const finish = (composer: HTMLElement | null): void => {
        if (settled) return;
        settled = true;
        abandonWait = null;
        if (nextPoll !== null) {
          clearTimeout(nextPoll);
          timers.delete(nextPoll);
          nextPoll = null;
        }
        resolve(composer);
      };
      abandonWait = () => finish(null);
      const poll = (): void => {
        nextPoll = null;
        if (settled) return;
        const composer = findHandoffComposer(target);
        stable = composer && composer === previous ? stable + 1 : composer ? 1 : 0;
        previous = composer;
        if (composer && stable >= RECEIVER_STABLE_POLLS) return finish(composer);
        if (Date.now() >= deadline) return finish(null);
        nextPoll = later(poll, RECEIVER_POLL_MS);
      };
      poll();
    });

  const receive = async (): Promise<void> => {
    const peek = (await send({ type: HANDOFF_MESSAGES.peek })) as { pending?: unknown } | undefined;
    // Leaving during the peek round trip ends it here, before any composer poll.
    if (stopped || peek?.pending !== true || !onNewChat()) return;

    const composer = await waitForComposer();
    if (stopped) return;
    // Not claimed on any of these: the record expires on its own.
    if (!onNewChat()) return;
    if (!composer || !isEmptyComposer(composer)) {
      toast('researchPackHandoffFailed', 'error');
      return;
    }

    const claim = await send({ type: HANDOFF_MESSAGES.claim });
    if (stopped || !isClaim(claim)) return;
    // The claim took a round trip: the user may have navigated, typed or
    // selected meanwhile. The pack is spent now, so anything off inserts
    // nothing and points the user back to Gemini's Copy.
    const input = findHandoffComposer(target);
    if (!onNewChat() || !input || !isEmptyComposer(input)) {
      toast('researchPackHandoffFailed', 'error');
      return;
    }
    collapseSelectionToEnd(input);
    if (!insert(claim.markdown, input)) {
      toast('researchPackHandoffFailed', 'error');
      return;
    }
    toast('researchPackHandoffReady', 'success');
  };

  void receive()
    .catch(() => undefined)
    .finally(unwatchRoute);
  return () => {
    if (stopped) return;
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    toaster.destroy();
    unwatchRoute();
    abandonWait?.();
  };
}
