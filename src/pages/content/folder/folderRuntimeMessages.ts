import browser, { type Runtime } from 'webextension-polyfill';

import type { AccountScope } from '@/core/services/AccountIsolationService';

import { folderDebug, folderDebugWarn } from './folderManagerDebug';
import { type NativeSidebarReadContext, collectAllSidebarConversations } from './nativeSidebarDom';
import { createSyncMessageListener } from './syncMessageListener';
import type { FolderData } from './types';

type SendResponse = (response: unknown) => void;

/** The folders the answers read, and their reload. */
export interface FolderRuntimeMessageStore {
  readonly canEdit: boolean;
  readonly data: FolderData;
  readonly accountScope: AccountScope | null;
  /** False while the folders belong to another account than the page's: nothing is answered. */
  readonly accountMatchesPage?: boolean;
  loadData(): Promise<void>;
  /** Binds the page's account first when it can, before a cloud request is answered; null when nothing to do. */
  prepareRequest?(): Promise<void> | null;
}

type FolderRuntimeMessageOptions = {
  store: FolderRuntimeMessageStore;
  refresh(): void;
  getSidebarContext(): NativeSidebarReadContext;
};

// Collects all conversations and the folder structure for AI organization.
function respondWithStructureForAI(
  options: FolderRuntimeMessageOptions,
  sendResponse: SendResponse,
): true {
  const { store } = options;
  folderDebug('Received AI structure request');
  // Another account's folders, or none, must not seed a prompt whose answer is imported here.
  if (store.accountMatchesPage === false) {
    sendResponse({ ok: false });
    return true;
  }
  collectAllSidebarConversations(options.getSidebarContext)
    .then((sidebarConversations) => {
      sendResponse({ ok: true, sidebarConversations, folderData: store.data });
    })
    .catch((error) => {
      folderDebugWarn('getStructureForAI collection failed:', error);
      sendResponse({ ok: true, sidebarConversations: [], folderData: store.data });
    });
  return true; // respond asynchronously after rows populate
}

/** Answers the popup's folder requests; returns the listener's removal. */
export function listenForFolderRuntimeMessages(options: FolderRuntimeMessageOptions): () => void {
  const { store } = options;
  // The popup's cloud sync. This is the single handler for `gv.folders.reload`
  // (a duplicate storage-listener handler used to double-process every sync).
  const sync = createSyncMessageListener({
    canEdit: () => store.canEdit,
    data: () => store.data,
    accountScope: () => store.accountScope,
    reload: () => store.loadData().then(() => options.refresh()),
    prepare: () => store.prepareRequest?.() ?? null,
  });
  const listener = (
    message: unknown,
    sender: Runtime.MessageSender,
    sendResponse: SendResponse,
  ): true | undefined => {
    if ((message as { type?: unknown } | null)?.type === 'gv.folders.getStructureForAI') {
      return respondWithStructureForAI(options, sendResponse);
    }
    return sync(message, sender, sendResponse);
  };
  // The polyfill's OnMessageListener typing cannot express "sync-respond to
  // some messages, ignore the rest" (its callback variant requires a constant
  // `true` return). Runtime behavior is well-defined for both values, so
  // cast: `true` keeps the channel open for handled messages, `undefined`
  // closes it for unknown ones.
  const callback = listener as Runtime.OnMessageListenerCallback;
  browser.runtime.onMessage.addListener(callback);
  return () => browser.runtime.onMessage.removeListener(callback);
}
