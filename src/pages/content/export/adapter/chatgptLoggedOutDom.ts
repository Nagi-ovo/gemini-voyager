import { isRendered } from './chatgptThread';

/**
 * ChatGPT's logged-out conversation page (`/uc/<id>`). It is served to anyone
 * without an account, at desktop widths as well as on phones; logged-in
 * ChatGPT on a phone keeps the desktop thread (`/c/<id>`, `[data-turn-key]`).
 */
export const LOGGED_OUT_THREAD_SELECTOR = '[data-mobile-thread]';
export const LOGGED_OUT_MESSAGE_SELECTOR =
  '[data-message-role="user"], [data-message-role="assistant"]';
export const LOGGED_OUT_ASSISTANT_SELECTOR = '[data-assistant-markdown-root]';

/** Keep page detection independent of the reader's Library and export services. */
export function resolveChatGptLoggedOutThread(doc: Document = document): HTMLElement | null {
  return (
    Array.from(doc.querySelectorAll<HTMLElement>(LOGGED_OUT_THREAD_SELECTOR)).find(isRendered) ??
    null
  );
}
