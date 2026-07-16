import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';
import type { FolderData } from '../types';

const coachmarkMocks = vi.hoisted(() => ({
  hasSeenCoachmark: vi.fn(async () => false),
  markCoachmarkSeen: vi.fn(async () => undefined),
}));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

vi.mock('../../coachmark', () => coachmarkMocks);

type TestableManager = {
  data: FolderData;
  folderSearchEnabled: boolean;
  folderSearchQuery: string;
  folderOnlySearchHintSeen: boolean;
  createFolderSearch: () => HTMLElement;
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
    research: [
      {
        conversationId: 'research-overview',
        title: 'Research overview',
        url: 'https://gemini.google.com/app/research-overview',
        addedAt: 9,
      },
    ],
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
    coachmarkMocks.markCoachmarkSeen.mockClear();
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

  it('shows every conversation inside a folder matched with the f: prefix', () => {
    manager = makeManager(folderData, 'f:recipes');

    const list = manager.createFoldersList();

    expect(getFolderNames(list)).toEqual(['Recipes']);
    expect(getConversationTitles(list)).toEqual(['Dinner plan']);
  });

  it('shows the full subtree when a parent folder matches folder:', () => {
    manager = makeManager(folderData, 'folder:research');

    const list = manager.createFoldersList();

    expect(getFolderNames(list)).toEqual(['Research', 'Papers']);
    expect(getConversationTitles(list)).toEqual(['Research overview', 'Alpha signals']);
  });

  it('keeps only the ancestor path when a nested folder matches f:', () => {
    manager = makeManager(folderData, 'F: Papers');

    const list = manager.createFoldersList();

    expect(getFolderNames(list)).toEqual(['Research', 'Papers']);
    expect(getConversationTitles(list)).toEqual(['Alpha signals']);
  });

  it('does not match root conversations in folder-only mode', () => {
    manager = makeManager(
      {
        ...folderData,
        folderContents: {
          ...folderData.folderContents,
          __root_conversations__: [
            {
              conversationId: 'recipes-root',
              title: 'Recipes shortcut',
              url: 'https://gemini.google.com/app/recipes-root',
              addedAt: 8,
            },
          ],
        },
      },
      'f:recipes',
    );

    const list = manager.createFoldersList();

    expect(getFolderNames(list)).toEqual(['Recipes']);
    expect(getConversationTitles(list)).toEqual(['Dinner plan']);
  });

  it('teaches the prefix until the first folder-only search, then keeps only the mode badge', () => {
    manager = makeManager(folderData, '');
    manager.folderOnlySearchHintSeen = false;

    const search = manager.createFolderSearch();
    const input = search.querySelector<HTMLInputElement>('.gv-folder-search-input');
    const badge = search.querySelector<HTMLElement>('.gv-folder-search-mode-badge');

    expect(input?.placeholder).toBe('folder_search_placeholder · f: folder_search_mode_folder');
    expect(badge?.hidden).toBe(true);

    input!.value = 'f:recipes';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(manager.folderOnlySearchHintSeen).toBe(true);
    expect(input?.placeholder).toBe('folder_search_placeholder');
    expect(search.classList.contains('gv-folder-search-folder-mode')).toBe(true);
    expect(badge?.hidden).toBe(false);
    expect(badge?.textContent).toBe('folder_search_mode_folder');
    expect(coachmarkMocks.markCoachmarkSeen).toHaveBeenCalledWith('folder-only-search-prefix-hint');

    input!.value = '';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(search.classList.contains('gv-folder-search-folder-mode')).toBe(false);
    expect(badge?.hidden).toBe(true);
    expect(input?.placeholder).toBe('folder_search_placeholder');
    expect(coachmarkMocks.markCoachmarkSeen).toHaveBeenCalledTimes(1);
  });

  it('always shows the compact mode badge for returning users', () => {
    manager = makeManager(folderData, 'folder:recipes');
    manager.folderOnlySearchHintSeen = true;

    const search = manager.createFolderSearch();
    const input = search.querySelector<HTMLInputElement>('.gv-folder-search-input');
    const badge = search.querySelector<HTMLElement>('.gv-folder-search-mode-badge');

    expect(input?.placeholder).toBe('folder_search_placeholder');
    expect(input?.getAttribute('aria-label')).toBe(
      'folder_search_placeholder: folder_search_mode_folder',
    );
    expect(search.classList.contains('gv-folder-search-folder-mode')).toBe(true);
    expect(badge?.hidden).toBe(false);
    expect(coachmarkMocks.markCoachmarkSeen).not.toHaveBeenCalled();
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
