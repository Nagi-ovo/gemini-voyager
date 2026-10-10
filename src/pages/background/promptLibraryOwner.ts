/**
 * Background owner of prompt-library writes. Writers send their changes here
 * and one queue applies them against the latest stored library; the Drive
 * prompt merges in this worker go through the same queue directly.
 */
import {
  handlePromptLibraryApplyMessage,
  isPromptLibraryApplyMessage,
} from '@/features/prompt/library/promptLibraryMessages';
import { createPromptLibraryOwner } from '@/features/prompt/library/promptLibraryOwner';
import { backgroundWriteQueue } from '@/features/storage/writeQueue';

import { isTrustedExtensionPageSender } from './runtimeMessageRouting';

export const promptLibraryOwner = createPromptLibraryOwner({
  area: {
    get: (key) => chrome.storage.local.get(key),
    set: (items) => chrome.storage.local.set(items),
  },
  serialize: backgroundWriteQueue,
});

/**
 * Accepts any of this extension's own pages, plus any other context carrying
 * this extension's id whose `frameId` is 0 or missing. There is no URL or
 * origin check: Prompt Manager also runs on custom sites and plugin platforms,
 * whose content scripts are registered at runtime for whatever origins the
 * user granted, so the allowed hosts are not a fixed list to compare against.
 * A missing `frameId` (Safari) cannot prove a top frame; Prompt Manager itself
 * only starts in top frames. Web pages and other extensions cannot send with
 * this id (they reach `onMessageExternal`), and a content script could write
 * the key directly, so this guards against mistakes, not a hostile sender.
 * Firefox without tab access leaves `tab` out.
 */
export function isAllowedPromptLibrarySender(sender: chrome.runtime.MessageSender): boolean {
  if (isTrustedExtensionPageSender(sender)) return true;
  if (sender.id !== chrome.runtime.id) return false;
  return sender.frameId === undefined || sender.frameId === 0;
}

export function startPromptLibraryOwner(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isPromptLibraryApplyMessage(message)) return undefined;
    if (!isAllowedPromptLibrarySender(sender)) {
      sendResponse({ ok: false, error: 'sender_not_allowed' });
      return undefined;
    }
    void handlePromptLibraryApplyMessage(message, promptLibraryOwner).then(sendResponse);
    return true;
  });
}
