/** Gemini and AI Studio folder backups and loads, owned by the account that made them. Setup lives in `accountScopedBackupSuite.ts`. */
import { describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { DataBackupService } from '@/core/services/DataBackupService';
import { StorageKeys } from '@/core/types/common';

import type { FolderData } from '../types';
import { mockBrowser } from './accountScopedBackupMockBrowser';
import {
  Platform,
  accountKeys,
  backupData,
  baseKey,
  deferred,
  emptyData,
  extensionLocal,
  extensionSync,
  makeHarness,
  mockWrites,
  pick,
  privateData,
  installAccountScopedBackupSuite,
} from './accountScopedBackupSuite';

vi.mock('webextension-polyfill', async () => ({
  default: (await import('./accountScopedBackupMockBrowser')).mockBrowser,
}));
vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
  createTranslator: () => (key: string) => key,
}));

installAccountScopedBackupSuite();

describe.each<Platform>(['gemini', 'aistudio'])('%s backup account ownership', (platform) => {
  it('keeps scoped primary backups separate and rejects another account after corrupt storage', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    const a = await makeHarness(platform, 'a');
    expect(a.data.folders[0]?.name).toBe('Private a');
    extensionLocal[bKeys.live] = { folders: 'corrupted', folderContents: {} };
    const b = await makeHarness(platform, 'b');
    expect(b.data).toEqual(emptyData());
    expect(extensionLocal[bKeys.live]).not.toEqual(privateData('a'));
    expect(backupData(aKeys.backup)?.folders[0]?.name).toBe('Private a');
    expect(backupData(`${platform}-folders`)).toBeUndefined();
  });

  it('leaves a new account empty when the other account has a backup', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    await makeHarness(platform, 'a');
    const b = await makeHarness(platform, 'b');
    expect(b.data).toEqual(emptyData());
    expect(extensionLocal[bKeys.live]).toBeUndefined();
  });

  it('keeps a valid empty account empty', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = emptyData();
    await makeHarness(platform, 'a');
    const b = await makeHarness(platform, 'b');
    expect(b.data).toEqual(emptyData());
  });

  it('recovers a corrupt live value from the same stable account backup', async () => {
    const keys = await accountKeys(platform, 'a');
    extensionLocal[keys.live] = privateData('a');
    const first = await makeHarness(platform, 'a');
    first.manager.destroy();
    extensionLocal[keys.live] = { folders: 'corrupted', folderContents: {} };
    const recovered = await makeHarness(platform, 'a');
    expect(recovered.data.folders[0]?.name).toBe('Private a');
    expect((extensionLocal[keys.live] as FolderData).folders[0]?.name).toBe('Private a');
  });

  it('does not claim or delete an old ownerless platform backup when isolation is enabled', async () => {
    const keys = await accountKeys(platform, 'b');
    const namespace = `${platform}-folders`;
    new DataBackupService<FolderData>(namespace).createPrimaryBackup(privateData('a'));
    extensionLocal[keys.live] = { folders: 'corrupted', folderContents: {} };
    const b = await makeHarness(platform, 'b');
    expect(b.data).toEqual(emptyData());
    expect(backupData(namespace)).toEqual(privateData('a'));
  });

  it('still recovers the existing platform backup with isolation disabled', async () => {
    extensionSync[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] = false;
    new DataBackupService<FolderData>(`${platform}-folders`).createPrimaryBackup(privateData('a'));
    extensionLocal[baseKey(platform)] = { folders: 'corrupted', folderContents: {} };
    const harness = await makeHarness(platform, 'a');
    expect(harness.data.folders[0]?.name).toBe('Private a');
    expect(harness.storageKey).toBe(baseKey(platform));
    expect(backupData(`${platform}-folders`)?.folders[0]?.name).toBe('Private a');
  });

  it('drops old in-memory recovery data when the same instance switches accounts', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    const harness = await makeHarness(platform, 'a');
    localStorage.clear();
    await harness.switchTo('b');
    extensionLocal[bKeys.live] = { folders: 'corrupted', folderContents: {} };
    await harness.load();
    expect(harness.data).toEqual(emptyData());
    await harness.save();
    expect((extensionLocal[bKeys.live] as FolderData).folders).not.toEqual(
      privateData('a').folders,
    );
  });

  it('does not back up initial or old data while a new account is still loading', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    const harness = await makeHarness(platform, 'a');
    window.dispatchEvent(new Event('beforeunload'));
    await vi.waitFor(() => expect(backupData(aKeys.backup, 'beforeUnload')).toBeDefined());
    expect(backupData(aKeys.backup, 'beforeUnload')?.folders[0]?.name).toBe('Private a');
    await harness.switchTo('b');
    window.dispatchEvent(new Event('beforeunload'));
    expect(backupData(bKeys.backup, 'beforeUnload')).toBeUndefined();
    expect(backupData(aKeys.backup, 'beforeUnload')?.folders[0]?.name).toBe('Private a');
    extensionLocal[bKeys.live] = privateData('b');
    await harness.load();
    window.dispatchEvent(new Event('beforeunload'));
    await vi.waitFor(() => expect(backupData(bKeys.backup, 'beforeUnload')).toBeDefined());
    expect(backupData(bKeys.backup, 'beforeUnload')?.folders[0]?.name).toBe('Private b');
    expect(backupData(aKeys.backup, 'beforeUnload')?.folders[0]?.name).toBe('Private a');
  });
  it('discards an old account load that completes after the new account load', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = privateData('b');
    const harness = await makeHarness(platform, 'a');
    const pending = deferred<Record<string, unknown>>();
    const started = deferred<void>();
    let first = true;
    mockBrowser.storage.local.get.mockImplementation(async (key: unknown) => {
      if (key !== aKeys.live || !first) return pick(extensionLocal, key);
      first = false;
      started.resolve();
      return pending.promise;
    });
    const oldLoad = harness.load();
    await started.promise;
    await harness.switchTo('b');
    await harness.load();
    pending.resolve({ [aKeys.live]: privateData('a') });
    await oldLoad;
    expect(harness.data.folders[0]?.name).toBe('Private b');
    expect(backupData(bKeys.backup)?.folders[0]?.name).toBe('Private b');
  });

  it('keeps a delayed save completion and its snapshot owned by the original account', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = privateData('b');
    const harness = await makeHarness(platform, 'a');
    const pending = deferred<void>();
    const started = deferred<void>();
    const write = async (key: string, data: FolderData) => {
      if (key === aKeys.live) {
        started.resolve();
        await pending.promise;
      }
      Object.assign(extensionLocal, structuredClone({ [key]: data }));
      return true;
    };
    mockWrites(harness, platform, write);
    const oldSave = harness.save();
    await started.promise;
    harness.data.folders[0].name = 'Later edit in a';
    await harness.switchTo('b');
    await harness.load();
    await harness.save();
    pending.resolve();
    await oldSave;
    expect((extensionLocal[aKeys.live] as FolderData).folders[0]?.name).toBe('Private a');
    expect(backupData(aKeys.backup)?.folders[0]?.name).toBe('Private a');
    expect((extensionLocal[bKeys.live] as FolderData).folders[0]?.name).toBe('Private b');
    expect(backupData(bKeys.backup)?.folders[0]?.name).toBe('Private b');
  });

  it('fails closed when resolving the next account throws', async () => {
    const aKeys = await accountKeys(platform, 'a');
    extensionLocal[aKeys.live] = privateData('a');
    const harness = await makeHarness(platform, 'a');
    new DataBackupService<FolderData>(`${platform}-folders`).createPrimaryBackup(privateData('a'));
    const globalBackup = localStorage.getItem(`gvBackup_${platform}-folders_primary`);
    vi.spyOn(accountIsolationService, 'resolveAccountScope').mockRejectedValueOnce(
      new Error('offline'),
    );
    await harness.switchTo('b');
    await harness.load();
    await harness.save();
    window.dispatchEvent(new Event('beforeunload'));
    expect(harness.data).toEqual(emptyData());
    expect(extensionLocal[baseKey(platform)]).toBeUndefined();
    expect(localStorage.getItem(`gvBackup_${platform}-folders_primary`)).toBe(globalBackup);
  });

  it('keeps the latest queued edit in its original account after switching away', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = privateData('b');
    const harness = await makeHarness(platform, 'a');
    const pending = deferred<void>();
    const started = deferred<void>();
    let first = true;
    const write = async (key: string, data: FolderData) => {
      if (key === aKeys.live && first) {
        first = false;
        started.resolve();
        await pending.promise;
      }
      extensionLocal[key] = structuredClone(data);
      return true;
    };
    mockWrites(harness, platform, write);
    const oldSave = harness.save();
    await started.promise;
    harness.data.folders[0].name = 'Queued a';
    const queuedSave = harness.save();
    await harness.switchTo('b');
    await harness.load();
    harness.data.folders[0].name = 'Edited b';
    await harness.save();
    pending.resolve();
    await oldSave;
    await queuedSave;
    await Promise.resolve();
    expect((extensionLocal[aKeys.live] as FolderData).folders[0]?.name).toBe('Queued a');
    expect(backupData(aKeys.backup)?.folders[0]?.name).toBe('Queued a');
    expect((extensionLocal[bKeys.live] as FolderData).folders[0]?.name).toBe('Edited b');
  });

  it('discards a delayed legacy migration after its account has been released', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = privateData('b');
    const harness = await makeHarness(platform, 'a');
    delete extensionLocal[aKeys.live];
    localStorage.removeItem(aKeys.live);
    const pending = deferred<Record<string, unknown>>();
    const started = deferred<void>();
    mockBrowser.storage.local.get.mockImplementation(async (key: unknown) => {
      if (key === baseKey(platform)) {
        started.resolve();
        return pending.promise;
      }
      return pick(extensionLocal, key);
    });
    const oldLoad = harness.load();
    await started.promise;
    await harness.switchTo('b');
    await harness.load();
    pending.resolve({ [baseKey(platform)]: privateData('a') });
    await oldLoad;
    expect(harness.data.folders[0]?.name).toBe('Private b');
    expect((extensionLocal[bKeys.live] as FolderData).folders[0]?.name).toBe('Private b');
    expect(extensionLocal[aKeys.live]).toBeUndefined();
  });
});
