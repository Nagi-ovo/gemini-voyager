/**
 * `conversation.ready` (spec §3.4, leased): wait for the app shell, then report
 * login and mode, and bring the page into `ensureMode` (default `chat`).
 *
 * Mode is decided only from positive evidence. Phase B has no `modelPicker`
 * site data yet, so the composer labels below are the measured fallback
 * (zh-CN UI); any other label reads as `unknown`. ChatGPT's own
 * `oai/apps/tpp/chat-surface-mode` value is recorded but never interpreted:
 * its values were not measured.
 *
 * The only page event is one click on the page's own mode switch, and only
 * when the composer positively shows the other mode. The switch must look like
 * the measured one (see {@link findModeSwitch}); anything less, or a switch the
 * composer does not confirm, is `mode-unavailable`. Nothing is clicked twice.
 *
 * An existing conversation (`expect.conversationId`) keeps the mode it was
 * started in, and its page has no switch: one positively in the other mode is
 * `mode-unavailable` at once, with no click and no wait for a switch.
 */
import type {
  ChatMode,
  ConversationReadyParams,
  ConversationReadyResult,
  SwitchableMode,
} from '@/features/bridge/protocol';
import type { SiteAdapter } from '@/features/plugins/types';
import { isRendered } from '@/pages/content/export/adapter/chatgptThread';

import { GRANT_MARGIN_MS, type OpContext } from '../opContext';
import { findComposerField, settledConversationId } from './pageReaders';

const SHELL_TIMEOUT_MS = 30_000;
const MODE_SWITCH_TIMEOUT_MS = 5_000;
const SURFACE_MODE_STORAGE_KEY = 'oai/apps/tpp/chat-surface-mode';
// Measured on 2026-10-17; replace with `modelPicker.modes.*` once that site data lands.
const MODE_COMPOSER_LABELS: Readonly<Record<SwitchableMode, readonly string[]>> = {
  chat: ['询问 ChatGPT'],
  work: ['使用 ChatGPT Work'],
};
/** Measured on 2026-10-17 (zh-CN): the mode buttons' exact text. They have no role. */
export const MODE_SWITCH_LABELS: Readonly<Record<SwitchableMode, string>> = {
  chat: '聊天',
  work: '工作',
};
const MODE_SWITCH_STATE_ATTRIBUTE = 'data-state';
/** How far up from one mode button the shared container may sit. */
const MODE_SWITCH_MAX_DEPTH = 3;
/** Measured on 2026-10-18: the sidebar's home link, an in-app route to the new-chat page. */
const HOME_LINK_SELECTOR = 'nav a[href="/"]';
// Structural first; ChatGPT's earlier test ids as a fallback. Unverified on the current DOM.
const LOGIN_CONTROL_SELECTOR = [
  'a[href*="/auth/login"]',
  'a[href*="auth.openai.com"]',
  '[data-testid="login-button"]',
  '[data-testid="signup-button"]',
].join(', ');

function composerLabels(field: HTMLElement): string[] {
  const labels = [
    field.getAttribute('aria-label'),
    field.getAttribute('aria-placeholder'),
    field.getAttribute('placeholder'),
    field.querySelector('[data-placeholder]')?.getAttribute('data-placeholder') ?? null,
  ];
  return labels.map((label) => label?.trim() ?? '').filter((label) => label.length > 0);
}

