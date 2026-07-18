import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';
import type { ConversationReference, FolderData } from '../types';

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: {
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      sync: { get: vi.fn(), set: vi.fn() },
    },
  },
}));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestableManager = {
  data: FolderData;
  accountIsolationEnabled: boolean;
  containerElement: HTMLElement | null;
  createConversationElement: (
    conv: ConversationReference,
    folderId: string,
    level: number,
  ) => HTMLElement;
  navigateToConversationById: (folderId: string, conversationId: string) => void;
  markConversationAsRecentlyOpened: (conversationId: string) => void;
  renderAllFolders: () => void;
  saveData: () => Promise<boolean>;
};

function createConversation(hexId: string): ConversationReference {
  return {
    conversationId: `c_${hexId}`,
    title: `Conversation ${hexId.slice(0, 6)}`,
    url: `https://gemini.google.com/app/${hexId}`,
    addedAt: Date.now(),
  };
}

function appendNativeConversation(
  hexId: string,
  onClick: (event: MouseEvent) => void,
): HTMLAnchorElement {
  const nativeRow = document.createElement('div');
  nativeRow.setAttribute('data-test-id', 'conversation');
  nativeRow.setAttribute('jslog', `["c_${hexId}"]`);

  const link = document.createElement('a');
  link.href = `/app/${hexId}`;
  link.addEventListener('click', onClick);

  nativeRow.appendChild(link);
  document.body.appendChild(nativeRow);

  return link;
}

