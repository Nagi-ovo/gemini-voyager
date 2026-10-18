/**
 * `conversation.ready` (spec §3.4, leased): wait for the app shell, then report
 * login and mode, and bring the page into `ensureMode` (default `chat`).
 *
 * Mode is decided only from positive evidence: the composer placeholder and
 * switch texts in the site's `chatModes`, taken from ChatGPT's own
 * messages for each UI language it lists; any other label reads as
 * `unknown`. ChatGPT's own `oai/apps/tpp/chat-surface-mode` value is
 * recorded but never interpreted: its values were not measured.
 *
 * The only page event is one click on the page's own mode switch, and only
 * when the composer positively shows the other mode. The switch must look like
 * the measured one (see {@link findModeSwitch}); anything less, or a switch the
 * composer does not confirm, is `mode-unavailable`. Nothing is clicked twice.
 *
 * An existing conversation (`expect.conversationId`) keeps the mode it was
 * started in, and its page has no switch: one positively in the other mode is
 * `mode-unavailable` at once, with no click and no wait for a switch.
 *
 * A project page (site data `projects`) has its own chat/Work pair, marked with
 * `aria-pressed`, and often opens in Work. It is switched in place with that
 * pair's chat button only: the bridge never presses Work or leaves the project.
 */
import type {
  ChatMode,
  ConversationReadyParams,
  ConversationReadyResult,
  SwitchableMode,
} from '@/features/bridge/protocol';
import type { LocalizedLabels } from '@/features/plugins/sites/sections/modelPickerData';
import type { SiteAdapter } from '@/features/plugins/types';
import { isRendered } from '@/pages/content/export/adapter/chatgptThread';

import { GRANT_MARGIN_MS, type OpContext } from '../opContext';
import { findComposerField, settledConversationId } from './pageReaders';
import {
  allLabels,
  composerSaysProjectChat,
  findProjectModeSwitch,
  projectIdOf,
  projectsDataOf,
  readProjectSwitch,
} from './projectPage';

const SHELL_TIMEOUT_MS = 30_000;
const MODE_SWITCH_TIMEOUT_MS = 5_000;
const SURFACE_MODE_STORAGE_KEY = 'oai/apps/tpp/chat-surface-mode';
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

/** The page's UI language, as evidence: the mode labels cover the languages the site data lists. */
export function readPageLanguage(): string {
  return document.documentElement.lang;
}

