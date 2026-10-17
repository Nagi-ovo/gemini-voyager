/**
 * `conversation.ready` (spec §3.4): wait for the app shell, then report login
 * and mode. Read-only: it never clicks or types.
 *
 * Mode is decided only from positive evidence. Phase B has no `modelPicker`
 * site data yet, so the composer labels below are the measured fallback
 * (zh-CN UI); any other label reads as `unknown`. ChatGPT's own
 * `oai/apps/tpp/chat-surface-mode` value is recorded but never interpreted:
 * its values were not measured.
 */
import type {
  ChatMode,
  ConversationReadyParams,
  ConversationReadyResult,
} from '@/features/bridge/protocol';
import type { SiteAdapter } from '@/features/plugins/types';

import type { OpContext } from '../opContext';
import { findComposerField, settledConversationId } from './pageReaders';

const SHELL_TIMEOUT_MS = 30_000;
const SURFACE_MODE_STORAGE_KEY = 'oai/apps/tpp/chat-surface-mode';
// Measured on 2026-10-17; replace with `modelPicker.modes.*` once that site data lands.
const MODE_COMPOSER_LABELS: Readonly<Record<'chat' | 'work', readonly string[]>> = {
  chat: ['询问 ChatGPT'],
  work: ['使用 ChatGPT Work'],
};
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
  const says = (mode: 'chat' | 'work'): boolean =>
    labels.some((label) => MODE_COMPOSER_LABELS[mode].includes(label));
  const chat = says('chat');
  const work = says('work');
  // Contradicting evidence is no evidence.
  const mode: ChatMode = chat && !work ? 'chat' : work && !chat ? 'work' : 'unknown';
  return { mode, labels };
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
    { timeoutMs: SHELL_TIMEOUT_MS },
  );
  if (!shell) ctx.fail('timeout', 'The ChatGPT composer did not appear.');
  if (!shell.field) ctx.fail('login-required', 'ChatGPT is not signed in on this tab.');

  const conversationId = settledConversationId();
  const expected = params.expect?.conversationId;
  if (expected !== undefined && expected !== conversationId) {
    ctx.fail('unverified', 'The tab shows another conversation.', {
      expected,
      actual: conversationId,
    });
  }
  const { mode, labels } = readMode(shell.field);
  return {
    url: location.href,
    conversationId,
    loggedIn: true,
    mode,
    evidence: { composerLabels: labels, surfaceMode: readSurfaceMode() },
  };
}