describe('folder conversation navigation', () => {
  let manager: FolderManager | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/app/original12345678');
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses the native sidebar link when it successfully changes the conversation route', () => {
    const targetHexId = '2b6fe5971f124c03';

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        'folder-1': [createConversation(targetHexId)],
      },
    };

    const markSpy = vi
      .spyOn(typedManager, 'markConversationAsRecentlyOpened')
      .mockImplementation(() => {});
    const clickSpy = vi.fn((event: MouseEvent) => {
      event.preventDefault();
      window.history.pushState({}, '', `/app/${targetHexId}`);
    });

    appendNativeConversation(targetHexId, clickSpy);

    typedManager.navigateToConversationById('folder-1', `c_${targetHexId}`);
    vi.advanceTimersByTime(300);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(`/app/${targetHexId}`);
    expect(markSpy).not.toHaveBeenCalled();
  });

  it('falls back to SPA route navigation when the native click does not change the route', () => {
    const targetHexId = '7c1b4e3a9d5f2a11';

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        'folder-1': [createConversation(targetHexId)],
      },
    };

    const markSpy = vi
      .spyOn(typedManager, 'markConversationAsRecentlyOpened')
      .mockImplementation(() => {});
    const clickSpy = vi.fn((event: MouseEvent) => {
      event.preventDefault();
    });

    appendNativeConversation(targetHexId, clickSpy);

    typedManager.navigateToConversationById('folder-1', `c_${targetHexId}`);
    vi.advanceTimersByTime(1199);
    expect(window.location.pathname).toBe('/app/original12345678');

    vi.advanceTimersByTime(1);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledWith(targetHexId);
    expect(window.location.pathname).toBe(`/app/${targetHexId}`);
  });

  it('keeps the latest destination when an older native-click fallback is pending', () => {
    const firstHexId = '1111222233334444';
    const secondHexId = '5555666677778888';

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        'folder-1': [createConversation(firstHexId), createConversation(secondHexId)],
      },
    };

    const firstClickSpy = vi.fn((event: MouseEvent) => {
      event.preventDefault();
    });
    appendNativeConversation(firstHexId, firstClickSpy);

    typedManager.navigateToConversationById('folder-1', `c_${firstHexId}`);
    typedManager.navigateToConversationById('folder-1', `c_${secondHexId}`);
    vi.advanceTimersByTime(1200);

    expect(firstClickSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(`/app/${secondHexId}`);
  });

  it('ignores a recycled native row whose href belongs to another conversation', () => {
    const targetHexId = '9999aaaabbbbcccc';
    const staleHexId = 'ddddeeeeffff0000';

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        'folder-1': [createConversation(targetHexId)],
      },
    };

    const staleClickSpy = vi.fn((event: MouseEvent) => {
      event.preventDefault();
      window.history.pushState({}, '', `/app/${staleHexId}`);
    });
    const staleLink = appendNativeConversation(staleHexId, staleClickSpy);
    staleLink.parentElement?.setAttribute('jslog', `["c_${targetHexId}"]`);

    typedManager.navigateToConversationById('folder-1', `c_${targetHexId}`);

    expect(staleClickSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(`/app/${targetHexId}`);
  });

  it('uses SPA route navigation when the native sidebar link is not rendered', () => {
    const targetHexId = 'bbbbccccddddeeee';

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        'folder-1': [createConversation(targetHexId)],
      },
    };

    const markSpy = vi
      .spyOn(typedManager, 'markConversationAsRecentlyOpened')
      .mockImplementation(() => {});

    typedManager.navigateToConversationById('folder-1', `c_${targetHexId}`);

    expect(markSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledWith(targetHexId);
    expect(window.location.pathname).toBe(`/app/${targetHexId}`);
  });

  it('highlights the clicked folder row when the same conversation is in multiple folders', () => {
    const targetHexId = 'ccccddddeeeeffff';
    const firstConversation = createConversation(targetHexId);
    const secondConversation = createConversation(targetHexId);

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        'folder-1': [firstConversation],
        'folder-2': [secondConversation],
      },
    };
    typedManager.containerElement = document.createElement('div');
    const list = document.createElement('div');
    list.className = 'gv-folder-list';
    const firstRow = typedManager.createConversationElement(firstConversation, 'folder-1', 1);
    const secondRow = typedManager.createConversationElement(secondConversation, 'folder-2', 1);
    list.append(firstRow, secondRow);
    typedManager.containerElement.appendChild(list);
    document.body.appendChild(typedManager.containerElement);

    typedManager.navigateToConversationById('folder-2', `c_${targetHexId}`);

    expect(firstRow.classList.contains('gv-folder-conversation-selected')).toBe(false);
    expect(secondRow.classList.contains('gv-folder-conversation-selected')).toBe(true);

    typedManager.navigateToConversationById('folder-1', `c_${targetHexId}`);

    expect(firstRow.classList.contains('gv-folder-conversation-selected')).toBe(true);
    expect(secondRow.classList.contains('gv-folder-conversation-selected')).toBe(false);
  });

  it('does not hard navigate when the native SPA route changes after a short delay', () => {
    const targetHexId = '88889999aaaabbbb';

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        'folder-1': [createConversation(targetHexId)],
      },
    };

    const clickSpy = vi.fn((event: MouseEvent) => {
      event.preventDefault();
      setTimeout(() => {
        window.history.pushState({}, '', `/app/${targetHexId}`);
      }, 500);
    });

    appendNativeConversation(targetHexId, clickSpy);

    typedManager.navigateToConversationById('folder-1', `c_${targetHexId}`);
    vi.advanceTimersByTime(1200);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(`/app/${targetHexId}`);
  });

  it('renders folder conversations as real links for browser-native new-tab actions', () => {
    const targetHexId = '4d5e6f7890abcdef';
    const conversation = createConversation(targetHexId);

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    const navigateSpy = vi
      .spyOn(typedManager, 'navigateToConversationById')
      .mockImplementation(() => {});

    const row = typedManager.createConversationElement(conversation, 'folder-1', 1);
    const link = row.querySelector<HTMLAnchorElement>('a.gv-folder-conversation-link');

    expect(link).not.toBeNull();
    expect(link?.href).toBe(`https://gemini.google.com/app/${targetHexId}`);

    const plainClick = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    expect(link?.dispatchEvent(plainClick)).toBe(false);
    expect(plainClick.defaultPrevented).toBe(true);
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith('folder-1', `c_${targetHexId}`);

    link!.target = '_blank';
    const ctrlClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    expect(link?.dispatchEvent(ctrlClick)).toBe(true);
    expect(ctrlClick.defaultPrevented).toBe(false);
    expect(navigateSpy).toHaveBeenCalledTimes(1);

    const middleClick = new MouseEvent('auxclick', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    expect(link?.dispatchEvent(middleClick)).toBe(true);
    expect(middleClick.defaultPrevented).toBe(false);
    expect(navigateSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the current account prefix for link hrefs when account isolation is enabled', () => {
    const targetHexId = 'abcdef1234567890';
    const conversation = createConversation(targetHexId);
    conversation.url = `https://gemini.google.com/u/1/app/${targetHexId}?hl=en`;
    window.history.replaceState({}, '', '/u/2/app/original12345678');

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.accountIsolationEnabled = true;

    const row = typedManager.createConversationElement(conversation, 'folder-1', 1);
    const link = row.querySelector<HTMLAnchorElement>('a.gv-folder-conversation-link');

    expect(link?.href).toBe(`https://gemini.google.com/u/2/app/${targetHexId}?hl=en`);
  });

  it('records recency without immediately reordering the visible folder list', () => {
    const targetHexId = '1111222233334444';
    const otherHexId = 'aaaabbbbccccdddd';

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [],
      folderContents: {
        'folder-1': [createConversation(otherHexId), createConversation(targetHexId)],
      },
    };
    typedManager.containerElement = document.createElement('div');
    typedManager.containerElement.innerHTML = '<div class="gv-folder-list"></div>';
    document.body.appendChild(typedManager.containerElement);

    const saveSpy = vi.spyOn(typedManager, 'saveData').mockResolvedValue(true);
    const renderSpy = vi.spyOn(typedManager, 'renderAllFolders').mockImplementation(() => {});

    typedManager.markConversationAsRecentlyOpened(targetHexId);

    const target = typedManager.data.folderContents['folder-1'][1];
    expect(target.lastOpenedAt).toEqual(expect.any(Number));
    expect(target.updatedAt).toBe(target.lastOpenedAt);
    // Recency marks are pure UI state — the save is debounced, not immediate.
    expect(saveSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(350);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).not.toHaveBeenCalled();
  });
});
