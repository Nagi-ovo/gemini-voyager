/**
 * "Continue in ChatGPT / Claude" on the Gemini side.
 *
 * The branch is picked synchronously at the click from a status cached when
 * the panel opened: Safari only allows a clipboard write inside the gesture,
 * and Chrome refuses one once the new tab has taken focus. So the fallback
 * copies first and asks the background to open the chat only after the copy
 * succeeds; the handoff path sends the Markdown to the background, which
 * opens the chat and lets Voyager on that tab fill the composer. An unknown
 * status counts as "Voyager cannot run there", and so does a browser without
 * the Navigation API, which the receiver needs (see `navigationApi`). This
 * page itself makes no network request: it only messages the extension.
 */
import {
  HANDOFF_MESSAGES,
  HANDOFF_TARGETS,
  type HandoffMessage,
  type HandoffOpenResult,
  type HandoffStatus,
  type HandoffTarget,
  parseHandoffStatus,
} from '@/features/researchPack/services/handoff';
import type { TranslationKey } from '@/utils/translations';

import { navigationApi } from './navigationApi';

export interface ContinueInDeps {
  send: (message: HandoffMessage) => Promise<unknown>;
  writeClipboard: (text: string) => Promise<void>;
  /** Whether this browser has the Navigation API (defaults to checking `window`). */
  hasNavigationApi?: () => boolean;
}

export interface ContinueInController {
  /** Ask the background which targets Voyager runs on now. */
  refresh: () => void;
  /** Must be called synchronously from the click that asked for it. */
  continueIn: (target: HandoffTarget, markdown: string) => void;
  destroy: () => void;
}

type Notify = (message: string, tone?: 'ok' | 'error') => void;

const NOT_READY: HandoffStatus = { chatgpt: false, claude: false };

export function formatTarget(template: string, target: HandoffTarget): string {
  return template.split('{target}').join(HANDOFF_TARGETS[target].label);
}

function openResult(value: unknown): HandoffOpenResult {
  if (value && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true };
  }
  const reason = (value as { reason?: unknown } | null | undefined)?.reason;
  return { ok: false, reason: reason === 'unavailable' ? 'unavailable' : 'open_failed' };
}

export function createContinueInController(
  deps: ContinueInDeps,
  t: (key: TranslationKey) => string,
  notify: Notify,
): ContinueInController {
  let stopped = false;
  let status: HandoffStatus = NOT_READY;
  const hasNavigationApi = deps.hasNavigationApi ?? (() => navigationApi() !== null);
  let request = 0;
  /** A click is being handled: a double click must not open a second tab. */
  let busy = false;

  const say = (key: TranslationKey, target: HandoffTarget, tone?: 'ok' | 'error'): void => {
    if (!stopped) notify(formatTarget(t(key), target), tone);
  };

  const refresh = (): void => {
    const asked = ++request;
    void Promise.resolve()
      .then(() => deps.send({ type: HANDOFF_MESSAGES.status }))
      .then(
        (value) => {
          if (!stopped && asked === request) status = parseHandoffStatus(value);
        },
        () => {
          if (!stopped && asked === request) status = NOT_READY;
        },
      );
  };

  const handOff = (target: HandoffTarget, markdown: string): Promise<void> =>
    Promise.resolve()
      .then(() => deps.send({ type: HANDOFF_MESSAGES.open, target, markdown }))
      .then(openResult, () => openResult(null))
      .then((result) => {
        if (result.ok) {
          say('researchPackContinueOpening', target);
          return;
        }
        if (result.reason === 'unavailable') {
          // Voyager stopped running there since the panel opened. The next
          // click is a fresh gesture, so it can take the clipboard path.
          status = { ...status, [target]: false };
          refresh();
          say('researchPackContinueRetry', target, 'error');
          return;
        }
        say('researchPackContinueFailed', target, 'error');
      });

  const copyThenOpen = (target: HandoffTarget, markdown: string): Promise<void> => {
    let copied: Promise<void>;
    try {
      // First statement of the gesture: nothing may run before this write.
      copied = deps.writeClipboard(markdown);
    } catch (error) {
      copied = Promise.reject(error);
    }
    return copied.then(
      () =>
        Promise.resolve()
          .then(() => deps.send({ type: HANDOFF_MESSAGES.open, target }))
          .then(openResult, () => openResult(null))
          .then((result) =>
            result.ok
              ? say('researchPackContinueCopied', target)
              : say('researchPackContinueFailed', target, 'error'),
          ),
      () => {
        if (!stopped) notify(t('researchPackCopyFailed'), 'error');
      },
    );
  };

  return {
    refresh,
    continueIn(target, markdown) {
      if (stopped || busy) return;
      busy = true;
      const handled =
        status[target] && hasNavigationApi()
          ? handOff(target, markdown)
          : copyThenOpen(target, markdown);
      void handled
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    },
    destroy() {
      stopped = true;
      request += 1;
    },
  };
}
