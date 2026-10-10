import { CHATGPT_EXPORT_OPEN_MESSAGE, type ChatGptExportOpenResponse } from './openMessage';

/**
 * Answer the popup's "export this conversation" request while the exporter is
 * mounted. `open` returns false when no export entry is mounted on this page.
 * Returns the teardown that removes the listener.
 */
export function startChatGptExportOpenListener(open: () => boolean): () => void {
  const listener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ChatGptExportOpenResponse) => void,
  ): void => {
    if ((message as { type?: unknown } | null)?.type !== CHATGPT_EXPORT_OPEN_MESSAGE) return;
    sendResponse(open() ? { ok: true } : { ok: false, reason: 'no-conversation' });
  };

  try {
    chrome.runtime?.onMessage?.addListener(listener);
  } catch {
    // The extension context may already be invalidated; nothing to tear down.
    return () => {};
  }
  return () => {
    try {
      chrome.runtime?.onMessage?.removeListener(listener);
    } catch {
      // The extension may have been reloaded while the page stayed open.
    }
  };
}
