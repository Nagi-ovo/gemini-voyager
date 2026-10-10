/**
 * Another context's write to the active bucket is applied once this tab has
 * nothing newer in flight: a pending write, a debounced edit or an in-flight
 * read must neither drop the external write nor revert the local edit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  accountIsolationService,
  buildScopedFolderStorageKey,
} from '@/core/services/AccountIsolationService';
import { DataBackupService } from '@/core/services/DataBackupService';
import { validateFolderData } from '@/features/folder/model/folderData';

import { FolderStore } from '../FolderStore';
import type { IFolderStorageAdapter } from '../storage/FolderStorageAdapter';
import type { FolderData } from '../types';

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

const KEY = 'gvFolderData';
type StorageListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function folders(...names: string[]): FolderData {
  return {
    folders: names.map((name, sortIndex) => ({
      id: name,
      name,
      parentId: null,
      isExpanded: true,
      createdAt: 1,
      updatedAt: 1,
      sortIndex,
    })),
    folderContents: Object.fromEntries(
      names.map((name, index) => [
        name,
        index === 0
          ? [
              {
                conversationId: 'c1',
                title: 'One',
                url: 'https://gemini.google.com/app/c1',
                addedAt: 1,
              },
            ]
          : [],
      ]),
    ),
  };
}

/** Both tabs' changes must reach memory and storage. */
function expectMerged(data: FolderData | undefined, openedAt?: number): void {
  expect(names(data)).toEqual(['Alpha', 'From another tab']);
  expect(data?.folders[0].isExpanded).toBe(false);
  if (openedAt !== undefined) expect(data?.folderContents.Alpha[0].lastOpenedAt).toBe(openedAt);
}

function names(data: FolderData | undefined): string[] {
  return (data?.folders ?? []).map((folder) => folder.name);
}

