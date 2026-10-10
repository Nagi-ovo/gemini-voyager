/**
 * Background side of "Continue in ChatGPT / Claude" (see
 * `features/researchPack/services/handoff.ts`). Opens the new chat tab, keeps
 * the one-shot record for it, and hands the record to Voyager's content script
 * on that tab once.
 */
import browser from 'webextension-polyfill';

import { matchesAnyPattern } from '@/features/plugins/sites/matchPattern';
import {
  HANDOFF_MESSAGES,
  HANDOFF_TARGETS,
  type HandoffBroker,
  type HandoffStorageArea,
  type HandoffTarget,
  createHandoffBroker,
  handoffAlarmName,
  isTabId,
  parseHandoffMessage,
  tabIdFromHandoffAlarm,
} from '@/features/researchPack/services/handoff';

import { getSenderPageUrl } from './runtimeMessageRouting';

/** Whether a sender is Voyager's content script on a Gemini page (the research pack owner's rule). */
export type GeminiSenderCheck = (sender: chrome.runtime.MessageSender) => boolean;

/**
 * `storage.session` keeps the pack in memory only, gone when the browser
 * closes, and at its default access level out of reach of content scripts, so
 * a page can only get it by claiming through this owner. There is no
 * `storage.local` fallback: plaintext there would outlive a failed alarm and a
 * browser restart. Chrome before 102 and Safari before 16.4 lack it (Firefox
 * has it from 115, our floor); they get null and take the clipboard path.
 */
export function handoffArea(
  storage: typeof chrome.storage = chrome.storage,
): HandoffStorageArea | null {
  const area = (storage as { session?: chrome.storage.StorageArea }).session;
  if (!area) return null;
  return {
    get: (keys) => area.get(keys),
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
  };
}

/**
 * Voyager runs on the target only when its host permission is granted and a
 * registered content script covers the new-chat page (the plugin or Prompt
 * Manager registration). Anything uncertain reads as "not ready", which sends
 * the user down the clipboard path instead of to a record nobody claims.
 */
export interface ReceiverReadinessApi {
  containsOrigin: (origin: string) => Promise<boolean>;
  /** Undefined when the browser cannot list registered content scripts. */
  registeredMatches: () => Promise<(readonly string[])[] | undefined>;
}

const browserReadinessApi: ReceiverReadinessApi = {
  containsOrigin: (origin) => browser.permissions.contains({ origins: [origin] }),
  registeredMatches: async () => {
    if (typeof chrome.scripting?.getRegisteredContentScripts !== 'function') return undefined;
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    return scripts.map((script) => script.matches ?? []);
  },
};

export async function isHandoffReceiverReady(
  target: HandoffTarget,
  api: ReceiverReadinessApi = browserReadinessApi,
): Promise<boolean> {
  const { origin, newChatUrl } = HANDOFF_TARGETS[target];
  if (!(await api.containsOrigin(origin))) return false;
  const registrations = await api.registeredMatches();
  return (registrations ?? []).some((matches) => matchesAnyPattern(newChatUrl, matches));
}

/** The top frame of Voyager's own content script on a handoff target's tab. */
function senderTabId(sender: chrome.runtime.MessageSender): number | null {
  if (sender.id !== chrome.runtime.id) return null;
  if (sender.frameId !== undefined && sender.frameId !== 0) return null;
  return isTabId(sender.tab?.id) ? sender.tab.id : null;
}

export function handleResearchPackHandoffMessage(
  broker: HandoffBroker,
  message: unknown,
  sender: chrome.runtime.MessageSender,
  isGeminiSender: GeminiSenderCheck,
): Promise<unknown> | null {
  const parsed = parseHandoffMessage(message);
  if (!parsed) return null;
  switch (parsed.type) {
    case HANDOFF_MESSAGES.status:
      if (!isGeminiSender(sender)) return Promise.resolve({ ok: false });
      return broker.status();
    case HANDOFF_MESSAGES.open:
      if (!isGeminiSender(sender)) {
        return Promise.resolve({ ok: false, reason: 'sender_not_allowed' });
      }
      return broker.open(parsed.target, parsed.markdown, {
        tabId: sender.tab?.id,
        index: sender.tab?.index,
        windowId: sender.tab?.windowId,
      });
    case HANDOFF_MESSAGES.peek:
    case HANDOFF_MESSAGES.claim: {
      const tabId = senderTabId(sender);
      if (tabId === null) return Promise.resolve({ ok: false });
      const pageUrl = getSenderPageUrl(sender);
      return parsed.type === HANDOFF_MESSAGES.peek
        ? broker.peek(tabId, pageUrl).then((pending) => ({ ok: true, pending }))
        : broker.claim(tabId, pageUrl);
    }
  }
}

export function startResearchPackHandoff(isGeminiSender: GeminiSenderCheck): void {
  const broker = createHandoffBroker({
    area: handoffArea(),
    isReceiverReady: isHandoffReceiverReady,
    openTab: async (url, opener) => {
      const tab = await chrome.tabs.create({
        url,
        active: true,
        ...(isTabId(opener.tabId) ? { openerTabId: opener.tabId } : {}),
        ...(isTabId(opener.index) ? { index: opener.index + 1 } : {}),
        ...(isTabId(opener.windowId) ? { windowId: opener.windowId } : {}),
      });
      return tab.id;
    },
    scheduleExpiry: async (tabId, when) => {
      await chrome.alarms?.create?.(handoffAlarmName(tabId), { when });
    },
    clearExpiry: async (tabId) => {
      await chrome.alarms?.clear?.(handoffAlarmName(tabId));
    },
  });

  void broker.sweep().catch(() => undefined);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const pending = handleResearchPackHandoffMessage(broker, message, sender, isGeminiSender);
    if (!pending) return undefined;
    void pending.then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  });

  chrome.alarms?.onAlarm?.addListener((alarm) => {
    const tabId = tabIdFromHandoffAlarm(alarm.name);
    if (tabId !== null) void broker.expire(tabId).catch(() => undefined);
  });

  chrome.tabs?.onRemoved?.addListener((tabId) => {
    void broker.discard(tabId).catch(() => undefined);
  });
}
