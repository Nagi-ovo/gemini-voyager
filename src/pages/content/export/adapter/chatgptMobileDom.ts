import { isRendered } from './chatgptThread';

export const MOBILE_THREAD_SELECTOR = '[data-mobile-thread]';
export const MOBILE_MESSAGE_SELECTOR =
  '[data-message-role="user"], [data-message-role="assistant"]';
export const MOBILE_ASSISTANT_SELECTOR = '[data-assistant-markdown-root]';

/** Keep page detection independent of the reader's Library and export services. */
export function resolveChatGptMobileThread(doc: Document = document): HTMLElement | null {
  return (
    Array.from(doc.querySelectorAll<HTMLElement>(MOBILE_THREAD_SELECTOR)).find(isRendered) ?? null
  );
}
