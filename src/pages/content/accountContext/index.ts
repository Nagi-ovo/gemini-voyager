import { detectAccountContextFromDocument } from '@/core/services/AccountIsolationService';

type AccountContextRequest = { type?: unknown } | null;

/**
 * Keep account discovery available independently of optional Gemini features.
 * Popup surfaces such as Saved Library must not depend on Folder Manager being
 * enabled just to learn which account owns the current page.
 */
export function startAccountContextBridge(): () => void {
  const listener = (
    message: AccountContextRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): void => {
    if (message?.type !== 'gv.account.getContext') return;
    sendResponse({
      ok: true,
      context: detectAccountContextFromDocument(window.location.href, document),
    });
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => {
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch {
      // The extension may have been reloaded while the page stayed open.
    }
  };
}