function readSurfaceMode(): string | null {
  try {
    return localStorage.getItem(SURFACE_MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readMode(field: HTMLElement): { mode: ChatMode; labels: string[] } {
  const labels = composerLabels(field);
  const says = (mode: SwitchableMode): boolean =>
    labels.some((label) => MODE_COMPOSER_LABELS[mode].includes(label));
  const chat = says('chat');
  const work = says('work');
  // Contradicting evidence is no evidence.
  const mode: ChatMode = chat && !work ? 'chat' : work && !chat ? 'work' : 'unknown';
  return { mode, labels };
}

/** The text a person sees (`innerText` skips visually hidden parts; jsdom only has `textContent`). */
function buttonText(button: HTMLElement): string {
  return (button.innerText ?? button.textContent ?? '').trim();
}

/** The one rendered button whose whole text is `label`, else null (none, or ambiguous). */
function uniqueButton(label: string): HTMLButtonElement | null {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(
    (button) => buttonText(button) === label && isRendered(button),
  );
  return found.length === 1 ? found[0] : null;
}

/**
 * The page's chat/work switch, only when it has the measured shape: one
 * button per mode, both carrying `data-state` (its values were not measured,
 * so they are not read), close together in one container.
 */
export function findModeSwitch(): Readonly<Record<SwitchableMode, HTMLButtonElement>> | null {
  const chat = uniqueButton(MODE_SWITCH_LABELS.chat);
  const work = uniqueButton(MODE_SWITCH_LABELS.work);
  if (!chat || !work) return null;
  if (!chat.hasAttribute(MODE_SWITCH_STATE_ATTRIBUTE)) return null;
  if (!work.hasAttribute(MODE_SWITCH_STATE_ATTRIBUTE)) return null;
  let container: Element | null = chat.parentElement;
  for (let depth = 1; container && depth <= MODE_SWITCH_MAX_DEPTH; depth += 1) {
    if (container.contains(work)) return { chat, work };
    container = container.parentElement;
  }
  return null;
}

/** What is left of the grant for page work, never more than `cap`. */
function budget(ctx: OpContext, cap: number): number {
  return Math.max(0, Math.min(cap, ctx.grant.deadline - GRANT_MARGIN_MS - ctx.now()));
}

export async function runConversationReady(
  ctx: OpContext,
  params: ConversationReadyParams,
  adapter: SiteAdapter | null,
): Promise<ConversationReadyResult> {
  const shell = await ctx.waitFor(
    () => {
      const field = findComposerField(adapter);
      if (field) return { field };
      if (document.querySelector(LOGIN_CONTROL_SELECTOR)) return { field: null };
      return null;
    },
    { timeoutMs: budget(ctx, SHELL_TIMEOUT_MS) },
  );
  if (!shell) ctx.fail('timeout', 'The ChatGPT composer did not appear.');
  if (!shell.field) ctx.fail('login-required', 'ChatGPT is not signed in on this tab.');

  const expected = params.expect?.conversationId;
  const checkConversation = (): string | null => {
    const conversationId = settledConversationId();
    if (expected !== undefined && expected !== conversationId) {
      ctx.fail('unverified', 'The tab shows another conversation.', {
        expected,
        actual: conversationId,
      });
    }
    return conversationId;
  };
  checkConversation();

  const target = params.ensureMode ?? 'chat';
  let { mode, labels } = readMode(shell.field);
  let switchedMode: ConversationReadyResult['switchedMode'];
  // `unknown` is reported as is: without positive evidence nothing is clicked.
  if (mode !== target && mode !== 'unknown') {
    const from = mode;
    if (expected !== undefined) {
      ctx.fail(
        'mode-unavailable',
        from === 'work'
          ? 'This is a ChatGPT Work conversation; the bridge works only in chat-mode conversations.'
          : `This conversation is in ${from} mode, not ${target} mode; an existing conversation cannot be switched.`,
        {
          mode: from,
          conversationId: expected,
          reason: 'conversation-mode',
          composerLabels: labels,
        },
      );
    }
    // The switch exists on the new-chat page only: a tab left on a conversation
    // (the restore before close) goes home through the page's own link first.
    if (location.pathname !== '/') {
      const home = document.querySelector<HTMLAnchorElement>(HOME_LINK_SELECTOR);
      if (home && isRendered(home)) {
        ctx.allowRoute('/');
        ctx.click(home);
      }
    }
    // The switch renders after the composer on a fresh tab, so one look can miss it.
    const control = await ctx.waitFor(findModeSwitch, {
      timeoutMs: budget(ctx, MODE_SWITCH_TIMEOUT_MS),
    });
    if (!control) {
      ctx.fail(
        'mode-unavailable',
        `ChatGPT is in ${from} mode and its mode switch was not found.`,
        {
          mode: from,
          composerLabels: labels,
        },
      );
    }
    ctx.click(control[target]);
    const field = await ctx.waitFor(
      () => {
        const current = findComposerField(adapter);
        return current && readMode(current).mode === target ? current : null;
      },
      { timeoutMs: budget(ctx, MODE_SWITCH_TIMEOUT_MS) },
    );
    if (!field) {
      ctx.fail('mode-unavailable', `ChatGPT did not confirm the switch to ${target} mode.`, {
        from,
        to: target,
      });
    }
    ({ mode, labels } = readMode(field));
    switchedMode = { from, to: target };
  }
  return {
    url: location.href,
    conversationId: checkConversation(),
    loggedIn: true,
    mode,
    evidence: { composerLabels: labels, surfaceMode: readSurfaceMode() },
    ...(switchedMode ? { switchedMode } : {}),
  };
}
