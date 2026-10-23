/**
 * The ChatGPT tabs the bridge works in (spec §3.1). Only the background opens
 * and closes them, so the page itself never navigates with `location.*`. Each
 * job works in the tab its own `conversation.open` created (`gvBridgeTabs` in
 * session storage), so jobs that run side by side never share a page; a tab's
 * document is identified by the `docNonce` its content script reports in
 * `gv.bridge.hello`, plus Chrome's `documentId` where the browser has one.
 */
import type { BridgeTabRecord, BridgeTaskStore } from './bridgeTaskStore';

export const CHATGPT_BRIDGE_ORIGIN = 'https://chatgpt.com';

export interface TabsApi {
  create(props: { url: string; active: boolean }): Promise<{ id?: number } | undefined>;
  remove(tabId: number): Promise<void>;
  /** `frozen` only where the browser reports it (Chrome 132 and later). */
  get(tabId: number): Promise<{ id?: number; url?: string; frozen?: boolean } | undefined>;
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
  /**
   * Open a fresh tab for `jobId` and record it as that job's current tab; `parallel`: the
   * job was admitted beside other jobs.
   */
  open(
    jobId: string,
    url: string,
    active: boolean,
    options?: { readonly parallel?: boolean },
  ): Promise<number>;
  /** False when the tab was already gone. */
  close(tabId: number): Promise<boolean>;
  exists(tabId: number): Promise<boolean>;
  /** The browser froze the tab (it runs no task until it thaws); false where it cannot say. */
  isFrozen(tabId: number): Promise<boolean>;
  send(holder: ContentHolder, message: unknown): Promise<unknown>;
  /** Ask whatever document the tab holds to say hello again; never throws. */
  requestHello(tabId: number): Promise<void>;
  /**
   * A hello from a recorded bridge tab: store its document identity. Returns
   * the record as it was before, or null when the sender is not a bridge tab.
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
    open: async (jobId, url, active, options) => {
      const tab = await api.create({ url, active });
      if (typeof tab?.id !== 'number') throw new Error('The browser did not open a tab.');
      await store.setTab({ tabId: tab.id, jobId, openedAt: now() }, options);
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
    exists: async (tabId) => (await tabOf(tabId)) !== undefined,
    isFrozen: async (tabId) => (await tabOf(tabId))?.frozen === true,
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
      const tabId = sender.tab?.id;
      if (!isBridgeContentSender(sender) || tabId === undefined) return null;
      const previous = await store.getTab(tabId);
      if (!previous) return null;
      const documentId = (sender as { documentId?: string }).documentId;
      // Only the document identity changes; the tab's own state (restoreMode) outlives a
      // remount's hello, or the close would skip switching the mode back.
      const { docNonce: _oldNonce, documentId: _oldDocumentId, ...tabState } = previous;
      const current: BridgeTabRecord = {
        ...tabState,
        docNonce,
        ...(documentId ? { documentId } : {}),
      };
      await store.setTab(current);
      return { previous, current };
    },
  };
}
