import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import type { FolderProjectFolders } from '../index';

vi.mock('@/utils/i18n', () => ({
  getTranslationSyncUnsafe: (key: string) => key,
}));

vi.mock('../../folder/folderColors', () => ({
  getFolderColor: () => '#4285f4',
  isDarkMode: () => false,
}));

vi.mock('../../chatInput/index', () => ({
  findChatInput: () => document.querySelector<HTMLElement>('#test-chat-input'),
}));

const folders = {
  getFolders: vi.fn().mockReturnValue([]),
  ensureDataLoaded: vi.fn().mockResolvedValue(undefined),
  addConversationToFolderFromNative: vi.fn(),
} as unknown as FolderProjectFolders;

/** Gemini's new-chat page with Folder-as-Project switched on. */
function newChatWithFolderProjectOn(): void {
  window.history.pushState({}, '', '/app');
  document.body.innerHTML = '<div id="test-chat-input" contenteditable="true"></div>';
  const anchor = document.createElement('div');
  anchor.className = 'model-picker-container';
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ height: 20 } as DOMRect);
  document.body.appendChild(anchor);
  vi.mocked(chrome.storage.sync.get).mockImplementation(((
    _defaults: unknown,
    callback: (result: Record<string, unknown>) => void,
  ) => callback({ [StorageKeys.FOLDER_PROJECT_ENABLED]: true })) as never);
}

describe('Folder-as-Project and the folders plugin form factor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    newChatWithFolderProjectOn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(chrome.storage.sync.get).mockReset();
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
  });

  it('shows no picker on a phone, so a send is never given folder instructions', async () => {
    const { startFolderProjectWhereFoldersRun } = await import('../../folderProjectStartup');
    await startFolderProjectWhereFoldersRun(folders, { runsHere: async () => false });
    await vi.advanceTimersByTimeAsync(50);

    expect(document.querySelector('.gv-fp-picker-container')).toBeNull();
    // Not even its switch is read: nothing of the feature starts.
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalledWith(expect.any(Function));
  });

  it('starts as before where the folders plugin runs', async () => {
    const { startFolderProjectWhereFoldersRun } = await import('../../folderProjectStartup');
    await startFolderProjectWhereFoldersRun(folders, { runsHere: async () => true });
    await vi.advanceTimersByTimeAsync(50);

    expect(document.querySelectorAll('.gv-fp-picker-container')).toHaveLength(1);
  });
});
