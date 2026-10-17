/**
 * The ChatGPT tab the bridge works in (spec §3.1). Only the background opens
 * and closes it, so the page itself never navigates with `location.*`. One tab
 * is recorded at a time (`gvBridgeTab` in session storage); its document is
 * identified by the `docNonce` its content script reports in `gv.bridge.hello`,
 * plus Chrome's `documentId` where the browser has one.
 */
import type { BridgeTabRecord, BridgeTaskStore } from './bridgeTaskStore';

export const CHATGPT_BRIDGE_ORIGIN = 'https://chatgpt.com';

export interface TabsApi {
  create(props: { url: string; active: boolean }): Promise<{ id?: number } | undefined>;
  remove(tabId: number): Promise<void>;
  get(tabId: number): Promise<{ id?: number; active?: boolean; url?: string } | undefined>;
  sendMessage(tabId: number, message: unknown, options?: { documentId?: string }): Promise<unknown>;
}

/** The page a document runs in: its tab, nonce and (Chrome only) documentId. */
export interface ContentHolder {
  readonly tabId: number;
  readonly docNonce: string;
  readonly documentId?: string;
}

export function conversationUrl(conversationId?: string): string {
  return conversationId
    ? `${CHATGPT_BRIDGE_ORIGIN}/c/${encodeURIComponent(conversationId)}`
    : `${CHATGPT_BRIDGE_ORIGIN}/`;
}

export function isChatGptPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'chatgpt.com' && !parsed.port;
  } catch {
    return false;
  }
}

/** Our own content script in the top frame of a chatgpt.com tab. */
export function isBridgeContentSender(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    sender.frameId === 0 &&
    typeof sender.tab?.id === 'number' &&
    isChatGptPageUrl(sender.tab.url ?? sender.url)
  );
}

/** The sender is the document that holds the task (tab, nonce, and documentId when both know it). */
export function senderIsHolder(
  sender: chrome.runtime.MessageSender,
  docNonce: unknown,
  holder: Partial<ContentHolder>,
): boolean {
  if (!isBridgeContentSender(sender)) return false;
  if (holder.tabId === undefined || sender.tab?.id !== holder.tabId) return false;
  if (typeof docNonce !== 'string' || docNonce !== holder.docNonce) return false;
  const documentId = (sender as { documentId?: string }).documentId;
  return !holder.documentId || !documentId || holder.documentId === documentId;
}

export interface BridgeTabs {
  /** Open a fresh tab for `jobId` and record it as the bridge tab. */
  open(jobId: string, url: string, active: boolean): Promise<number>;
  /** False when the tab was already gone. */
  close(tabId: number): Promise<boolean>;
  isActive(tabId: number): Promise<boolean>;
  exists(tabId: number): Promise<boolean>;
  send(holder: ContentHolder, message: unknown): Promise<unknown>;
  /** Ask whatever document the tab holds to say hello again; never throws. */
  requestHello(tabId: number): Promise<void>;
  /**
   * A hello from the recorded bridge tab: store its document identity. Returns
   * the record as it was before, or null when the sender is not the bridge tab.
   */
  acceptHello(
    sender: chrome.runtime.MessageSender,
    docNonce: string,
  ): Promise<{ previous: BridgeTabRecord; current: BridgeTabRecord } | null>;
}

export function createBridgeTabs(deps: {
  readonly store: BridgeTaskStore;
  readonly api: TabsApi;
  readonly now?: () => number;
}): BridgeTabs {
  const now = deps.now ?? (() => Date.now());
  const { store, api } = deps;
  const tabOf = async (tabId: number) => {
    try {
      return await api.get(tabId);
    } catch {
      return undefined;
    }
  };

  return {
    open: async (jobId, url, active) => {
      const tab = await api.create({ url, active });
      if (typeof tab?.id !== 'number') throw new Error('The browser did not open a tab.');
      await store.setTab({ tabId: tab.id, jobId, openedAt: now() });
      return tab.id;
    },
    close: async (tabId) => {
      await store.clearTab(tabId);
      if (!(await tabOf(tabId))) return false;
      try {
        await api.remove(tabId);
        return true;
      } catch {
        return false;
      }
    },
    isActive: async (tabId) => (await tabOf(tabId))?.active === true,
    exists: async (tabId) => (await tabOf(tabId)) !== undefined,
    send: (holder, message) =>
      api.sendMessage(
        holder.tabId,
        message,
        holder.documentId ? { documentId: holder.documentId } : undefined,
      ),
    requestHello: async (tabId) => {
      try {
        await api.sendMessage(tabId, { type: 'gv.bridge.hello.request' });
      } catch {
        // Not loaded yet: its own hello follows once the bridge mounts.
      }
    },
    acceptHello: async (sender, docNonce) => {
      if (!isBridgeContentSender(sender)) return null;
      const previous = await store.getTab();
      if (!previous || previous.tabId !== sender.tab?.id) return null;
      const documentId = (sender as { documentId?: string }).documentId;
      const current: BridgeTabRecord = {
        tabId: previous.tabId,
        jobId: previous.jobId,
        openedAt: previous.openedAt,
        docNonce,
        ...(documentId ? { documentId } : {}),
      };
      await store.setTab(current);
      return { previous, current };
    },
  };
}
