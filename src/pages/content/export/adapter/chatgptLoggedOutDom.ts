import { TURN_ITEM_SELECTOR, isRendered } from './chatgptThread';

/**
 * ChatGPT's logged-out conversation page (`/uc/<id>`). It is served to anyone
 * without an account, at desktop widths as well as on phones; logged-in
 * ChatGPT on a phone keeps the desktop thread (`/c/<id>`, `[data-turn-key]`).
 */
export const LOGGED_OUT_THREAD_SELECTOR = '[data-mobile-thread]';
export const LOGGED_OUT_MESSAGE_SELECTOR =
  '[data-message-role="user"], [data-message-role="assistant"]';
export const LOGGED_OUT_ASSISTANT_SELECTOR = '[data-assistant-markdown-root]';

/** A desktop turn ChatGPT has rendered: the virtual list's items or the earlier DOM's containers. */
export const DESKTOP_TURN_SELECTOR = [
  TURN_ITEM_SELECTOR,
  // The earlier DOM, for accounts ChatGPT has not moved yet.
  '[data-turn-id-container] [data-message-author-role]',
  '[data-turn-id-container][data-turn]',
  'section[data-turn]',
].join(', ');

/** Keep page detection independent of the reader's Library and export services. */
export function resolveChatGptLoggedOutThread(doc: Document = document): HTMLElement | null {
  return (
    Array.from(doc.querySelectorAll<HTMLElement>(LOGGED_OUT_THREAD_SELECTOR)).find(isRendered) ??
    null
  );
}

export type ChatGptThreadKind = 'desktop' | 'loggedOut';

/**
 * Which thread the page shows, or null while neither has rendered a message
 * (an empty logged-out wrapper still mounting its messages, say). A desktop
 * turn wins: its reader also crawls the virtual list's unmounted history,
 * which the logged-out reader would never see.
 */
export function readChatGptThreadKind(doc: Document = document): ChatGptThreadKind | null {
  if (Array.from(doc.querySelectorAll(DESKTOP_TURN_SELECTOR)).some(isRendered)) return 'desktop';
  const thread = resolveChatGptLoggedOutThread(doc);
  return thread?.querySelector(LOGGED_OUT_MESSAGE_SELECTOR) ? 'loggedOut' : null;
}

/** Whether the page shows the logged-out page's messages and no desktop thread. */
export function isChatGptLoggedOutConversation(doc: Document = document): boolean {
  return readChatGptThreadKind(doc) === 'loggedOut';
}
