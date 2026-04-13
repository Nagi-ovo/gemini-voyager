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
  navigateToConversationById: (folderId: string, conversationId: string) => void;
  markConversationAsRecentlyOpened: (conversationId: string) => void;
  navigateWithFullReload: (url: string) => void;
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
    const hardNavigateSpy = vi
      .spyOn(typedManager, 'navigateWithFullReload')
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
    expect(hardNavigateSpy).not.toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
  });

  it('falls back to hard navigation when the native click does not change the route', () => {
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
    const hardNavigateSpy = vi
      .spyOn(typedManager, 'navigateWithFullReload')
      .mockImplementation(() => {});
    const clickSpy = vi.fn((event: MouseEvent) => {
      event.preventDefault();
    });

    appendNativeConversation(targetHexId, clickSpy);

    typedManager.navigateToConversationById('folder-1', `c_${targetHexId}`);
    vi.advanceTimersByTime(299);
    expect(hardNavigateSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledWith(targetHexId);
    expect(hardNavigateSpy).toHaveBeenCalledTimes(1);
    expect(hardNavigateSpy).toHaveBeenCalledWith(`https://gemini.google.com/app/${targetHexId}`);
  });
});
