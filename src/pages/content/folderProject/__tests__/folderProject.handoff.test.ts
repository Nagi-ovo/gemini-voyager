import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

it('selects the handed-off folder once its account becomes readable after an empty first load', async () => {
  vi.useFakeTimers();
  window.history.pushState({}, '', '/app');
  const { handOffNewChatFolder, clearNewChatFolder } = await import('../pendingFolder');
  try {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [StorageKeys.FOLDER_PROJECT_ENABLED]: true });
      },
    );
    const { startFolderProject } = await import('../index');
    // The account control is unreadable during the switch to the new chat: no folders yet.
    let shown: Array<{ id: string; name: string; parentId: null }> = [];
    let ready: (() => void) | null = null;
    const folders = {
      getFolders: vi.fn(() => shown),
      ensureDataLoaded: vi.fn().mockResolvedValue(undefined),
      addConversationToFolderFromNative: vi.fn(),
      onFoldersReady: (listener: () => void) => {
        ready = listener;
        return () => {};
      },
    };
    startFolderProject(folders as unknown as Parameters<typeof startFolderProject>[0]);
    handOffNewChatFolder('f1');
    const anchor = document.createElement('div');
    anchor.className = 'model-picker-container';
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ height: 20 } as DOMRect);
    document.body.appendChild(anchor);
    await vi.advanceTimersByTimeAsync(50);
    const chip = () => document.querySelector<HTMLButtonElement>('.gv-fp-chip')!;
    expect(chip().dataset.selected).toBeUndefined();

    shown = [{ id: 'f1', name: 'Thesis', parentId: null }];
    ready!();
    await vi.advanceTimersByTimeAsync(0);

    expect(chip().dataset.selected).toBe('f1');
    expect(chip().textContent).toBe('Thesis');
  } finally {
    clearNewChatFolder();
    vi.useRealTimers();
    window.history.pushState({}, '', '/');
  }
});
