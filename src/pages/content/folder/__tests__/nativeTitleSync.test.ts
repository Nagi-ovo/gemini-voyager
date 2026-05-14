import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';
import type { FolderData } from '../types';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestableManager = {
  data: FolderData;
  sidebarContainer: HTMLElement | null;
  setupMutationObserver: () => void;
  syncConversationTitlesFromNative: () => Promise<void>;
  saveData: () => Promise<boolean>;
  renderAllFolders: () => void;
};

function createNativeConversation(hexId: string, title: string): HTMLSpanElement {
  const row = document.createElement('div');
  row.setAttribute('data-test-id', 'conversation');
  row.setAttribute('jslog', `["c_${hexId}"]`);

  const link = document.createElement('a');
  link.href = `/app/${hexId}`;

  const titleEl = document.createElement('span');
  titleEl.className = 'conversation-title-text';
  titleEl.textContent = title;

  link.appendChild(titleEl);
  row.appendChild(link);
  document.body.appendChild(row);

  return titleEl;
}

describe('Gemini native conversation title sync', () => {
  let manager: FolderManager | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('syncs stored folder conversation titles from native sidebar mutations', async () => {
    const hexId = 'abc123def4567890';
    const titleEl = createNativeConversation(hexId, 'Old title');
    manager = new FolderManager();
    const internals = manager as unknown as TestableManager;

    internals.data = {
      folders: [],
      folderContents: {
        folderA: [
          {
            conversationId: `c_${hexId}`,
            title: 'Old title',
            url: `https://gemini.google.com/app/${hexId}`,
            addedAt: Date.now(),
          },
        ],
      },
    };
    internals.sidebarContainer = document.body;

    const saveSpy = vi.spyOn(internals, 'saveData').mockResolvedValue(true);
    const renderSpy = vi.spyOn(internals, 'renderAllFolders').mockImplementation(() => {});

    internals.setupMutationObserver();

    titleEl.textContent = 'Renamed title';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(350);

    expect(internals.data.folderContents.folderA[0]?.title).toBe('Renamed title');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite manually renamed folder conversation titles', async () => {
    const hexId = 'fedcba0987654321';
    createNativeConversation(hexId, 'Native title');
    manager = new FolderManager();
    const internals = manager as unknown as TestableManager;

    internals.data = {
      folders: [],
      folderContents: {
        folderA: [
          {
            conversationId: `c_${hexId}`,
            title: 'Manual title',
            url: `https://gemini.google.com/app/${hexId}`,
            addedAt: Date.now(),
            customTitle: true,
          },
        ],
      },
    };

    const saveSpy = vi.spyOn(internals, 'saveData').mockResolvedValue(true);
    const renderSpy = vi.spyOn(internals, 'renderAllFolders').mockImplementation(() => {});

    await internals.syncConversationTitlesFromNative();

    expect(internals.data.folderContents.folderA[0]?.title).toBe('Manual title');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
  });
});