describe('FolderStore reconciles external writes after local work settles', () => {
  let stored: FolderData | undefined;
  let adapter: IFolderStorageAdapter;
  let store: FolderStore;
  let onRecovery: ReturnType<typeof vi.fn<(result: 'recovered' | 'lost' | 'unreadable') => void>>;

  /** Delivers a storage.onChanged event for the bucket, as chrome.storage would. */
  function emit(value: FolderData | undefined): void {
    const [[listener]] = vi.mocked(browser.storage.onChanged.addListener).mock.calls;
    (listener as unknown as StorageListener)(
      { [KEY]: { newValue: structuredClone(value) } },
      'local',
    );
  }

  /** Another tab commits a write and this tab hears about it. */
  function writeFromElsewhere(value: FolderData): void {
    stored = structuredClone(value);
    emit(value);
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    stored = folders('Alpha');
    onRecovery = vi.fn<(result: 'recovered' | 'lost' | 'unreadable') => void>();
    adapter = {
      init: vi.fn(async () => {}),
      loadData: vi.fn(async () => structuredClone(stored ?? null)),
      saveData: vi.fn(async (_key: string, data: FolderData) => {
        stored = structuredClone(data);
        return true;
      }),
      removeData: vi.fn(async () => {}),
      getBackendName: () => 'test-memory',
    };
    store = new FolderStore(
      {
        getContext: () => ({ sidebar: null, sortMode: 'manual', enabled: true }),
        onChange: vi.fn(),
        onArchive: vi.fn(),
        onRecovery,
      },
      adapter,
    );
    await store.init();
  });

  afterEach(() => {
    store.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies a write that lands while its own write is pending, then keeps it', async () => {
    const write = deferred<boolean>();
    vi.mocked(adapter.saveData).mockImplementationOnce(async (_key, data) => {
      stored = structuredClone(data); // committed; the adapter promise is still pending
      return write.promise;
    });
    store.data.folders[0].name = 'Mine';
    const saving = store.saveData();
    await vi.advanceTimersByTimeAsync(0);
    emit(stored); // the echo of this tab's own write
    writeFromElsewhere(folders('Mine', 'From another tab'));

    write.resolve(true);
    await saving;
    await vi.advanceTimersByTimeAsync(0);
    expect(names(store.data)).toEqual(['Mine', 'From another tab']);

    store.data.folders[1].name = 'Edited afterwards';
    await store.saveData();
    expect(names(stored)).toEqual(['Mine', 'Edited afterwards']);
  });

  it('applies a write that lands while a draft replacement is pending', async () => {
    const write = deferred<boolean>();
    vi.mocked(adapter.saveData).mockImplementationOnce(async (_key, data) => {
      stored = structuredClone(data);
      return write.promise;
    });
    const replacing = store.replaceData(folders('Imported'));
    await vi.advanceTimersByTimeAsync(0);
    emit(stored);
    writeFromElsewhere(folders('Imported', 'From another tab'));

    write.resolve(true);
    await expect(replacing).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(names(store.data)).toEqual(['Imported', 'From another tab']);
  });

  it('keeps a debounced edit when an unchanged value is reported before it saves', async () => {
    store.toggleFolder('Alpha');
    // Firefox reports writes that leave the value unchanged; this one carries no new data.
    emit(stored);
    await vi.advanceTimersByTimeAsync(350);

    expect(store.data.folders[0].isExpanded).toBe(false);
    expect(stored?.folders[0].isExpanded).toBe(false);
  });

  it('merges another tab write with edits still waiting on the debounce', async () => {
    vi.advanceTimersByTime(5000);
    store.toggleFolder('Alpha');
    store.markConversationAsRecentlyOpened('c1');
    const openedAt = store.data.folderContents.Alpha[0].lastOpenedAt;
    expect(openedAt).toBeGreaterThan(0);
    writeFromElsewhere(folders('Alpha', 'From another tab'));

    await vi.advanceTimersByTimeAsync(350);

    expectMerged(store.data, openedAt);
    expectMerged(stored, openedAt);
  });

  it('keeps another tab collapse when only a timestamp is debounced here', async () => {
    vi.advanceTimersByTime(5000);
    store.markConversationAsRecentlyOpened('c1');
    const openedAt = store.data.folderContents.Alpha[0].lastOpenedAt;
    const remote = folders('Alpha', 'From another tab');
    remote.folders[0].isExpanded = false;
    writeFromElsewhere(remote);

    await vi.advanceTimersByTimeAsync(350);

    expectMerged(store.data, openedAt);
    expectMerged(stored, openedAt);
  });

  it('merges a debounced toggle made after an earlier toggle was saved', async () => {
    store.toggleFolder('Alpha'); // collapsed, then saved
    await vi.advanceTimersByTimeAsync(350);
    emit(stored);
    store.toggleFolder('Alpha'); // expanded again, still debounced
    const remote = folders('Alpha', 'From another tab');
    remote.folders[0].isExpanded = false; // the other tab saw the saved collapse
    writeFromElsewhere(remote);

    await vi.advanceTimersByTimeAsync(350);

    for (const data of [store.data, stored]) {
      expect(names(data)).toEqual(['Alpha', 'From another tab']);
      expect(data?.folders[0].isExpanded).toBe(true);
    }
  });

  it('carries a debounced open onto a conversation another tab moved', async () => {
    vi.advanceTimersByTime(5000);
    store.markConversationAsRecentlyOpened('c1');
    const openedAt = store.data.folderContents.Alpha[0].lastOpenedAt;
    const remote = folders('Alpha', 'Beta');
    remote.folderContents.Beta = remote.folderContents.Alpha;
    remote.folderContents.Alpha = [];
    writeFromElsewhere(remote);

    await vi.advanceTimersByTimeAsync(350);

    for (const data of [store.data, stored]) {
      expect(data?.folderContents.Alpha).toEqual([]);
      expect(data?.folderContents.Beta.map((c) => c.lastOpenedAt)).toEqual([openedAt]);
      expect(data?.folderContents.Beta[0].updatedAt).toBe(openedAt);
    }
  });

  it('carries a debounced open to a moved copy stored under another id spelling', async () => {
    const native = folders('Alpha', 'Beta');
    native.folderContents.Alpha = [
      {
        conversationId: 'c_abc123def456',
        title: 'One',
        url: 'https://gemini.google.com/app/abc123def456',
        addedAt: 1,
      },
    ];
    writeFromElsewhere(native);
    await vi.advanceTimersByTimeAsync(0);
    vi.advanceTimersByTime(5000);
    store.markConversationAsRecentlyOpened('abc123def456');
    const openedAt = store.data.folderContents.Alpha[0].lastOpenedAt;
    expect(openedAt).toBeGreaterThan(0);
    const moved = structuredClone(native);
    moved.folderContents.Beta = [
      { ...native.folderContents.Alpha[0], conversationId: 'abc123def456' },
    ];
    moved.folderContents.Alpha = [];
    writeFromElsewhere(moved);

    await vi.advanceTimersByTimeAsync(350);

    for (const data of [store.data, stored]) {
      expect(data?.folderContents.Beta.map((c) => c.lastOpenedAt)).toEqual([openedAt]);
    }
  });

  it('carries a debounced open to every folder that holds the conversation', async () => {
    vi.advanceTimersByTime(5000);
    store.markConversationAsRecentlyOpened('c1');
    const openedAt = store.data.folderContents.Alpha[0].lastOpenedAt;
    const remote = folders('Alpha', 'Beta');
    remote.folderContents.Beta = structuredClone(remote.folderContents.Alpha);
    writeFromElsewhere(remote);

    await vi.advanceTimersByTimeAsync(350);

    for (const data of [store.data, stored]) {
      expect(data?.folderContents.Alpha.map((c) => c.lastOpenedAt)).toEqual([openedAt]);
      expect(data?.folderContents.Beta.map((c) => c.lastOpenedAt)).toEqual([openedAt]);
    }
  });

  it('does not bring back a conversation another tab removed', async () => {
    vi.advanceTimersByTime(5000);
    store.markConversationAsRecentlyOpened('c1');
    const remote = folders('Alpha', 'Beta');
    remote.folderContents.Alpha = [];
    writeFromElsewhere(remote);

    await vi.advanceTimersByTimeAsync(350);

    for (const data of [store.data, stored]) {
      expect(Object.values(data?.folderContents ?? {}).flat()).toEqual([]);
    }
  });

  it('carries only the timestamps edited here, not another folder copy of them', async () => {
    const both = folders('Alpha', 'Beta');
    both.folderContents.Beta = [{ ...both.folderContents.Alpha[0], updatedAt: 900 }];
    writeFromElsewhere(both);
    await vi.advanceTimersByTimeAsync(0);
    store.markConversationLastTurnAt('c1', 5000);
    writeFromElsewhere({ ...both, folders: [...both.folders, ...folders('Gamma').folders] });

    await vi.advanceTimersByTimeAsync(350);

    for (const data of [store.data, stored]) {
      expect(data?.folderContents.Alpha.map((c) => [c.lastTurnAt, c.updatedAt])).toEqual([
        [5000, undefined],
      ]);
      expect(data?.folderContents.Beta.map((c) => [c.lastTurnAt, c.updatedAt])).toEqual([
        [5000, 900],
      ]);
    }
  });

  it('holds a debounced save that falls due while the reload read is in flight', async () => {
    store.toggleFolder('Alpha');
    await vi.advanceTimersByTimeAsync(290);
    const read = deferred<FolderData | null>();
    vi.mocked(adapter.loadData).mockImplementationOnce(() => read.promise);
    writeFromElsewhere(folders('Alpha', 'From another tab'));

    await vi.advanceTimersByTimeAsync(20); // the debounce falls due during the read
    read.resolve(structuredClone(stored ?? null));
    await vi.advanceTimersByTimeAsync(350);

    expectMerged(store.data);
    expectMerged(stored);
  });

  it('reloads again for a write that lands while the reload read is in flight', async () => {
    const read = deferred<FolderData | null>();
    vi.mocked(adapter.loadData).mockImplementationOnce(() => read.promise);
    writeFromElsewhere(folders('Alpha', 'From another tab'));
    await vi.advanceTimersByTimeAsync(0);
    const firstRead = structuredClone(stored ?? null);
    writeFromElsewhere(folders('Alpha', 'From another tab', 'Then a third'));

    read.resolve(firstRead);
    await vi.advanceTimersByTimeAsync(0);

    expect(names(store.data)).toEqual(['Alpha', 'From another tab', 'Then a third']);
  });

  describe('when another tab writes a corrupt snapshot', () => {
    const corrupt = { folders: 'broken' } as unknown as FolderData;

    /** Reads take a timer tick, so a reload loop shows up as a growing count. */
    function slowReads(): void {
      vi.mocked(adapter.loadData).mockImplementation(async () => {
        await new Promise((tick) => setTimeout(tick, 10));
        return structuredClone(stored ?? null);
      });
    }

    it('stops after a failing recovery write until something new happens', async () => {
      slowReads();
      vi.mocked(adapter.saveData).mockResolvedValue(false);
      writeFromElsewhere(corrupt);
      await vi.advanceTimersByTimeAsync(1000);
      const writes = vi.mocked(adapter.saveData).mock.calls.length;
      expect(writes).toBeGreaterThan(0);
      expect(writes).toBeLessThanOrEqual(2); // one recovery write and its single retry

      await vi.advanceTimersByTimeAsync(5000);
      expect(adapter.saveData).toHaveBeenCalledTimes(writes);
      expect(names(store.data)).toEqual(['Alpha']); // recovered from backup in memory

      vi.mocked(adapter.saveData).mockImplementation(async (_key, data) => {
        stored = structuredClone(data);
        return true;
      });
      writeFromElsewhere(folders('Alpha', 'From another tab'));
      await vi.advanceTimersByTimeAsync(1000);
      expect(names(store.data)).toEqual(['Alpha', 'From another tab']);
    });

    function emergencyNames(): string[] {
      const backup = JSON.parse(localStorage.getItem('gvBackup_gemini-folders_emergency')!) as {
        data: FolderData;
      };
      return names(backup.data);
    }

    it('keeps a rename whose save fails while storage is corrupt', async () => {
      slowReads();
      vi.mocked(adapter.saveData).mockResolvedValue(false);
      writeFromElsewhere(corrupt);
      await vi.advanceTimersByTimeAsync(1000);

      const reads = vi.mocked(adapter.loadData).mock.calls.length;
      store.data.folders[0].name = 'Mine';
      await expect(store.saveData()).resolves.toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(adapter.loadData).toHaveBeenCalledTimes(reads); // a failed write is no evidence
      expect(names(store.data)).toEqual(['Mine']);
      expect(emergencyNames()).toEqual(['Mine']);

      // Another corrupt event carries no authoritative replacement for the failed edit.
      writeFromElsewhere(structuredClone(corrupt));
      await vi.advanceTimersByTimeAsync(1000);
      expect(names(store.data)).toEqual(['Mine']);
      expect(emergencyNames()).toEqual(['Mine']);

      vi.mocked(adapter.saveData).mockImplementation(async (_key, data) => {
        stored = structuredClone(data);
        return true;
      });
      writeFromElsewhere(folders('Alpha', 'From another tab'));
      await vi.advanceTimersByTimeAsync(1000);
      expect(names(store.data)).toEqual(['Alpha', 'From another tab']);
    });

    it.each([
      ['succeeds', true],
      ['fails', false],
    ])(
      'keeps an edit whose queued save fails while an older recovery write %s',
      async (_outcome, recoverySaves) => {
        const recoveryWrite = deferred<boolean>();
        let writes = 0;
        vi.mocked(adapter.saveData).mockImplementation(() => {
          writes += 1;
          if (writes === 1) return recoveryWrite.promise;
          if (!recoverySaves && writes === 2) return Promise.resolve(false); // its retry
          // Gemini's localStorage quota error surfaces synchronously.
          throw new Error('QuotaExceededError');
        });
        writeFromElsewhere(corrupt);
        await vi.advanceTimersByTimeAsync(0); // recovery restored the backup and is writing it

        store.data.folders[0].name = 'Mine';
        const saving = store.saveData(); // queued behind the recovery write
        recoveryWrite.resolve(recoverySaves);
        await expect(saving).resolves.toBe(false);
        await vi.advanceTimersByTimeAsync(0);
        expect(names(store.data)).toEqual(['Mine']);

        vi.mocked(adapter.saveData).mockImplementation(async (_key, data) => {
          stored = structuredClone(data);
          return true;
        });
        writeFromElsewhere(structuredClone(corrupt));
        await vi.advanceTimersByTimeAsync(1000);

        expect(names(store.data)).toEqual(['Mine']);
        expect(emergencyNames()).toEqual(['Mine']);
        expect(names(stored)).toEqual(['Mine']);
      },
    );

    /** Tab B saves `value`: storage and the account's shared primary backup now hold it. */
    function savedByAnotherTab(value: FolderData): void {
      stored = structuredClone(value);
      new DataBackupService<FolderData>('gemini-folders', validateFolderData).createPrimaryBackup(
        value,
      );
    }

    /** Both attempts of one Gemini save (it retries once) fail. */
    function failNextSave(): void {
      vi.mocked(adapter.saveData).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    }

    it('restores a newer shared backup once an external load replaced a failed save', async () => {
      failNextSave();
      store.data.folders[0].name = 'Mine';
      await expect(store.saveData()).resolves.toBe(false);
      writeFromElsewhere(folders('From X'));
      await vi.advanceTimersByTimeAsync(0);
      expect(names(store.data)).toEqual(['From X']);

      savedByAnotherTab(folders('From Y'));
      writeFromElsewhere(corrupt); // the corruption lands before this tab rereads Y
      await vi.advanceTimersByTimeAsync(1000);

      expect(names(store.data)).toEqual(['From Y']);
      expect(names(stored)).toEqual(['From Y']);
    });

    it('recovers from backup normally once a failed save is followed by a successful one', async () => {
      failNextSave();
      store.data.folders[0].name = 'Mine';
      await expect(store.saveData()).resolves.toBe(false);
      await expect(store.saveData()).resolves.toBe(true);

      writeFromElsewhere(corrupt);
      await vi.advanceTimersByTimeAsync(1000);

      expect(onRecovery).toHaveBeenCalledWith('recovered');
      expect(names(store.data)).toEqual(['Mine']);
    });

    it('does not treat a failed draft replacement as an unsaved edit', async () => {
      failNextSave();
      await expect(store.replaceData(folders('Imported'))).resolves.toBe(false);
      expect(names(store.data)).toEqual(['Alpha']); // the draft never reached memory

      savedByAnotherTab(folders('From Y'));
      writeFromElsewhere(corrupt);
      await vi.advanceTimersByTimeAsync(1000);

      expect(names(store.data)).toEqual(['From Y']);
    });

    it('does not treat its own failed recovery write as an unsaved edit', async () => {
      vi.mocked(adapter.saveData).mockResolvedValue(false);
      writeFromElsewhere(corrupt);
      await vi.advanceTimersByTimeAsync(1000);
      vi.mocked(adapter.saveData).mockImplementation(async (_key, data) => {
        stored = structuredClone(data);
        return true;
      });

      savedByAnotherTab(folders('From Y'));
      writeFromElsewhere(structuredClone(corrupt));
      await vi.advanceTimersByTimeAsync(1000);

      expect(names(store.data)).toEqual(['From Y']);
      expect(names(stored)).toEqual(['From Y']);
    });

    it('settles once a recovery write succeeds', async () => {
      slowReads();
      writeFromElsewhere(corrupt);
      await vi.advanceTimersByTimeAsync(1000);
      const writes = vi.mocked(adapter.saveData).mock.calls.length;
      const reads = vi.mocked(adapter.loadData).mock.calls.length;

      await vi.advanceTimersByTimeAsync(5000);

      expect(writes).toBe(1);
      expect(adapter.saveData).toHaveBeenCalledTimes(writes);
      expect(adapter.loadData).toHaveBeenCalledTimes(reads);
      expect(names(stored)).toEqual(['Alpha']);
      expect(names(store.data)).toEqual(['Alpha']);

      // Settled: the corrupt write is answered, so a later save does not reload again.
      await store.saveData();
      await vi.advanceTimersByTimeAsync(1000);
      expect(adapter.loadData).toHaveBeenCalledTimes(reads);
    });
  });

  it('merges a debounced edit made while the reload read was in flight', async () => {
    const read = deferred<FolderData | null>();
    vi.mocked(adapter.loadData).mockImplementationOnce(() => read.promise);
    writeFromElsewhere(folders('Alpha', 'From another tab'));
    store.toggleFolder('Alpha');

    read.resolve(structuredClone(stored ?? null));
    await vi.advanceTimersByTimeAsync(350);

    expectMerged(store.data);
    expectMerged(stored);
  });
});

