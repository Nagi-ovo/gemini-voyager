import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { isSaved } from '@/features/folder/commands/folderCommands';

import { FolderStore } from './FolderStore';
import { createFolderDialogs } from './folderDialogs';
import { createLegacyFolderCommands } from './legacyFolderCommands';
import type { IFolderStorageAdapter } from './storage/FolderStorageAdapter';
import type { FolderData } from './types';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { id: 'test-extension-id' },
  },
}));

const sample = (): FolderData => ({
  folders: [
    { id: 'a', name: 'A', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
    { id: 'b', name: 'B', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: {
    a: [{ conversationId: 'c_1', title: 'One', url: '/app/1', addedAt: 1 }],
    b: [],
  },
});

describe('Gemini legacy FolderCommands', () => {
  let saveResult: boolean;
  let stored: FolderData | null;
  let store: FolderStore;
  let writes: FolderData[];
  const onArchive = vi.fn();
  const onChange = vi.fn();

  beforeEach(async () => {
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(false);
    saveResult = true;
    writes = [];
    onArchive.mockClear();
    onChange.mockClear();
    stored = sample();
    const adapter: IFolderStorageAdapter = {
      init: vi.fn(async () => {}),
      loadData: vi.fn(async () => structuredClone(stored)),
      saveData: vi.fn(async (_key, data) => {
        writes.push(structuredClone(data));
        if (saveResult) stored = structuredClone(data);
        return saveResult;
      }),
      removeData: vi.fn(async () => {}),
      getBackendName: () => 'test-memory',
    };
    store = new FolderStore(
      {
        getContext: () => ({ sidebar: null, sortMode: 'manual', enabled: true }),
        onChange,
        onArchive,
        onRecovery: vi.fn(),
      },
      adapter,
    );
    await store.init();
  });

  afterEach(() => {
    store.destroy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // T6e on the legacy backend: the awaiting dialog keeps its draft until the command is saved.
  it('keeps the instructions dialog open with its draft when the save fails', async () => {
    const commands = createLegacyFolderCommands(store);
    const dialogs = createFolderDialogs();
    dialogs.openInstructions(undefined, async (instructions) =>
      isSaved(
        await commands.run({
          kind: 'setFolderInstructions',
          folderId: 'a',
          instructions: instructions ?? null,
        }),
      ),
    );
    const input = document.querySelector<HTMLTextAreaElement>('.gv-fi-textarea')!;
    const save = document.querySelector<HTMLButtonElement>('.gv-fi-btn-save')!;
    input.value = 'Draft';
    saveResult = false;

    save.click();
    await vi.waitFor(() => expect(save.disabled).toBe(false));
    expect(input.isConnected).toBe(true);
    expect(stored?.folders[0].instructions).toBeUndefined();

    saveResult = true;
    save.click();
    await vi.waitFor(() => expect(document.querySelector('.gv-fi-overlay')).toBeNull());
    expect(stored?.folders[0].instructions).toBe('Draft');
  });

  it('applies the value a set op names, so a repeated click changes nothing', async () => {
    const commands = createLegacyFolderCommands(store);

    const first = await commands.run({ kind: 'setFolderPinned', folderId: 'a', pinned: true });
    const second = await commands.run({ kind: 'setFolderPinned', folderId: 'a', pinned: true });

    expect(first).toEqual({ kind: 'unconfirmed' });
    expect(second).toEqual({ kind: 'unchanged', reason: 'noop' });
    expect(store.data.folders[0].pinned).toBe(true);
  });

  it('rejects a panel move whose conversation already left the source, writing nothing', async () => {
    const commands = createLegacyFolderCommands(store);
    store.data.folderContents.a = [];

    const outcome = await commands.run({
      kind: 'moveConversations',
      ids: ['c_1'],
      from: 'a',
      target: 'b',
      via: 'panel-menu',
    });

    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'source_missing' });
    expect(store.data.folderContents.b).toEqual([]);
  });

  it('reports a read-only store as failed instead of unconfirmed', async () => {
    const readOnly = new FolderStore({
      getContext: () => ({ sidebar: null, sortMode: 'manual', enabled: true }),
      onChange: vi.fn(),
      onArchive: vi.fn(),
      onRecovery: vi.fn(),
    });
    const commands = createLegacyFolderCommands(readOnly);

    const outcome = await commands.run({ kind: 'renameFolder', folderId: 'a', name: 'X' });

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'read_only' });
    expect(isSaved(outcome)).toBe(false);
    readOnly.destroy();
  });
  it('preserves single-drop no-op and batch-drop save/notification when already filed', async () => {
    const commands = createLegacyFolderCommands(store);
    writes.length = 0;
    onChange.mockClear();
    void commands.run({
      kind: 'dropConversations',
      target: 'a',
      payload: {
        conversationId: 'c_1',
        title: 'One',
        url: '/app/1',
      },
    });
    expect(commands.view().folderContents.a).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();

    void commands.run({
      kind: 'dropConversations',
      target: 'a',
      payload: {
        title: 'One',
        conversations: [{ conversationId: 'c_1', title: 'One', url: '/app/1', addedAt: 1 }],
      },
    });
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(onChange).toHaveBeenCalledWith('data');
    expect(onArchive).not.toHaveBeenCalled();
  });

  it('moves captured drag metadata even if its source copy changed or disappeared', async () => {
    const commands = createLegacyFolderCommands(store);
    const payload = {
      title: 'Captured',
      sourceFolderId: 'a',
      conversations: [
        {
          conversationId: 'c_1',
          title: 'Captured',
          url: '/app/1',
          addedAt: 1,
          starred: true,
          customTitle: true,
          lastTurnAt: 30,
          lastOpenedAt: 20,
        },
      ],
    };
    store.data.folderContents.a = [];
    void commands.run({ kind: 'dropConversations', target: 'b', payload });
    expect(commands.view().folderContents.b[0]).toMatchObject({
      title: 'Captured',
      starred: true,
      customTitle: true,
      lastTurnAt: 30,
      lastOpenedAt: 20,
    });
    await vi.waitFor(() => expect(stored?.folderContents.b).toHaveLength(1));
    expect(stored?.folderContents.a).toEqual([]);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it('buffers every duplicate reference and saves titles only at the refresh boundary', async () => {
    const commands = createLegacyFolderCommands(store);
    store.data.folderContents.a.push({ ...store.data.folderContents.a[0], title: 'Duplicate' });
    writes.length = 0;
    void commands.run({ kind: 'bufferNativeTitle', folderId: 'a', index: 0, title: 'New' });
    void commands.run({ kind: 'bufferNativeTitle', folderId: 'a', index: 1, title: 'New' });
    expect(commands.view().folderContents.a.map((record) => record.title)).toEqual(['New', 'New']);
    expect(stored?.folderContents.a[0].title).toBe('One');
    expect(writes).toHaveLength(0);
    void commands.run({ kind: 'flushNativeTitles' });
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    // The repository still normalizes duplicate exact ids on persistence.
    expect(stored?.folderContents.a.map((record) => record.title)).toEqual(['New']);
  });

  it('keeps a prepared import draft out of live and stored data if the write fails', async () => {
    const commands = createLegacyFolderCommands(store);
    const draft = structuredClone(commands.view());
    draft.folders[0].name = 'Imported';
    saveResult = false;
    const outcome = await commands.runBulk({ kind: 'commitPreparedData', data: draft });
    expect(isSaved(outcome)).toBe(false);
    expect(commands.view().folders[0].name).toBe('A');
    expect(stored?.folders[0].name).toBe('A');
  });
});
