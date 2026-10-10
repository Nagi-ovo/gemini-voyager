import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { SyncState } from '@/core/types/sync';
import { DEFAULT_SYNC_STATE } from '@/core/types/sync';

import { CloudSyncSettings } from '../CloudSyncSettings';
import { createCloudSyncChromeMock as createChromeMock } from './cloudSyncChromeMock';

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    // Keys pass through, except the partial-restore template and its list
    // separator, so a test can read which parts it names and how they join.
    t: (key: string) =>
      key === 'syncRestorePartial'
        ? 'Restored: {restored}. Not restored: {failed} ({error})'
        : key === 'syncRestoreListSeparator'
          ? '、'
          : key,
  }),
}));

vi.mock('@/core/utils/browser', () => ({
  getVoyagerBuildTarget: () => 'chrome',
  isSafari: () => false,
}));

type MockedChrome = typeof chrome;

const baseState: SyncState = {
  ...DEFAULT_SYNC_STATE,
  mode: 'manual',
  isAuthenticated: false,
};

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

type DownloadData = Record<string, unknown>;

function downloadResponder(data: DownloadData, highlightsSynced: boolean) {
  return vi.fn().mockImplementation((message: { type?: string }) => {
    if (message.type === 'gv.sync.getState') {
      return Promise.resolve({ ok: true, state: baseState });
    }
    if (message.type === 'gv.sync.download') {
      return Promise.resolve({
        ok: true,
        state: { ...baseState, isAuthenticated: true },
        ...(highlightsSynced ? { highlights: { synced: true, count: 2 } } : {}),
        data,
      });
    }
    return Promise.resolve({ ok: true });
  });
}

async function clickRestore(container: HTMLElement, label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((btn) =>
    (btn.textContent || '').includes(label),
  );
  await act(async () => {
    button?.click();
  });
  await flushMicrotasks();
}

