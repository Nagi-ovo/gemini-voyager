import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestConversationReference = {
  conversationId: string;
  title: string;
  url: string;
  addedAt: number;
  updatedAt?: number;
  customTitle?: boolean;
};

type TestFolderData = {
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
    isExpanded: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
  folderContents: Record<string, TestConversationReference[]>;
};

type TestableManager = {
  data: TestFolderData;
  sidebarContainer: HTMLElement | null;
  saveData: () => Promise<boolean>;
  renderAllFolders: () => void;
  setupMutationObserver: () => void;
  syncConversationTitlesFromNativeSidebar: () => Promise<void>;
};

function createNativeConversation(
  sidebar: HTMLElement,
  conversationId: string,
  title: string,
): { titleEl: HTMLElement } {
  const row = document.createElement('div');
  row.setAttribute('data-test-id', 'conversation');
  row.setAttribute('jslog', `["c_${conversationId}"]`);

  const link = document.createElement('a');
  link.href = `https://gemini.google.com/app/${conversationId}`;

  const titleEl = document.createElement('span');
  titleEl.className = 'conversation-title';
  titleEl.textContent = title;

  link.appendChild(titleEl);
  row.appendChild(link);
  sidebar.appendChild(row);

  return { titleEl };
}

describe('folder conversation title sync', () => {
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
  });

  it('syncs stored conversation titles from the native Gemini sidebar', async () => {
    const sidebar = document.createElement('div');
    document.body.appendChild(sidebar);
    createNativeConversation(sidebar, 'abc123', 'Renamed in Gemini');

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        folderA: [
          {
            conversationId: 'c_abc123',
            title: 'Old title',
            url: 'https://gemini.google.com/app/abc123',
            addedAt: Date.now(),
          },
        ],
      },
    };

    const saveSpy = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const renderSpy = vi.fn<() => void>();
    typedManager.saveData = saveSpy;
    typedManager.renderAllFolders = renderSpy;

    await typedManager.syncConversationTitlesFromNativeSidebar();

    expect(typedManager.data.folderContents.folderA[0]?.title).toBe('Renamed in Gemini');
    expect(typedManager.data.folderContents.folderA[0]?.updatedAt).toEqual(expect.any(Number));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite custom folder titles during native sync', async () => {
    const sidebar = document.createElement('div');
    document.body.appendChild(sidebar);
    createNativeConversation(sidebar, 'abc999', 'Native New Name');

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        folderA: [
          {
            conversationId: 'c_abc999',
            title: 'Manually Renamed',
            url: 'https://gemini.google.com/app/abc999',
            addedAt: Date.now(),
            customTitle: true,
          },
        ],
      },
    };

    const saveSpy = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const renderSpy = vi.fn<() => void>();
    typedManager.saveData = saveSpy;
    typedManager.renderAllFolders = renderSpy;

    await typedManager.syncConversationTitlesFromNativeSidebar();

    expect(typedManager.data.folderContents.folderA[0]?.title).toBe('Manually Renamed');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('observes native title mutations and syncs with debounce', async () => {
    const sidebar = document.createElement('div');
    document.body.appendChild(sidebar);
    const { titleEl } = createNativeConversation(sidebar, 'debounce1', 'Before Rename');

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        folderA: [
          {
            conversationId: 'c_debounce1',
            title: 'Before Rename',
            url: 'https://gemini.google.com/app/debounce1',
            addedAt: Date.now(),
          },
        ],
      },
    };
    typedManager.sidebarContainer = sidebar;

    const saveSpy = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const renderSpy = vi.fn<() => void>();
    typedManager.saveData = saveSpy;
    typedManager.renderAllFolders = renderSpy;

    typedManager.setupMutationObserver();

    titleEl.textContent = 'After Rename';
    await vi.advanceTimersByTimeAsync(350);

    expect(typedManager.data.folderContents.folderA[0]?.title).toBe('After Rename');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