function readSurfaceMode(): string | null {
  try {
    return localStorage.getItem(SURFACE_MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function modeLabels(
  adapter: SiteAdapter | null,
  kind: 'composerLabels' | 'switchLabels',
  mode: SwitchableMode,
): readonly string[] {
  const labels: LocalizedLabels | undefined = adapter?.chatModes?.[mode][kind];
  return labels ? allLabels(labels) : [];
}

export function readMode(
  field: HTMLElement,
  adapter: SiteAdapter | null = null,
): { mode: ChatMode; labels: string[] } {
  const labels = composerLabels(field);
  const says = (mode: SwitchableMode): boolean => {
    const known = modeLabels(adapter, 'composerLabels', mode);
    return labels.some((label) => known.includes(label));
  };
  let chat = says('chat');
  const work = says('work');
  const data = projectsDataOf(adapter);
  const modes = adapter?.chatModes;
  if (data && modes && projectIdOf(data) !== null) {
    // A project's new chat names the project in its placeholder.
    chat ||= composerSaysProjectChat(data, labels);
    const pressed = readProjectSwitch(data, modes);
    // Work's own placeholder was not measured: the pressed switch is the evidence.
    if (pressed === 'work') return { mode: 'work', labels };
    if (pressed === 'unknown') chat = false;
  }
  // Contradicting evidence is no evidence.
  const mode: ChatMode = chat && !work ? 'chat' : work && !chat ? 'work' : 'unknown';
  return { mode, labels };
}

/**
 * Switch a project page from Work to chat with its own 「聊天」, once, and wait
 * for the composer to confirm it. The field once confirmed, else a failure.
 */
export async function switchProjectToChat(
  ctx: OpContext,
  adapter: SiteAdapter | null,
  timeoutMs: number,
): Promise<HTMLElement> {
  const data = projectsDataOf(adapter);
  const modes = adapter?.chatModes;
  const control =
    data && modes
      ? await ctx.waitFor(() => findProjectModeSwitch(data, modes), {
          timeoutMs: budget(ctx, Math.min(timeoutMs, MODE_SWITCH_TIMEOUT_MS)),
        })
      : null;
  if (!control) {
    ctx.fail('mode-unavailable', 'The project is in Work mode and its mode switch was not found.', {
      mode: 'work',
      reason: 'project-switch-missing',
    });
  }
  ctx.click(control.chat);
  const field = await ctx.waitFor(
    () => {
      const current = findComposerField(adapter);
      return current && readMode(current, adapter).mode === 'chat' ? current : null;
    },
    { timeoutMs: budget(ctx, timeoutMs) },
  );
  if (!field) {
    ctx.fail('mode-unavailable', 'ChatGPT did not confirm the switch to chat mode.', {
      from: 'work',
      to: 'chat',
      reason: 'project-switch',
    });
  }
  return field;
}

/** The text a person sees (`innerText` skips visually hidden parts; jsdom only has `textContent`). */
function buttonText(button: HTMLElement): string {
  return (button.innerText ?? button.textContent ?? '').trim();
}

/** The one rendered button whose whole text is one of `labels`, else null (none, or ambiguous). */
function uniqueButton(labels: readonly string[]): HTMLButtonElement | null {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(
    (button) => labels.includes(buttonText(button)) && isRendered(button),
  );
  return found.length === 1 ? found[0] : null;
}

/**
 * The page's chat/work switch, only when it has the measured shape: one
 * button per mode, both carrying `data-state` (its values were not measured,
 * so they are not read), close together in one container.
 */
export function findModeSwitch(
  adapter: SiteAdapter | null,
): Readonly<Record<SwitchableMode, HTMLButtonElement>> | null {
  const chat = uniqueButton(modeLabels(adapter, 'switchLabels', 'chat'));
  const work = uniqueButton(modeLabels(adapter, 'switchLabels', 'work'));
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
  let { mode, labels } = readMode(shell.field, adapter);
  const projects = projectsDataOf(adapter);
  const inProject = projects !== null && projectIdOf(projects) !== null;
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
    if (inProject) {
      // A project is only ever switched to chat, and in place.
      if (target !== 'chat') {
        ctx.fail('mode-unavailable', 'The bridge never switches a project to Work mode.', {
          mode: from,
          reason: 'project-work',
          composerLabels: labels,
        });
      }
      const field = await switchProjectToChat(ctx, adapter, MODE_SWITCH_TIMEOUT_MS);
      ({ mode, labels } = readMode(field, adapter));
      return {
        url: location.href,
        conversationId: checkConversation(),
        loggedIn: true,
        mode,
        evidence: {
          composerLabels: labels,
          lang: readPageLanguage(),
          surfaceMode: readSurfaceMode(),
        },
        switchedMode: { from, to: target },
      };
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
    const control = await ctx.waitFor(() => findModeSwitch(adapter), {
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
        return current && readMode(current, adapter).mode === target ? current : null;
      },
      { timeoutMs: budget(ctx, MODE_SWITCH_TIMEOUT_MS) },
    );
    if (!field) {
      ctx.fail('mode-unavailable', `ChatGPT did not confirm the switch to ${target} mode.`, {
        from,
        to: target,
      });
    }
    ({ mode, labels } = readMode(field, adapter));
    switchedMode = { from, to: target };
  }
  return {
    url: location.href,
    conversationId: checkConversation(),
    loggedIn: true,
    mode,
    evidence: { composerLabels: labels, lang: readPageLanguage(), surfaceMode: readSurfaceMode() },
    ...(switchedMode ? { switchedMode } : {}),
  };
}
