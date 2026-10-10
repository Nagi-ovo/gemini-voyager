import React, { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  accountIsolationService,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import type { SyncAccountScope, SyncPlatform } from '@/core/types/sync';
import { hashString } from '@/core/utils/hash';
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
import type { ForkNode } from '@/pages/content/fork/forkTypes';
import { getTimelineHierarchyStorageKey } from '@/pages/content/timeline/hierarchyStorage';

import { useCloudSyncTransfer } from '../useCloudSyncTransfer';

const pageScope: SyncAccountScope = { accountKey: 'page', accountId: 1, routeUserId: '1' };
const tabScope: SyncAccountScope = { accountKey: 'tab', accountId: 2, routeUserId: '2' };
const getTargetTab = async () =>
  ({ id: 7, url: 'https://gemini.google.com/u/1/app' }) as chrome.tabs.Tab;
const emptyFolders: FolderData = { folders: [], folderContents: {} };
const folders: FolderData = {
  folders: [
    { id: 'local', name: 'Local', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: {},
};

type Transfer = ReturnType<typeof useCloudSyncTransfer>;
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

describe('popup cloud sync transfer operations', () => {
  let root: Root;
  let container: HTMLDivElement;
  let transfer: Transfer;
  let stored: Record<string, unknown>;
  let starStore: StarStore;
  let promptOwner: PromptLibraryOwner;
  let forkOwner: ReturnType<typeof createForkMessagesOwner>;
  const tabMessage = vi.fn<(tabId: number, message: { type: string }) => Promise<unknown>>();
  const localGet = vi.fn<(keys: unknown) => Promise<Record<string, unknown>>>();
  const localSet = vi.fn<(items: Record<string, unknown>) => Promise<void>>();

  const render = async (platform: SyncPlatform = 'gemini', includeHighlights = true) => {
    await act(async () =>
      root.render(
        <Harness
          platform={platform}
          includeHighlights={includeHighlights}
          capture={(next) => (transfer = next)}
        />,
      ),
    );
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(true);
    vi.spyOn(accountIsolationService, 'resolveAccountScope').mockResolvedValue({
      ...pageScope,
      emailHash: null,
    });
    tabMessage.mockImplementation(async (_tabId, message) =>
      message.type === 'gv.account.getContext'
        ? { ok: true, context: { routeUserId: '1' } }
        : { ok: false },
    );
    stored = {};
    localGet.mockImplementation(async (keys) => {
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.map((name) => [String(name), stored[String(name)]]));
    });
    localSet.mockImplementation(async (items) => {
      Object.assign(stored, structuredClone(items));
    });
    starStore = createStarStore({ get: localGet, set: localSet });
    promptOwner = createPromptLibraryOwner({ area: { get: localGet, set: localSet } });
    forkOwner = createForkMessagesOwner({ get: localGet, set: localSet });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        getURL: (path: string) => `chrome-extension://test/${path}`,
        sendMessage: (
          message: { type: string; payload?: unknown },
          reply?: (response: unknown) => void,
        ) => {
          if (isPromptLibraryApplyMessage(message)) {
            return handlePromptLibraryApplyMessage(message, promptOwner);
          }
          void (
            forkOwner.handle(message) ??
            createStarredMessagesHandler(starStore)(message, {
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
      tabs: { sendMessage: tabMessage },
      storage: {
        local: { get: localGet, set: localSet },
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

  it('keeps hierarchy and highlights scoped when folder isolation is off', async () => {
    vi.mocked(accountIsolationService.isIsolationEnabled).mockResolvedValue(false);
    localGet.mockResolvedValue({ [StorageKeys.FOLDER_DATA]: folders });
    await render();
    const payload = await transfer.prepareUpload();
    expect(payload).toEqual({
      platform: 'gemini',
      accountScope: null,
      timelineHierarchyAccountScope: pageScope,
      highlightAccountScope: pageScope,
      includeHighlights: true,
      folders,
      prompts: [],
    });
  });

  it('uses fresh nonempty tab folders and only overrides the folder scope', async () => {
    tabMessage.mockImplementation(async (_tabId, message) =>
      message.type === 'gv.account.getContext'
        ? { ok: true, context: { routeUserId: '1' } }
        : { ok: true, data: folders, accountScope: tabScope },
    );
    localGet.mockResolvedValue({
      [buildScopedStorageKey(StorageKeys.FOLDER_DATA, 'tab')]: emptyFolders,
    });
    await render();
    const payload = await transfer.prepareUpload();
    expect(payload.folders).toEqual(folders);
    expect(payload.accountScope).toEqual(tabScope);
    expect(payload.timelineHierarchyAccountScope).toEqual(pageScope);
    expect(payload.highlightAccountScope).toEqual(pageScope);
    expect(localSet).not.toHaveBeenCalled();
  });

  it('restores into the tab folder scope but the captured hierarchy scope without clearing absent stars', async () => {
    await render('gemini', false);
    const download = await transfer.prepareDownload();
    // Changes after preparation must not redirect the hierarchy restore.
    vi.mocked(accountIsolationService.resolveAccountScope).mockResolvedValue({
      ...tabScope,
      emailHash: null,
    });
    tabMessage.mockResolvedValue({ ok: true, data: emptyFolders, accountScope: tabScope });
    await download.restore({ folders: { data: folders } }, 'overwrite', false);
    expect(localSet).toHaveBeenCalledWith({
      [buildScopedStorageKey(StorageKeys.FOLDER_DATA, 'tab')]: folders,
      [getTimelineHierarchyStorageKey('page')]: { conversations: {} },
    });
    expect(stored[StorageKeys.PROMPT_ITEMS]).toEqual([]);
    expect(tabMessage).toHaveBeenLastCalledWith(7, { type: 'gv.folders.reload' });
  });

  it.each(['merge', 'overwrite'] as const)(
    'keeps other sites and Gemini accounts when %s restores stars',
    async (mode) => {
      const makeStar = (id: string, url: string) => ({
        conversationId: id,
        turnId: 't',
        content: id,
        conversationUrl: url,
        starredAt: 1,
      });
      const claude = makeStar('claude:conv:one', 'https://claude.ai/chat/one');
      const otherAccount = makeStar('gemini:conv:other', 'https://gemini.google.com/u/2/app/other');
      const cloud = makeStar('gemini:conv:cloud', 'https://gemini.google.com/u/1/app/cloud');
      stored[StorageKeys.TIMELINE_STARRED_MESSAGES] = {
        messages: {
          [claude.conversationId]: [claude],
          [otherAccount.conversationId]: [otherAccount],
        },
      };
      await render('gemini', false);
      const download = await transfer.prepareDownload();
      await download.restore(
        {
          folders: { data: folders },
          starred: {
            format: 'gemini-voyager.starred.v1',
            data: { messages: { [cloud.conversationId]: [cloud] } },
          },
        },
        mode,
        false,
      );
      expect((await starStore.getAll()).messages).toEqual({
        [claude.conversationId]: [claude],
        [otherAccount.conversationId]: [otherAccount],
        [cloud.conversationId]: [cloud],
      });
      await download.restore(
        {
          folders: { data: folders },
          starred: {
            format: 'gemini-voyager.starred.v1',
            data: { messages: {} },
          },
        },
        mode,
        false,
      );
      expect(Object.keys((await starStore.getAll()).messages)).toHaveLength(3);
    },
  );

  it.each(['merge', 'overwrite'] as const)(
    'a cloud tombstone removes a local star in both restore modes (%s)',
    async (mode) => {
      const local = {
        conversationId: 'gemini:conv:deleted',
        turnId: 'turn',
        content: 'Deleted',
        conversationUrl: 'https://gemini.google.com/u/1/app/deleted',
        starredAt: 5,
      };
      const other = {
        ...local,
        conversationId: 'gemini:conv:other',
        conversationUrl: 'https://gemini.google.com/u/2/app/other',
      };
      stored[StorageKeys.SAVED_LIBRARY_STARS] = {
        messages: { [local.conversationId]: [local], [other.conversationId]: [other] },
      };
      await render('gemini', false);
      const download = await transfer.prepareDownload();
      await download.restore(
        {
          folders: { data: folders },
          stars: {
            format: 'gemini-voyager.stars.v2',
            version: '1.0',
            exportedAt: new Date().toISOString(),
            accountScope: { accountHash: hashString(pageScope.accountKey) },
            items: [],
            tombstones: [
              {
                conversationId: local.conversationId,
                turnId: local.turnId,
                conversationUrl: local.conversationUrl,
                starredAt: 5,
                deletedAt: Date.now(),
              },
            ],
          },
        },
        mode,
        false,
      );
      expect((await starStore.getAll()).messages).toEqual({ [other.conversationId]: [other] });
    },
  );

  it.each(['merge', 'overwrite'] as const)(
    'a scoped old-version re-star survives popup restore from another account slot (%s)',
    async (mode) => {
      const cloud = {
        conversationId: 'gemini:conv:peer',
        turnId: 'turn',
        content: 'Peer',
        conversationUrl: 'https://gemini.google.com/u/0/app/peer',
        starredAt: 60,
      };
      await render('gemini', false);
      const download = await transfer.prepareDownload();
      await download.restore(
        {
          folders: { data: folders },
          starred: {
            format: 'gemini-voyager.starred.v1',
            data: { messages: { [cloud.conversationId]: [cloud] } },
          },
          starredAccountHash: hashString(pageScope.accountKey),
          stars: {
            format: 'gemini-voyager.stars.v2',
            version: '1.0',
            exportedAt: new Date().toISOString(),
            accountScope: { accountHash: hashString(pageScope.accountKey) },
            items: [{ ...cloud, starredAt: 50, text: 'Full\nprompt' }],
            tombstones: [],
          },
        },
        mode,
        false,
      );
      expect((await starStore.getAll()).messages).toEqual({
        [cloud.conversationId]: [
          {
            ...cloud,
            conversationUrl: 'https://gemini.google.com/u/1/app/peer',
            text: 'Full\nprompt',
          },
        ],
      });
    },
  );

  it('a v2-only download restores the full starred prompt without a legacy file', async () => {
    const cloud = {
      conversationId: 'gemini:conv:full',
      turnId: 'turn',
      content: 'First line',
      text: 'First line\nFull second line',
      conversationUrl: 'https://gemini.google.com/u/1/app/full',
      starredAt: 5,
    };
    await render('gemini', false);
    const download = await transfer.prepareDownload();
    vi.mocked(accountIsolationService.resolveAccountScope).mockResolvedValue({
      ...tabScope,
      emailHash: null,
    });
    await download.restore(
      {
        folders: { data: folders },
        stars: {
          format: 'gemini-voyager.stars.v2',
          version: '1.0',
          exportedAt: new Date().toISOString(),
          accountScope: { accountHash: hashString(pageScope.accountKey) },
          items: [cloud],
          tombstones: [],
        },
      },
      'merge',
      false,
    );
    expect((await starStore.getAll()).messages).toEqual({ [cloud.conversationId]: [cloud] });
    expect(stored[StorageKeys.TIMELINE_STARRED_MESSAGES]).toEqual({
      messages: {
        [cloud.conversationId]: [
          {
            conversationId: cloud.conversationId,
            turnId: cloud.turnId,
            content: cloud.content,
            conversationUrl: cloud.conversationUrl,
            starredAt: cloud.starredAt,
          },
        ],
      },
    });
  });

  it('a failed v2 restore reports earlier writes and leaves later forks unrestored', async () => {
    await render('gemini', false);
    const download = await transfer.prepareDownload();
    await expect(
      download.restore(
        {
          folders: { data: folders },
          stars: {
            format: 'gemini-voyager.stars.v2',
            version: '1.0',
            exportedAt: new Date().toISOString(),
            accountScope: { accountHash: 'wrong' },
            items: [],
            tombstones: [],
          },
          forks: { format: 'gemini-voyager.forks.v1', data: { nodes: {}, groups: {} } },
        },
        'merge',
        false,
      ),
    ).rejects.toMatchObject({
      restored: ['folders', 'prompts'],
      failed: ['starred', 'forks'],
    });
    expect(stored[buildScopedStorageKey(StorageKeys.FOLDER_DATA, 'page')]).toEqual({
      ...folders,
      folderContents: { local: [] },
    });
    expect(stored[StorageKeys.PROMPT_ITEMS]).toEqual([]);
    expect(stored[StorageKeys.FORK_NODES]).toBeUndefined();
    expect(tabMessage).not.toHaveBeenCalledWith(7, { type: 'gv.folders.reload' });
  });

  it('overwrite refuses a v2-only backup missing folders before restoring anything', async () => {
    await render('gemini', false);
    const download = await transfer.prepareDownload();
    await expect(
      download.restore(
        {
          stars: {
            format: 'gemini-voyager.stars.v2',
            version: '1.0',
            exportedAt: new Date().toISOString(),
            items: [],
            tombstones: [],
            accountScope: { accountHash: hashString(pageScope.accountKey) },
          },
        },
        'overwrite',
        false,
      ),
    ).rejects.toMatchObject({ reason: 'syncOverwriteMissingFolders' });
    expect(localSet).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42])(
    'leaves stars untouched when the cloud star file is %s',
    async (starred) => {
      const existing = {
        turnId: 't',
        content: 'Keep',
        conversationId: 'one',
        conversationUrl: '',
        starredAt: 1,
      };
      stored[StorageKeys.TIMELINE_STARRED_MESSAGES] = { messages: { one: [existing] } };
      await render('gemini', false);
      const download = await transfer.prepareDownload();
      await download.restore({ folders: { data: folders }, starred }, 'overwrite', false);
      expect((await starStore.getAll()).messages).toEqual({ one: [existing] });
    },
  );

  it.each(['merge', 'overwrite'] as const)(
    'a fork uploaded on one device is restored on another without dropping local forks (%s)',
    async (mode) => {
      const fork = (conversationId: string, forkIndex: number): ForkNode => ({
        conversationId,
        turnId: 'turn',
        forkGroupId: 'group',
        forkIndex,
        createdAt: 1,
        conversationUrl: `https://gemini.google.com/u/1/app/${conversationId}`,
      });
      const local = fork('local', 0);
      const cloud = fork('cloud', 1);
      stored[StorageKeys.FORK_NODES] = {
        nodes: { local: [local] },
        groups: { group: ['local:turn'] },
      };
      await render('gemini', false);
      const download = await transfer.prepareDownload();
      await download.restore(
        {
          folders: { data: folders },
          forks: {
            format: 'gemini-voyager.forks.v1',
            exportedAt: '2026-10-05T00:00:00.000Z',
            data: { nodes: { cloud: [cloud] }, groups: { group: ['cloud:turn'] } },
          },
        },
        mode,
        false,
      );
      expect(await forkOwner.getAllForkNodes()).toEqual({
        nodes: { local: [local], cloud: [cloud] },
        groups: { group: ['local:turn', 'cloud:turn'] },
      });
    },
  );

  it('falls back to scoped legacy folders after the upload tab timeout', async () => {
    await render('gemini', false);
    vi.useFakeTimers();
    tabMessage.mockImplementation(async (_tabId, message) =>
      message.type === 'gv.account.getContext'
        ? { ok: true, context: { routeUserId: '1' } }
        : new Promise(() => {}),
    );
    localGet.mockResolvedValue({
      [buildScopedStorageKey(StorageKeys.FOLDER_DATA, 'page')]: JSON.stringify(folders),
      [StorageKeys.PROMPT_ITEMS]: [{ id: 'p', text: 'Prompt', tags: [], createdAt: 1 }],
    });
    const upload = transfer.prepareUpload();
    await vi.advanceTimersByTimeAsync(499);
    expect(localGet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await upload).folders).toEqual(folders);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['gemini', 'aistudio'] as const)(
    'keeps a prompt another tab saves during a restore on %s',
    async (platform) => {
      const localPrompt = { id: 'local', text: 'Local', tags: [], createdAt: 1 };
      const otherTab = { id: 'other', text: 'Other tab', tags: [], createdAt: 3 };
      const cloudPrompt = { id: 'cloud', text: 'Cloud', tags: [], createdAt: 2 };
      stored[StorageKeys.PROMPT_ITEMS] = [localPrompt];
      let saved = false;
      localSet.mockImplementation(async (items) => {
        // Prompt Manager saves through the owner while the popup writes folders.
        if (!saved && !(StorageKeys.PROMPT_ITEMS in items)) {
          saved = true;
          await promptOwner.apply({ kind: 'add', items: [otherTab] });
        }
        Object.assign(stored, structuredClone(items));
      });
      await render(platform, false);
      const download = await transfer.prepareDownload();
      await download.restore(
        { folders: { data: folders }, prompts: { items: [cloudPrompt] } },
        'merge',
        false,
      );
      expect(saved).toBe(true);
      expect(stored[StorageKeys.PROMPT_ITEMS]).toEqual([otherTab, localPrompt, cloudPrompt]);
    },
  );

  it.each([
    ['gemini', 'fails'],
    ['gemini', 'is invalid'],
    ['aistudio', 'fails'],
    ['aistudio', 'is invalid'],
  ] as const)(
    'does not replace prompts on %s with the backup when the local prompt read %s',
    async (platform, failure) => {
      const localPrompts = failure === 'is invalid' ? [{ id: 'broken' }] : [];
      stored[StorageKeys.PROMPT_ITEMS] = localPrompts;
      if (failure === 'fails') {
        localGet.mockImplementation(async (keys) => {
          if (keys === StorageKeys.PROMPT_ITEMS) throw new Error('read failed');
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.map((name) => [String(name), stored[String(name)]]));
        });
      }
      await render(platform, false);
      const download = await transfer.prepareDownload();
      const restore = download.restore(
        {
          folders: { data: folders },
          prompts: { items: [{ id: 'cloud', text: 'Cloud', tags: [], createdAt: 2 }] },
        },
        'merge',
        false,
      );
      await expect(restore).rejects.toMatchObject({
        restored: ['folders'],
        failed: ['prompts'],
      });
      expect(stored[StorageKeys.PROMPT_ITEMS]).toEqual(localPrompts);
    },
  );

  it.each(['gemini', 'aistudio'] as const)(
    'overwrite repairs a corrupt prompt library on %s',
    async (platform) => {
      for (const items of [[{ id: 'cloud', text: 'Cloud', tags: [], createdAt: 2 }], []]) {
        stored[StorageKeys.PROMPT_ITEMS] = { broken: true };
        await render(platform, false);
        const download = await transfer.prepareDownload();
        await download.restore(
          { folders: { data: folders }, prompts: { items } },
          'overwrite',
          false,
        );
        expect(stored[StorageKeys.PROMPT_ITEMS]).toEqual(items);
      }
    },
  );

  it('restores the prompts an AI Studio upload saved, without Gemini-only data', async () => {
    vi.mocked(accountIsolationService.isIsolationEnabled).mockResolvedValue(false);
    const localPrompt = { id: 'local', text: 'Local', tags: [], createdAt: 1 };
    const cloudPrompt = { id: 'cloud', text: 'Cloud', tags: [], createdAt: 2 };
    stored[StorageKeys.PROMPT_ITEMS] = [localPrompt];
    await render('aistudio');
    const download = await transfer.prepareDownload();
    await download.restore(
      { folders: { data: folders }, prompts: { items: [cloudPrompt] } },
      'merge',
      false,
    );
    expect(stored[StorageKeys.PROMPT_ITEMS]).toEqual([localPrompt, cloudPrompt]);
    expect(Object.keys(stored).sort()).toEqual(
      [StorageKeys.FOLDER_DATA_AISTUDIO, StorageKeys.PROMPT_ITEMS].sort(),
    );
    expect(download.payload).toEqual({
      platform: 'aistudio',
      accountScope: null,
      timelineHierarchyAccountScope: null,
      highlightAccountScope: null,
      includeHighlights: false,
    });
  });
});
