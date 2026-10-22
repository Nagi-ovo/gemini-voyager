/**
 * Folder fence availability on one tab, for each site: an owner or unreadable
 * authority fence parks edits without spinning reconciliation, and accepted
 * renames, debounced saves and emergency snapshots survive until authority can
 * be read again. Account switches while authority is unreadable live in
 * `FolderRepositoryFenceRecoveryAccounts.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import { AUTHORITY_FENCE_KEY } from '@/features/folder/owner/authorityFence';
import { toastDriver } from '@/tests/toastDriver';

import {
  clone,
  commit,
  configs,
  create,
  deferred,
  emergency,
  emit,
  get,
  initial,
  installFolderFenceRecovery,
  owner,
  read,
  ready,
  recovery,
  set,
  settle,
  stored,
} from './__tests__/folderRepositoryFenceRecoveryHarness';
import { GEMINI_FOLDER_CONFIG } from './platformFolderConfig';
import type { FolderData } from './types';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return chrome.storage;
    },
    get runtime() {
      return chrome.runtime;
    },
  },
}));

installFolderFenceRecovery();

describe.each(configs)('folder fence availability for $storageKey', (config) => {
  it.each(['owner', 'unreadable'] as const)(
    'does not spin reconciliation after a bucket event while authority is %s',
    async (state) => {
      const { repo, reloads } = await ready(config);
      repo.data.folders[0].name = 'Memory';
      if (state === 'owner') emit(AUTHORITY_FENCE_KEY, owner(config));
      else {
        get.mockImplementation(async (keys) => {
          if (keys === AUTHORITY_FENCE_KEY) throw new Error('Authority unreadable');
          return read(keys);
        });
        await repo.loadData();
      }
      reloads.mockClear();
      emit(config.storageKey, {
        ...initial,
        folders: [{ ...initial.folders[0], name: 'External' }],
      });
      await settle();
      expect(reloads.mock.calls.length).toBeLessThanOrEqual(1);
      expect(repo.canEdit).toBe(false);
      expect(repo.data.folders[0].name).toBe('Memory');
      if (state === 'owner') {
        await vi.advanceTimersByTimeAsync(60000);
        expect(reloads.mock.calls.length).toBeLessThanOrEqual(1);
        expect(toastDriver.all().filter(({ role }) => role === 'alert')).toHaveLength(1);
      }
    },
  );

  it('keeps a failed rename visible and recovers after authority outlasts account retries', async () => {
    const { repo } = await ready(config);
    set.mockRejectedValue(new Error('Save unavailable'));
    repo.data.folders[0].name = 'Mine';
    expect(await repo.saveData()).toBe(false);
    await settle();
    set.mockImplementation(async (items) => commit(items));
    get.mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY) throw new Error('Authority unreadable');
      return read(keys);
    });
    repo.suspend();
    await repo.refreshAccountScope();
    await repo.loadData();
    await vi.advanceTimersByTimeAsync(120000);
    expect(repo.data.folders[0]?.name).toBe('Mine');
    expect(repo.canEdit).toBe(false);
    stored[config.storageKey] = { corrupted: true };
    localStorage.removeItem(config.storageKey);
    get.mockImplementation(async (keys) => read(keys));
    await vi.advanceTimersByTimeAsync(30000);
    await settle();
    expect(repo.data.folders[0]?.name).toBe('Mine');
    expect(repo.canEdit).toBe(true);
    expect((stored[config.storageKey] as FolderData).folders[0].name).toBe('Mine');
  });

  it('retries an accepted queued rename after temporary authority failure without rolling it back', async () => {
    const { repo } = await ready(config);
    const first = deferred<void>();
    const started = deferred<void>();
    set.mockImplementation(async (items) => {
      if ((items[config.storageKey] as FolderData | undefined)?.folders[0]?.name === 'B') {
        started.resolve();
        await first.promise;
      }
      commit(items);
    });
    repo.data.folders[0].name = 'B';
    const savingB = repo.saveData();
    await started.promise;
    let unavailable = true;
    get.mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY && unavailable) throw new Error('Authority unreadable');
      return read(keys);
    });
    repo.data.folders[0].name = 'C';
    let completedC: boolean | undefined;
    const savingC = repo.saveData().then((saved) => (completedC = saved));
    await settle();
    first.resolve();
    expect(await savingB).toBe(true);
    await settle();
    expect(repo.data.folders[0].name).toBe('C');
    expect(completedC).toBeUndefined();
    expect((stored[config.storageKey] as FolderData).folders[0].name).toBe('B');
    // Availability recovers for one probe, then disappears again before the actual replay.
    let recoveredProbe = false;
    get.mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY) {
        if (recoveredProbe) throw new Error('Authority unavailable again');
        recoveredProbe = true;
      }
      return read(keys);
    });
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(recoveredProbe).toBe(true);
    expect(completedC).toBeUndefined();
    expect(repo.data.folders[0].name).toBe('C');
    expect((stored[config.storageKey] as FolderData).folders[0].name).toBe('B');
    unavailable = false;
    get.mockImplementation(async (keys) => read(keys));
    await vi.advanceTimersByTimeAsync(30000);
    await settle();
    expect(await savingC).toBe(true);
    expect(repo.data.folders[0].name).toBe('C');
    expect((stored[config.storageKey] as FolderData).folders[0].name).toBe('C');
    expect(emergency(config).data.folders[0].name).toBe('C');
  });

  it('an accepted debounced expansion survives unreadable authority and suspend/resume', async () => {
    const { repo } = await ready(config);
    repo.data.folders[0].isExpanded = false;
    repo.scheduleSaveData();
    get.mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY) throw new Error('Authority unreadable');
      return read(keys);
    });
    await repo.loadData();
    repo.suspend();
    await repo.refreshAccountScope();
    expect(repo.canEdit).toBe(false);
    expect(repo.data.folders[0].isExpanded).toBe(false);
    get.mockImplementation(async (keys) => read(keys));
    await vi.advanceTimersByTimeAsync(30000);
    await settle();
    expect(repo.canEdit).toBe(true);
    expect(repo.data.folders[0].isExpanded).toBe(false);
    expect((stored[config.storageKey] as FolderData).folders[0].isExpanded).toBe(false);
  });

  it('an accepted debounce survives a resumed binding held longer than its save delay', async () => {
    const { repo } = await ready(config);
    repo.data.folders[0].isExpanded = false;
    repo.scheduleSaveData();
    get.mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY) throw new Error('Authority unreadable');
      return read(keys);
    });
    await repo.loadData();
    repo.suspend();
    await repo.refreshAccountScope();
    const bindingAuthority = deferred<Record<string, unknown>>();
    let recoveredProbe = false;
    get.mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY) {
        if (recoveredProbe) return bindingAuthority.promise;
        recoveredProbe = true;
      }
      return read(keys);
    });
    await vi.advanceTimersByTimeAsync(1600);
    expect(recoveredProbe).toBe(true);
    expect(repo.canEdit).toBe(false);
    get.mockImplementation(async (keys) => read(keys));
    bindingAuthority.resolve({});
    await settle();
    await vi.advanceTimersByTimeAsync(30000);
    expect(repo.data.folders[0].isExpanded).toBe(false);
    expect((stored[config.storageKey] as FolderData).folders[0].isExpanded).toBe(false);
    expect(repo.canEdit).toBe(true);
  });

  it('destroy flushes an accepted debounced edit when no owner fence exists', async () => {
    const { repo } = await ready(config);
    repo.data.folders[0].isExpanded = false;
    repo.scheduleSaveData();
    repo.destroy();
    await settle();
    expect((stored[config.storageKey] as FolderData).folders[0].isExpanded).toBe(false);
  });

  it.each(['during rebinding', 'before rebinding'] as const)(
    'a superseded backup completion cannot reopen a resumed snapshot and delete a restored folder %s',
    async (timing) => {
      const { repo } = await ready(config);
      const backupAuthority = deferred<Record<string, unknown>>();
      const bindingAuthority = deferred<Record<string, unknown>>();
      const freshRead = deferred<Record<string, unknown>>();
      const freshStarted = deferred<void>();
      let authorityReads = 0;
      let phase: 'old-load' | 'binding' | 'fresh' = 'old-load';
      get.mockImplementation(async (keys) => {
        if (keys === AUTHORITY_FENCE_KEY) {
          if (phase === 'binding') return bindingAuthority.promise;
          if (
            phase === 'old-load' &&
            ++authorityReads === (config === GEMINI_FOLDER_CONFIG ? 3 : 2)
          )
            return backupAuthority.promise;
        }
        if (phase === 'fresh' && keys === config.storageKey) {
          freshStarted.resolve();
          return freshRead.promise;
        }
        return read(keys);
      });
      const oldLoad = repo.loadData();
      await settle();
      repo.suspend();
      phase = 'binding';
      let binding = timing === 'during rebinding' ? repo.refreshAccountScope() : null;
      await settle();
      backupAuthority.resolve({});
      await oldLoad;
      if (timing === 'before rebinding') {
        expect(repo.canEdit).toBe(false);
        binding = repo.refreshAccountScope();
        await settle();
      }
      phase = 'fresh';
      bindingAuthority.resolve({});
      await binding;
      const resumedLoad = repo.loadData();
      await freshStarted.promise;
      const restored = {
        folders: [
          ...clone(initial.folders),
          { ...initial.folders[0], id: 'restored', name: 'Restored' },
        ],
        folderContents: { f: [], restored: [] },
      };
      emit(config.storageKey, restored);
      expect(repo.canEdit).toBe(false);
      repo.data.folders[0].name = 'Rejected rename';
      expect(await repo.saveData()).toBe(false);
      expect(stored[config.storageKey]).toEqual(restored);
      get.mockImplementation(async (keys) => read(keys));
      freshRead.resolve({ [config.storageKey]: initial });
      await resumedLoad;
      await vi.advanceTimersByTimeAsync(30000);
      await settle();
      expect(repo.canEdit).toBe(true);
      expect(repo.data.folders.map(({ id }) => id)).toContain('restored');
      expect((stored[config.storageKey] as FolderData).folders.map(({ id }) => id)).toContain(
        'restored',
      );
    },
  );

  it('destroy settles a parked queued edit after the active write has already finished', async () => {
    const { repo } = await ready(config);
    const issued = deferred<void>();
    const writingB = deferred<void>();
    set.mockImplementation(async (items) => {
      if ((items[config.storageKey] as FolderData | undefined)?.folders[0]?.name === 'B') {
        issued.resolve();
        await writingB.promise;
      }
      commit(items);
    });
    repo.data.folders[0].name = 'B';
    const savingB = repo.saveData();
    await issued.promise;
    const lateAuthority = deferred<Record<string, unknown>>();
    get.mockImplementation(async (keys) =>
      keys === AUTHORITY_FENCE_KEY ? lateAuthority.promise : read(keys),
    );
    repo.data.folders[0].name = 'C';
    let completedC: boolean | undefined;
    void repo.saveData().then((saved) => {
      completedC = saved;
    });
    await settle();
    await vi.advanceTimersByTimeAsync(1001);
    writingB.resolve();
    expect(await savingB).toBe(true);
    await settle();
    expect(completedC).toBeUndefined();
    expect((stored[config.storageKey] as FolderData).folders[0].name).toBe('B');
    repo.destroy();
    await settle();
    expect(completedC).toBe(false);
    const callsAfterDestroy = get.mock.calls.length;
    get.mockImplementation(async (keys) => read(keys));
    lateAuthority.resolve({});
    await vi.advanceTimersByTimeAsync(60000);
    await settle();
    expect(get.mock.calls.length).toBe(callsAfterDestroy);
    expect((stored[config.storageKey] as FolderData).folders[0].name).toBe('B');
    expect(repo.canEdit).toBe(false);
  });

  it('an older authorization cannot replace the newest emergency recovery snapshot', async () => {
    const { repo } = await ready(config);
    const earlier = deferred<Record<string, unknown>>();
    let held = false;
    get.mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY && !held) {
        held = true;
        return earlier.promise;
      }
      return read(keys);
    });
    set.mockRejectedValue(new Error('Save unavailable'));
    repo.data.folders[0].name = 'Earlier';
    const firstSave = repo.saveData();
    repo.data.folders[0].name = 'Newest';
    const newestSave = repo.saveData();
    await settle();
    expect(emergency(config).data.folders[0].name).toBe('Newest');
    earlier.resolve({});
    expect(await firstSave).toBe(false);
    expect(await newestSave).toBe(false);
    await settle();
    expect(emergency(config).data.folders[0].name).toBe('Newest');
    repo.destroy();
    localStorage.removeItem(`gvBackup_${config.backupNamespace}_primary`);
    localStorage.removeItem(config.storageKey);
    stored[config.storageKey] = { corrupted: true };
    set.mockImplementation(async (items) => commit(items));
    const recovered = create(config).repo;
    await recovered.init();
    await settle();
    expect(recovered.data.folders[0]?.name).toBe('Newest');
    expect((stored[config.storageKey] as FolderData).folders[0]?.name).toBe('Newest');
  });

  it('a hung authority read parks edits by deadline and retries the latest accepted rename', async () => {
    const { repo } = await ready(config);
    const hung = deferred<Record<string, unknown>>();
    get.mockImplementation(async (keys) =>
      keys === AUTHORITY_FENCE_KEY ? hung.promise : read(keys),
    );
    repo.data.folders[0].name = 'Earlier';
    const savingEarlier = repo.saveData();
    repo.data.folders[0].name = 'Latest';
    const savingLatest = repo.saveData();
    await settle();
    await vi.advanceTimersByTimeAsync(1001);
    expect(repo.canEdit).toBe(false);
    expect(repo.data.folders[0].name).toBe('Latest');
    expect(stored[config.storageKey]).toEqual(initial);
    expect(recovery).toHaveBeenCalledWith('unreadable');
    expect(await savingEarlier).toBe(false);
    get.mockImplementation(async (keys) => read(keys));
    await vi.advanceTimersByTimeAsync(30000);
    await settle();
    expect(await savingLatest).toBe(true);
    expect((stored[config.storageKey] as FolderData).folders[0].name).toBe('Latest');
    expect(repo.canEdit).toBe(true);
    hung.resolve({});
    await settle();
    expect(repo.data.folders[0].name).toBe('Latest');
  });

  it('a late authority answer cannot reopen an owner-fenced tab or replay accepted edits', async () => {
    const { repo, reloads } = await ready(config);
    const hung = deferred<Record<string, unknown>>();
    get.mockImplementation(async (keys) =>
      keys === AUTHORITY_FENCE_KEY ? hung.promise : read(keys),
    );
    repo.data.folders[0].name = 'Unsaved';
    const saving = repo.saveData();
    await settle();
    await vi.advanceTimersByTimeAsync(1001);
    emit(AUTHORITY_FENCE_KEY, owner(config));
    hung.resolve({});
    await settle();
    expect(await saving).toBe(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(repo.canEdit).toBe(false);
    expect(repo.data.folders[0].name).toBe('Unsaved');
    expect(stored[config.storageKey]).toEqual(initial);
    expect(toastDriver.all().filter(({ role }) => role === 'alert')).toHaveLength(1);
    expect(reloads.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