describe('FolderStore keeps an observed external write with its own account', () => {
  const KEY_A = buildScopedFolderStorageKey('email:a');
  const KEY_B = buildScopedFolderStorageKey('email:b');
  let disk: Record<string, FolderData>;
  let account: 'a' | 'b';
  let adapter: IFolderStorageAdapter;
  let store: FolderStore;

  function emit(key: string, value: FolderData): void {
    const [[listener]] = vi.mocked(browser.storage.onChanged.addListener).mock.calls;
    (listener as unknown as StorageListener)(
      { [key]: { newValue: structuredClone(value) } },
      'local',
    );
  }

  function writeFromElsewhere(key: string, value: FolderData): void {
    disk[key] = structuredClone(value);
    emit(key, value);
  }

  /** The route moves to another account, as `reloadScopedDataOnAccountRouteChange` does. */
  async function switchTo(next: 'a' | 'b'): Promise<void> {
    account = next;
    await store.refreshAccountScope();
    await store.loadData();
  }

  /** An own write to account A that has committed while its adapter promise is pending. */
  async function pendingOwnWrite(): Promise<() => Promise<void>> {
    const write = deferred<boolean>();
    vi.mocked(adapter.saveData).mockImplementationOnce(async (key, data) => {
      disk[key] = structuredClone(data);
      return write.promise;
    });
    store.data.folders[0].name = 'Mine';
    const saving = store.saveData();
    await vi.advanceTimersByTimeAsync(0);
    emit(KEY_A, disk[KEY_A]);
    return async () => {
      write.resolve(true);
      await saving;
      await vi.advanceTimersByTimeAsync(0);
    };
  }

  function reads(key: string): number {
    return vi.mocked(adapter.loadData).mock.calls.filter(([read]) => read === key).length;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(true);
    vi.spyOn(accountIsolationService, 'resolveAccountScope').mockImplementation(async () => ({
      accountKey: `email:${account}`,
      accountId: account === 'a' ? 1 : 2,
      routeUserId: account === 'a' ? '1' : '2',
      emailHash: account,
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    account = 'a';
    disk = { [KEY_A]: folders('Alpha'), [KEY_B]: folders('Bravo') };
    adapter = {
      init: vi.fn(async () => {}),
      loadData: vi.fn(async (key: string) => structuredClone(disk[key] ?? null)),
      saveData: vi.fn(async (key: string, data: FolderData) => {
        disk[key] = structuredClone(data);
        return true;
      }),
      removeData: vi.fn(async () => {}),
      getBackendName: () => 'test-memory',
    };
    store = new FolderStore(
      {
        getContext: () => ({ sidebar: null, sortMode: 'manual', enabled: true }),
        onChange: vi.fn(),
        onArchive: vi.fn(),
        onRecovery: vi.fn(),
      },
      adapter,
    );
    await store.init();
  });

  afterEach(() => {
    store.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies a write seen before leaving the account once its own write settles', async () => {
    const finishOwnWrite = await pendingOwnWrite();
    writeFromElsewhere(KEY_A, folders('Mine', 'From another tab'));

    await switchTo('b');
    expect(names(store.data)).toEqual(['Bravo']);
    await switchTo('a');
    await finishOwnWrite();
    expect(names(store.data)).toEqual(['Mine', 'From another tab']);

    store.data.folders[1].name = 'Edited afterwards';
    await store.saveData();
    expect(names(disk[KEY_A])).toEqual(['Mine', 'Edited afterwards']);
  });

  it('applies a write that lands while away once its own write settles', async () => {
    const finishOwnWrite = await pendingOwnWrite();
    await switchTo('b');
    writeFromElsewhere(KEY_A, folders('Mine', 'From another tab'));

    await switchTo('a');
    await finishOwnWrite();

    expect(names(store.data)).toEqual(['Mine', 'From another tab']);
  });

  it('applies a write whose reload read a same-account scope refresh discarded', async () => {
    writeFromElsewhere(KEY_A, folders('Alpha', 'From another tab'));
    await store.refreshAccountScope();
    await vi.advanceTimersByTimeAsync(0);

    expect(names(store.data)).toEqual(['Alpha', 'From another tab']);
  });

  it('applies a write that lands while the account scope is being resolved', async () => {
    const scope = deferred<void>();
    vi.mocked(accountIsolationService.resolveAccountScope).mockImplementationOnce(async () => {
      await scope.promise;
      return { accountKey: 'email:a', accountId: 1, routeUserId: '1', emailHash: 'a' };
    });
    const refreshing = store.refreshAccountScope();
    await vi.advanceTimersByTimeAsync(0);
    writeFromElsewhere(KEY_A, folders('Alpha', 'From another tab'));
    scope.resolve();
    await refreshing;
    await vi.advanceTimersByTimeAsync(0);

    expect(names(store.data)).toEqual(['Alpha', 'From another tab']);
  });

  it('does not reload another account for a write seen in this one', async () => {
    const finishOwnWrite = await pendingOwnWrite();
    writeFromElsewhere(KEY_A, folders('Mine', 'From another tab'));
    await switchTo('b');
    writeFromElsewhere(KEY_A, folders('Mine', 'Again from another tab'));
    const bReads = reads(KEY_B);

    store.data.folders[0].name = 'Bravo edited';
    await store.saveData();
    await finishOwnWrite();

    expect(reads(KEY_B)).toBe(bReads);
    expect(names(store.data)).toEqual(['Bravo edited']);
  });
});
