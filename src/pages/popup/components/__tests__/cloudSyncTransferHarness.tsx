import React, { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import type { FolderData } from '@/core/types/folder';
import type { SyncAccountScope, SyncPlatform } from '@/core/types/sync';
import {
  handlePromptLibraryApplyMessage,
  isPromptLibraryApplyMessage,
} from '@/features/prompt/library/promptLibraryMessages';
import {
  createPromptLibraryOwner,
  type PromptLibraryOwner,
} from '@/features/prompt/library/promptLibraryOwner';
import { createStarStore, type StarStore } from '@/features/savedLibrary/starStore';
import { createForkMessagesOwner } from '@/pages/background/forkMessages';
import { createStarredMessagesHandler } from '@/pages/background/starredMessages';

import { useCloudSyncTransfer } from '../useCloudSyncTransfer';

export const pageScope: SyncAccountScope = { accountKey: 'page', accountId: 1, routeUserId: '1' };
export const tabScope: SyncAccountScope = { accountKey: 'tab', accountId: 2, routeUserId: '2' };
/** What the tab's account bridge reports: Gemini's route slot and its account control's email. */
export const pageContext = { routeUserId: '1', email: 'page@example.com' };
export const emptyFolders: FolderData = { folders: [], folderContents: {} };
export const folders: FolderData = {
  folders: [
    { id: 'local', name: 'Local', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: {},
};

const getTargetTab = async () =>
  ({ id: 7, url: 'https://gemini.google.com/u/1/app' }) as chrome.tabs.Tab;

export type Transfer = ReturnType<typeof useCloudSyncTransfer>;

function Harness({
  platform,
  includeHighlights,
  capture,
}: {
  platform: SyncPlatform;
  includeHighlights: boolean;
  capture: (transfer: Transfer) => void;
}) {
  const transfer = useCloudSyncTransfer(platform, includeHighlights, getTargetTab);
  useEffect(() => {
    capture(transfer);
  }, [transfer, capture]);
  return null;
}

export interface TransferHarness {
  transfer: Transfer;
  stored: Record<string, unknown>;
  starStore: StarStore;
  promptOwner: PromptLibraryOwner;
  forkOwner: ReturnType<typeof createForkMessagesOwner>;
  readonly tabMessage: ReturnType<
    typeof vi.fn<(tabId: number, message: { type: string }) => Promise<unknown>>
  >;
  readonly localGet: ReturnType<typeof vi.fn<(keys: unknown) => Promise<Record<string, unknown>>>>;
  readonly localSet: ReturnType<typeof vi.fn<(items: Record<string, unknown>) => Promise<void>>>;
  render: (platform?: SyncPlatform, includeHighlights?: boolean) => Promise<void>;
}

/**
 * Mounts the hook against an in-memory `chrome.storage.local` and the real
 * prompt, star and fork owners, with the tab on `pageScope` by default.
 */
export function setupTransferHarness(): TransferHarness {
  let root: Root;
  let container: HTMLDivElement;
  const h = {
    tabMessage: vi.fn<(tabId: number, message: { type: string }) => Promise<unknown>>(),
    localGet: vi.fn<(keys: unknown) => Promise<Record<string, unknown>>>(),
    localSet: vi.fn<(items: Record<string, unknown>) => Promise<void>>(),
    render: async (platform: SyncPlatform = 'gemini', includeHighlights = true) => {
      await act(async () =>
        root.render(
          <Harness
            platform={platform}
            includeHighlights={includeHighlights}
            capture={(next) => (h.transfer = next)}
          />,
        ),
      );
    },
  } as TransferHarness;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(true);
    vi.spyOn(accountIsolationService, 'resolveAccountScope').mockResolvedValue({
      ...pageScope,
      emailHash: null,
    });
    h.tabMessage.mockImplementation(async (_tabId, message) =>
      message.type === 'gv.account.getContext' ? { ok: true, context: pageContext } : { ok: false },
    );
    h.stored = {};
    h.localGet.mockImplementation(async (keys) => {
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.map((name) => [String(name), h.stored[String(name)]]));
    });
    h.localSet.mockImplementation(async (items) => {
      Object.assign(h.stored, structuredClone(items));
    });
    const area = { get: h.localGet, set: h.localSet };
    h.starStore = createStarStore(area);
    h.promptOwner = createPromptLibraryOwner({ area });
    h.forkOwner = createForkMessagesOwner(area);
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        getURL: (path: string) => `chrome-extension://test/${path}`,
        sendMessage: (
          message: { type: string; payload?: unknown },
          reply?: (response: unknown) => void,
        ) => {
          if (isPromptLibraryApplyMessage(message)) {
            return handlePromptLibraryApplyMessage(message, h.promptOwner);
          }
          void (
            h.forkOwner.handle(message) ??
            createStarredMessagesHandler(h.starStore)(message, {
              id: 'test',
              url: 'chrome-extension://test/src/pages/popup/index.html',
            })
          )?.then(
            (result) => reply?.({ ok: true, ...result }),
            (error: Error) => reply?.({ ok: false, error: error.message }),
          );
          return undefined;
        },
      },
      tabs: { sendMessage: h.tabMessage },
      storage: {
        local: { get: h.localGet, set: h.localSet },
        sync: { get: vi.fn().mockResolvedValue({}) },
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  return h;
}
