import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { Folder } from '@/core/types/folder';

import { clearNewChatFolder, handOffNewChatFolder, pendingNewChatFolder } from '../pendingFolder';
import { createFolderProjectPicker } from '../picker';

vi.mock('@/utils/i18n', () => ({
  getTranslationSyncUnsafe: (key: string) => key,
}));

vi.mock('../../folder/folderColors', () => ({
  getFolderColor: () => '#4285f4',
  isDarkMode: () => false,
}));

const folders: Folder[] = [
  {
    id: 'folder-1',
    name: 'Work',
    instructions: 'Be professional',
    parentId: null,
    isExpanded: false,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'folder-2',
    name: 'Personal',
    parentId: null,
    isExpanded: false,
    createdAt: 0,
    updatedAt: 0,
  },
];

let picker: ReturnType<typeof createFolderProjectPicker>;
const onSelect = vi.fn();

function addAnchor(className = 'model-picker-container'): HTMLElement {
  const anchor = document.createElement(className === 'rich-textarea' ? className : 'div');
  anchor.className = className;
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ height: 20 } as DOMRect);
  document.body.appendChild(anchor);
  return anchor;
}

function chip(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.gv-fp-chip')!;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  onSelect.mockClear();
  (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>)
    .mockReset()
    .mockResolvedValue({});
  vi.mocked(chrome.storage.local.remove).mockReset().mockResolvedValue(undefined);
  picker = createFolderProjectPicker({
    loadFolders: async () => folders,
    canMount: () => true,
    onSelect,
  });
});

afterEach(() => {
  picker.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('folder project picker mounting', () => {
  it('mounts immediately before an existing model picker with nonzero height', async () => {
    const anchor = addAnchor();

    await picker.show();

    expect(anchor.previousElementSibling).toBe(document.querySelector('.gv-fp-picker-container'));
    expect(chip()).not.toBeNull();
  });

  it('mounts nothing when neither anchor appears before its timeout', async () => {
    const shown = picker.show();
    await vi.runAllTimersAsync();
    await shown;

    expect(document.querySelector('.gv-fp-picker-container')).toBeNull();
  });

  it('waits until the model picker has nonzero height', async () => {
    const anchor = addAnchor();
    vi.mocked(anchor.getBoundingClientRect).mockReturnValue({ height: 0 } as DOMRect);
    const shown = picker.show();
    await vi.advanceTimersByTimeAsync(50);
    expect(document.querySelector('.gv-fp-picker-container')).toBeNull();

    vi.mocked(anchor.getBoundingClientRect).mockReturnValue({ height: 20 } as DOMRect);
    await vi.advanceTimersByTimeAsync(50);
    await shown;

    expect(anchor.previousElementSibling).toBe(document.querySelector('.gv-fp-picker-container'));
  });

  it('falls back to the rich textarea after the model picker times out', async () => {
    const anchor = addAnchor('rich-textarea');
    const shown = picker.show();
    await vi.advanceTimersByTimeAsync(4900);
    expect(document.querySelector('.gv-fp-picker-container')).toBeNull();

    await vi.advanceTimersByTimeAsync(200);
    await shown;

    expect(anchor.previousElementSibling).toBe(document.querySelector('.gv-fp-picker-container'));
  });
});

describe('pending folder selection', () => {
  afterEach(() => clearNewChatFolder());

  it('auto-selects the folder handed off in this tab after mounting and takes the handoff', async () => {
    handOffNewChatFolder('folder-1');
    addAnchor();

    await picker.show();
    await vi.advanceTimersByTimeAsync(0);

    expect(chip().textContent).toBe('Work');
    expect(chip().dataset.selected).toBe('folder-1');
    expect(pendingNewChatFolder()).toBeNull();
    expect(onSelect).toHaveBeenCalledWith(folders[0], 'pending');
  });

  it('keeps the default chip when nothing was handed off', async () => {
    addAnchor();

    await picker.show();
    await vi.advanceTimersByTimeAsync(0);

    expect(chip().textContent).toBe('folderAsProject_selectFolder');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not take another tab's new chat folder from storage", async () => {
    // Another tab (of possibly another account) writing the key older builds handed off through.
    (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      [StorageKeys.FOLDER_PROJECT_PENDING_FOLDER_ID]: 'folder-1',
    });
    addAnchor();

    await picker.show();
    await picker.applyPending();
    await vi.advanceTimersByTimeAsync(0);

    expect(chip().textContent).toBe('folderAsProject_selectFolder');
    expect(onSelect).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('keeps a handed-off folder it cannot find yet, and takes it once the folders have it', async () => {
    let shown: readonly Folder[] = [];
    picker.remove();
    picker = createFolderProjectPicker({
      loadFolders: async () => shown,
      canMount: () => true,
      onSelect,
    });
    handOffNewChatFolder('folder-2');
    addAnchor();

    await picker.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(chip().textContent).toBe('folderAsProject_selectFolder');
    expect(pendingNewChatFolder()).toBe('folder-2');

    shown = folders;
    await picker.applyPending();
    expect(chip().textContent).toBe('Personal');
    expect(pendingNewChatFolder()).toBeNull();
  });

  it('takes a handed-off folder when the dropdown opens after the folders loaded late', async () => {
    let shown: readonly Folder[] = [];
    picker.remove();
    picker = createFolderProjectPicker({
      loadFolders: async () => shown,
      canMount: () => true,
      onSelect,
    });
    handOffNewChatFolder('folder-1');
    addAnchor();
    await picker.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(chip().textContent).toBe('folderAsProject_selectFolder');

    shown = folders;
    chip().click();
    await vi.advanceTimersByTimeAsync(0);

    expect(chip().textContent).toBe('Work');
    expect(onSelect).toHaveBeenCalledWith(folders[0], 'pending');
    expect(pendingNewChatFolder()).toBeNull();
  });

  it('takes a folder handed off while the picker is already shown on the new-chat page', async () => {
    addAnchor();
    await picker.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(chip().textContent).toBe('folderAsProject_selectFolder');

    // "New chat in this folder" from the new-chat page: no navigation remounts the picker.
    handOffNewChatFolder('folder-2');
    await picker.applyPending();

    expect(document.querySelectorAll('.gv-fp-picker-container')).toHaveLength(1);
    expect(chip().textContent).toBe('Personal');
    expect(onSelect).toHaveBeenCalledWith(folders[1], 'pending');
  });
});
