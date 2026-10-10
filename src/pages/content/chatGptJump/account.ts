import { hashValue } from '@/core/utils/canonicalHash';
import {
  CHATGPT_JUMP_ACCOUNT_MESSAGE,
  CHATGPT_JUMP_ACCOUNT_TIMEOUT_MS,
} from '@/features/savedLibrary/chatGptJumpMessages';

const EXTENSION_PAGES = ['src/pages/library/index.html', 'src/pages/popup/index.html'];

type AccountResponse = { ok: true; account: string } | { ok: false };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || typeof sender.url !== 'string') return false;
  try {
    const url = new URL(sender.url);
    return EXTENSION_PAGES.some((path) => {
      const expected = new URL(chrome.runtime.getURL(path));
      return (
        url.protocol === expected.protocol &&
        url.host === expected.host &&
        !url.username &&
        !url.password &&
        url.pathname === expected.pathname
      );
    });
  } catch {
    return false;
  }
}

function sessionIds(session: unknown): [string, string] | null {
  const data = record(session);
  const userId = record(data?.user)?.id;
  const accountId = record(data?.account)?.id;
  return typeof userId === 'string' && userId && typeof accountId === 'string' && accountId
    ? [userId, accountId]
    : null;
}

async function readAccount(signal: AbortSignal): Promise<AccountResponse> {
  const response = await fetch('/api/auth/session', {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) return { ok: false };
  // The session includes credentials: only the two opaque IDs survive this read.
  const ids = sessionIds(await response.json());
  if (!ids) return { ok: false };
  return { ok: true, account: `chatgpt:${await hashValue(ids)}` };
}

/** Only extension UI may request identity; the token-bearing response stays in this script. */
export function startChatGptJumpAccountListener(): () => void {
  const pending = new Set<AbortController>();
  let stopped = false;
  const listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: AccountResponse) => void,
  ): true | undefined => {
    if (record(message)?.type !== CHATGPT_JUMP_ACCOUNT_MESSAGE || !trustedSender(sender)) return;
    const controller = new AbortController();
    pending.add(controller);
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<AccountResponse>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve({ ok: false }), { once: true });
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false });
      }, CHATGPT_JUMP_ACCOUNT_TIMEOUT_MS);
    });
    void Promise.race([
      readAccount(controller.signal).catch(() => ({ ok: false }) as const),
      timeout,
    ])
      .then((response) => {
        if (!stopped) sendResponse(response);
      })
      .finally(() => {
        clearTimeout(timer);
        pending.delete(controller);
      });
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => {
    stopped = true;
    for (const controller of pending) controller.abort();
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch {
      // An updated extension can invalidate the context before page teardown.
    }
  };
}