describe('CloudSyncSettings restore failures', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('fails the whole merge restore when local plugin state cannot be read', async () => {
    const sendMessageMock = vi.fn().mockImplementation((message: { type?: string }) => {
      if (message.type === 'gv.sync.getState') {
        return Promise.resolve({ ok: true, state: baseState });
      }
      if (message.type === 'gv.sync.download') {
        return Promise.resolve({
          ok: true,
          state: { ...baseState, isAuthenticated: true },
          data: {
            folders: { data: { folders: [], folderContents: {} } },
            prompts: { items: [] },
            settings: {
              format: 'gemini-voyager.settings.v1',
              exportedAt: new Date().toISOString(),
              version: '1.0.0',
              data: { [StorageKeys.MERMAID_ENABLED]: false },
            },
            plugins: {
              format: 'gemini-voyager.plugins.v1',
              exportedAt: new Date().toISOString(),
              version: '1.0.0',
              data: { cloud: { enabled: false, installedAt: 4 } },
            },
            starred: { format: 'gemini-voyager.starred.v1', data: { messages: {} } },
          },
        });
      }
      return Promise.resolve({ ok: true });
    });

    const chromeMock = createChromeMock(sendMessageMock);
    (chromeMock.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (keys: unknown) => {
        if (keys && typeof keys === 'object' && StorageKeys.PLUGINS_STATE in keys) {
          throw new Error('local read failed');
        }
        return {
          gvFolderData: { folders: [], folderContents: {} },
          gvPromptItems: [],
          geminiTimelineStarredMessages: { messages: {} },
          [StorageKeys.TIMELINE_HIERARCHY]: { conversations: {} },
        };
      },
    );
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();

    const downloadButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      (btn.textContent || '').includes('syncMerge'),
    );
    await act(async () => {
      downloadButton?.click();
    });
    await flushMicrotasks();

    // Nothing is written: no partial restore of plugins, settings or folders.
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    expect(chromeMock.storage.sync.set).not.toHaveBeenCalled();
    expect(container.textContent).toContain('syncError');
  });

  it('names the restored and the failed parts when a later write fails', async () => {
    const sendMessageMock = vi.fn().mockImplementation((message: { type?: string }) => {
      if (message.type === 'gv.sync.getState') {
        return Promise.resolve({ ok: true, state: baseState });
      }
      if (message.type === 'gv.sync.download') {
        return Promise.resolve({
          ok: true,
          state: { ...baseState, isAuthenticated: true },
          // The background already pulled highlights before the popup writes anything.
          highlights: { synced: true, count: 2 },
          data: {
            folders: { data: { folders: [], folderContents: {} } },
            prompts: { items: [] },
            settings: {
              format: 'gemini-voyager.settings.v1',
              exportedAt: new Date().toISOString(),
              version: '1.0.0',
              data: { [StorageKeys.MERMAID_ENABLED]: false },
            },
            plugins: {
              format: 'gemini-voyager.plugins.v1',
              exportedAt: new Date().toISOString(),
              version: '1.0.0',
              data: { cloud: { enabled: false, installedAt: 4 } },
            },
            starred: { format: 'gemini-voyager.starred.v1', data: { messages: {} } },
          },
        });
      }
      return Promise.resolve({ ok: true });
    });

    const chromeMock = createChromeMock(sendMessageMock);
    (chromeMock.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (items: Record<string, unknown>) => {
        if ('gvFolderData' in items) throw new Error('folders write failed');
      },
    );
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();

    const downloadButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      (btn.textContent || '').includes('syncMerge'),
    );
    await act(async () => {
      downloadButton?.click();
    });
    await flushMicrotasks();

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ [StorageKeys.PLUGINS_STATE]: expect.anything() }),
    );
    expect(chromeMock.storage.sync.set).toHaveBeenCalled();
    expect(container.textContent).toContain(
      'Restored: storageQuotaHighlights、pluginsTitle、storageQuotaSync. ' +
        'Not restored: folder_title、promptDataMigration、savedLibraryStars (folders write failed)',
    );
  });

  it('does not name parts the backup had nothing for as restored', async () => {
    const sendMessageMock = downloadResponder(
      {
        folders: { data: { folders: [], folderContents: {} } },
        prompts: { items: [] },
        // No settings and no plugin state in this backup.
        starred: { format: 'gemini-voyager.starred.v1', data: { messages: {} } },
      },
      true,
    );
    const chromeMock = createChromeMock(sendMessageMock);
    (chromeMock.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (items: Record<string, unknown>) => {
        if ('gvFolderData' in items) throw new Error('folders write failed');
      },
    );
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();
    await clickRestore(container, 'syncMerge');

    expect(chromeMock.storage.sync.set).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      'Restored: storageQuotaHighlights. ' +
        'Not restored: folder_title、promptDataMigration、savedLibraryStars (folders write failed)',
    );
  });

  it('names restored highlights when an overwrite stops for missing folder data', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const sendMessageMock = downloadResponder(
      {
        prompts: { items: [] },
        settings: {
          format: 'gemini-voyager.settings.v1',
          exportedAt: new Date().toISOString(),
          version: '1.0.0',
          data: { [StorageKeys.MERMAID_ENABLED]: false },
        },
        starred: { format: 'gemini-voyager.starred.v1', data: { messages: {} } },
      },
      true,
    );
    const chromeMock = createChromeMock(sendMessageMock);
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();
    await clickRestore(container, 'syncOverwrite');

    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    expect(chromeMock.storage.sync.set).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      'Restored: storageQuotaHighlights. ' +
        'Not restored: storageQuotaSync、folder_title、promptDataMigration、savedLibraryStars ' +
        '(syncOverwriteMissingFolders)',
    );
  });

  it('reports folders and prompts as restored when the star owner write fails', async () => {
    const sendMessage = downloadResponder(
      {
        folders: { data: { folders: [], folderContents: {} } },
        prompts: { items: [] },
        starred: { format: 'gemini-voyager.starred.v1', data: { messages: {} } },
      },
      false,
    );
    const mocked = createChromeMock(sendMessage);
    const stored: Record<string, unknown> = {};
    vi.mocked(mocked.storage.local.set).mockImplementation(async (items) => {
      if (StorageKeys.TIMELINE_STARRED_MESSAGES in items) throw new Error('stars write failed');
      Object.assign(stored, items);
    });
    (globalThis as { chrome: MockedChrome }).chrome = mocked;
    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();
    await clickRestore(container, 'syncMerge');
    expect(stored[StorageKeys.FOLDER_DATA]).toEqual({ folders: [], folderContents: {} });
    expect(stored[StorageKeys.PROMPT_ITEMS]).toEqual([]);
    expect(container.textContent).toContain(
      'Restored: folder_title、promptDataMigration. Not restored: savedLibraryStars (stars write failed)',
    );
  });

  it('names forks as not restored when the fork owner write fails after stars merged', async () => {
    const sendMessage = downloadResponder(
      {
        folders: { data: { folders: [], folderContents: {} } },
        prompts: { items: [] },
        starred: { format: 'gemini-voyager.starred.v1', data: { messages: {} } },
        forks: { format: 'gemini-voyager.forks.v1', data: { nodes: {}, groups: {} } },
      },
      false,
    );
    const mocked = createChromeMock(sendMessage);
    vi.mocked(mocked.storage.local.get).mockImplementation(async (keys) => {
      if (Array.isArray(keys) && keys.includes(StorageKeys.FORK_NODES)) {
        throw new Error('forks read failed');
      }
      return {};
    });
    (globalThis as { chrome: MockedChrome }).chrome = mocked;
    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();
    await clickRestore(container, 'syncMerge');
    expect(container.textContent).toContain(
      'Restored: folder_title、promptDataMigration、savedLibraryStars. ' +
        'Not restored: syncRestoreForks (forks read failed)',
    );
  });

  it('keeps the plain missing-folders message when nothing was restored', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const sendMessageMock = downloadResponder(
      {
        prompts: { items: [] },
        starred: { format: 'gemini-voyager.starred.v1', data: { messages: {} } },
      },
      false,
    );
    const chromeMock = createChromeMock(sendMessageMock);
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();
    await clickRestore(container, 'syncOverwrite');

    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    expect(container.textContent).toContain('syncOverwriteMissingFolders');
    expect(container.textContent).not.toContain('Restored:');
    expect(container.textContent).not.toContain('syncError');
  });
});
