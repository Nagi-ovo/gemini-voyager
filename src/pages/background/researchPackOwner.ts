/**
 * Background owner of research-pack writes. Every Gemini tab sends its edits
 * here, and one queue applies them against the latest stored pack, so two
 * tabs adding at the same moment both keep their item.
 */
import {
  handleResearchPackApplyMessage,
  isResearchPackApplyMessage,
} from '@/features/researchPack/services/packMessages';
import { createResearchPackOwner } from '@/features/researchPack/services/packStore';

import { startResearchPackHandoff } from './researchPackHandoff';
import { getSenderPageUrl, isAllowedSyncContentSender } from './runtimeMessageRouting';

/**
 * This extension's content script on a Gemini page. The page is the tab URL, or the sending
 * frame's URL when Firefox/Safari omit it. The content script only runs in the top frame
 * (no `all_frames`), so a sender that reports a subframe is refused.
 */
export function isAllowedResearchPackSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  if (sender.frameId !== undefined && sender.frameId !== 0) return false;
  return isAllowedSyncContentSender(getSenderPageUrl(sender), 'gemini');
}

export function startResearchPackOwner(): void {
  const owner = createResearchPackOwner({
    area: {
      get: (key) => chrome.storage.local.get(key),
      set: (items) => chrome.storage.local.set(items),
    },
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isResearchPackApplyMessage(message)) return undefined;
    if (!isAllowedResearchPackSender(sender)) {
      sendResponse({ ok: false, error: 'sender_not_allowed' });
      return undefined;
    }
    void handleResearchPackApplyMessage(message, owner).then(sendResponse);
    return true;
  });

  // "Continue in ChatGPT / Claude" carries the pack to another site's new chat.
  startResearchPackHandoff(isAllowedResearchPackSender);
}
