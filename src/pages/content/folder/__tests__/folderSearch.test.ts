import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';
import type { FolderData } from '../types';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestableManager = {
  data: FolderData;
  folderSearchEnabled: boolean;
  folderSearchQuery: string;
  createFoldersList: () => HTMLElement;
  destroy: () => void;
};

function makeManager(data: FolderData, query: string): TestableManager {
  const manager = new FolderManager() as unknown as TestableManager;
  manager.data = data;
  manager.folderSearchEnabled = true;
  manager.folderSearchQuery = query;
  return manager;
}

function getFolderNames(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('.gv-folder-name')].map(
    (node) => node.textContent ?? '',
  );
}

function getConversationTitles(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('.gv-conversation-title')].map(
    (node) => node.textContent ?? '',
  );
}

const folderData: FolderData = {
  folders: [
    {
      id: 'research',
      name: 'Research',
      parentId: null,
      isExpanded: false,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'papers',
      name: 'Papers',
      parentId: 'research',
      isExpanded: false,
      createdAt: 2,
      updatedAt: 2,
    },
    {
      id: 'recipes',
      name: 'Recipes',
      parentId: null,
      isExpanded: false,
      createdAt: 3,
      updatedAt: 3,
    },
  ],
  folderContents: {
    papers: [
      {
        conversationId: 'alpha-signals',
        title: 'Alpha signals',
        url: 'https://gemini.google.com/app/alpha-signals',
        addedAt: 10,
      },
    ],
    recipes: [
      {
        conversationId: 'dinner-plan',
        title: 'Dinner plan',
        url: 'https://gemini.google.com/app/dinner-plan',
        addedAt: 11,
      },
    ],
  },
};

describe('folder sidebar search', () => {
  let manager: TestableManager | null = null;

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('keeps the parent path visible for a nested conversation match', () => {
    manager = makeManager(folderData, 'alpha');

    const list = manager.createFoldersList();

    expect(getFolderNames(list)).toEqual(['Research', 'Papers']);
    expect(getConversationTitles(list)).toEqual(['Alpha signals']);
    expect(list.querySelector('.gv-folder-empty')).toBeNull();
  });

  it('filters by folder title without showing unrelated conversations', () => {
    manager = makeManager(folderData, 'recipes');

    const list = manager.createFoldersList();

    expect(getFolderNames(list)).toEqual(['Recipes']);
    expect(getConversationTitles(list)).toEqual([]);
  });

  it('uses the search empty state when no titles match', () => {
    manager = makeManager(folderData, 'missing');

    const list = manager.createFoldersList();

    expect(getFolderNames(list)).toEqual([]);
    expect(getConversationTitles(list)).toEqual([]);
    expect(list.querySelector('.gv-folder-empty')?.textContent).toBe('folder_search_empty');
  });

  it('does not filter the tree when folder search is disabled', () => {
    manager = makeManager(folderData, 'alpha');
    manager.folderSearchEnabled = false;

    const list = manager.createFoldersList();

    expect(getFolderNames(list)).toEqual(['Recipes', 'Research']);
    expect(getConversationTitles(list)).toEqual([]);
  });
});
