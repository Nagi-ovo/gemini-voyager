/** Gemini and AI Studio folder writes, migrations and downloads across an account switch and back. Setup lives in `accountScopedBackupSuite.ts`. */
import { describe, expect, it, vi } from 'vitest';

import {
  type AccountScope,
  accountIsolationService,
} from '@/core/services/AccountIsolationService';
import { DataBackupService } from '@/core/services/DataBackupService';

import type { FolderData } from '../types';
import { mockBrowser } from './accountScopedBackupMockBrowser';
import {
  Platform,
  accountKeys,
  backupData,
  baseKey,
  deferred,
  extensionLocal,
  legacyData,
  makeHarness,
  mockWrites,
  mountGeminiPanel,
  pauseFirstWrite,
  privateData,
  selectAccount,
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

describe.each<Platform>(['gemini', 'aistudio'])('%s account return', (platform) => {
  it('serializes writes when returning to an account whose old save is still pending', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = privateData('b');
    const harness = await makeHarness(platform, 'a');
    const pending = deferred<void>();
    const started = deferred<void>();
    let first = true;
    const write = async (key: string, data: FolderData) => {
      const snapshot = structuredClone(data);
      if (key === aKeys.live && first) {
        first = false;
        started.resolve();
        await pending.promise;
      }
      extensionLocal[key] = snapshot;
      return true;
    };
    mockWrites(harness, platform, write);
    const originalSave = harness.save();
    await started.promise;
    harness.data.folders[0].name = 'Older queued a';
    const olderSave = harness.save();
    await harness.switchTo('b');
    await harness.load();
    harness.data.folders[0].name = 'B can still save';
    await harness.save();
    expect((extensionLocal[bKeys.live] as FolderData).folders[0]?.name).toBe('B can still save');
    await harness.switchTo('a');
    await harness.load();
    const nameOnReturn = harness.data.folders[0]?.name;
    harness.data.folders[0].name = 'Newest a after returning';
    const newestSave = harness.save();
    pending.resolve();
    await originalSave;
    await olderSave;
    await newestSave;
    await Promise.resolve();
    expect((extensionLocal[aKeys.live] as FolderData).folders[0]?.name).toBe(
      'Newest a after returning',
    );
    expect(backupData(aKeys.backup)?.folders[0]?.name).toBe('Newest a after returning');
    expect(harness.data.folders[0]?.name).toBe('Newest a after returning');
    expect(nameOnReturn).toBe('Older queued a');
  });

  it('does not revive a cloud download after leaving and returning to its account', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = privateData('b');
    const harness = await makeHarness(platform, 'a');
    const writes = pauseFirstWrite(harness, platform, aKeys.live);
    const originalSave = harness.save();
    await writes.started;
    const pending = deferred<unknown>();
    const started = deferred<void>();
    mockBrowser.runtime.sendMessage.mockImplementationOnce(() => {
      started.resolve();
      return pending.promise;
    });
    const download = harness.sync();
    await started.promise;
    await harness.switchTo('b');
    await harness.load();
    await harness.switchTo('a');
    await harness.load();
    harness.data.folders[0].name = 'New edit in a';
    const queuedSave = harness.save();
    writes.release();
    await originalSave;
    await queuedSave;
    await Promise.resolve();
    const cloudData: FolderData = {
      folders: [{ ...privateData('a').folders[0], id: 'cloud-only', name: 'Old cloud response' }],
      folderContents: { 'cloud-only': [] },
    };
    pending.resolve({ ok: true, data: { folders: { data: cloudData } } });
    await download;
    expect(harness.data.folders.map((folder) => folder.name)).toEqual(['New edit in a']);
    expect((extensionLocal[aKeys.live] as FolderData).folders.map((folder) => folder.name)).toEqual(
      ['New edit in a'],
    );
  });

  it('serializes a legacy migration with edits made after returning to its account', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = privateData('b');
    const harness = await makeHarness(platform, 'a');
    delete extensionLocal[aKeys.live];
    localStorage.removeItem(aKeys.live);
    const legacy = legacyData(platform);
    extensionLocal[baseKey(platform)] = legacy;
    const writes = pauseFirstWrite(harness, platform, aKeys.live);
    const migration = harness.load();
    await writes.started;
    await harness.switchTo('b');
    await harness.load();
    await harness.switchTo('a');
    await harness.load();
    harness.data.folders[0].name = 'Edited after migration started';
    const newestSave = harness.save();
    writes.release();
    await migration;
    await newestSave;
    await Promise.resolve();
    expect((extensionLocal[aKeys.live] as FolderData).folders[0]?.name).toBe(
      'Edited after migration started',
    );
    expect(backupData(aKeys.backup)?.folders[0]?.name).toBe('Edited after migration started');
    expect(extensionLocal[baseKey(platform)]).toEqual(legacy);
  });

  it('lets a newer backup outrank a legacy migration whose write failed', async () => {
    const aKeys = await accountKeys(platform, 'a');
    extensionLocal[aKeys.live] = privateData('a');
    const harness = await makeHarness(platform, 'a');
    delete extensionLocal[aKeys.live];
    localStorage.removeItem(aKeys.live);
    const legacy = legacyData(platform);
    extensionLocal[baseKey(platform)] = legacy;
    let failing = true;
    const write = async (key: string, data: FolderData) => {
      if (key === aKeys.live && failing) throw new Error('quota');
      extensionLocal[key] = structuredClone(data);
      return true;
    };
    mockWrites(harness, platform, write);
    await harness.load();
    expect(harness.data.folders[0]?.name).toBe('Private a');
    expect(extensionLocal[aKeys.live]).toBeUndefined();
    failing = false;

    // A failed migration is no edit: a newer backup from another tab must win recovery.
    const newer = privateData('a');
    newer.folders[0].name = 'Newer from another tab';
    new DataBackupService<FolderData>(aKeys.backup).createPrimaryBackup(newer);
    extensionLocal[aKeys.live] = { folders: 'corrupted', folderContents: {} };
    await harness.load();

    expect(harness.data.folders[0]?.name).toBe('Newer from another tab');
    const live = extensionLocal[aKeys.live] as FolderData;
    expect([live, backupData(aKeys.backup)].map((d) => d?.folders[0]?.name)).toEqual([
      'Newer from another tab',
      'Newer from another tab',
    ]);
  });

  it('ignores an earlier account resolution that finishes after a newer one', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = privateData('b');
    const harness = await makeHarness(platform, 'a');
    const scopeA = harness.accountScope!;
    const pending = deferred<AccountScope>();
    vi.spyOn(accountIsolationService, 'resolveAccountScope').mockImplementationOnce(
      () => pending.promise,
    );
    const oldResolution = harness.switchTo('a');
    await harness.switchTo('b');
    await harness.load();
    pending.resolve(scopeA);
    await oldResolution;
    expect(harness.storageKey).toBe(bKeys.live);
    expect(harness.data.folders[0]?.name).toBe('Private b');
  });

  it('does not apply a cloud download after its account has changed', async () => {
    const aKeys = await accountKeys(platform, 'a');
    const bKeys = await accountKeys(platform, 'b');
    extensionLocal[aKeys.live] = privateData('a');
    extensionLocal[bKeys.live] = privateData('b');
    const harness = await makeHarness(platform, 'a');
    const pending = deferred<unknown>();
    const started = deferred<void>();
    mockBrowser.runtime.sendMessage.mockImplementationOnce(() => {
      started.resolve();
      return pending.promise;
    });
    const download = harness.sync();
    await started.promise;
    await harness.switchTo('b');
    await harness.load();
    pending.resolve({ ok: true, data: { folders: { data: privateData('a') } } });
    await download;
    expect(harness.data.folders.map((folder) => folder.name)).toEqual(['Private b']);
    expect((extensionLocal[bKeys.live] as FolderData).folders.map((folder) => folder.name)).toEqual(
      ['Private b'],
    );
  });

  it('clears mounted account rows while resolution is pending and after it fails', async () => {
    const aKeys = await accountKeys(platform, 'a');
    extensionLocal[aKeys.live] = privateData('a');
    const harness = await makeHarness(platform, 'a');
    const container =
      platform === 'gemini' ? await mountGeminiPanel(harness) : document.createElement('div');
    if (platform === 'aistudio') {
      // The real panel, in a nav the folders' view mounts it in.
      container.innerHTML = '<div class="nav-content v3-left-nav"><nav></nav></div>';
      document.body.appendChild(container);
      (harness.manager as unknown as { injectUI(): void }).injectUI();
    }
    const host = () =>
      container.querySelector(
        platform === 'gemini' ? '.gv-folder-tree-host' : '.gv-aistudio-folder-tree',
      );
    const shown = () => `${container.textContent}${host()?.shadowRoot?.textContent ?? ''}`;
    expect(shown()).toContain('Private a');
    const pending = deferred<void>();
    vi.spyOn(accountIsolationService, 'resolveAccountScope').mockImplementationOnce(async () => {
      await pending.promise;
      throw new Error('offline');
    });
    selectAccount(platform, 'b');
    const switching =
      platform === 'gemini'
        ? harness.store!.reloadScopedDataOnAccountRouteChange()
        : harness.manager.refreshScopedDataOnAccountContextChange();
    expect(shown()).not.toContain('Private a');
    pending.resolve();
    await switching;
    expect(shown()).not.toContain('Private a');
  });
});
