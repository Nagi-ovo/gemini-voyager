/** Per-platform account switches: Gemini imports, drafts and editors, AI Studio account polls. Setup lives in `accountScopedBackupSuite.ts`. */
import { expect, it, vi } from 'vitest';

import {
  type AccountScope,
  accountIsolationService,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { FolderImportExportService } from '@/features/folder/services/FolderImportExportService';

import { type FloatingPanelHandle, mountFloatingPanel } from '../floatingPanel';
import { menuItem } from '../floatingTree/__tests__/treeDriver';
import type { FolderData } from '../types';
import { mockBrowser } from './accountScopedBackupMockBrowser';
import {
  accountKeys,
  backupData,
  deferred,
  emitStorageChange,
  extensionLocal,
  extensionSync,
  makeHarness,
  mountGeminiPanel,
  pauseFirstWrite,
  privateData,
  selectAccount,
  installAccountScopedBackupSuite,
} from './accountScopedBackupSuite';
import { GEMINI_PANEL } from './floatingPanelHarness';
import { sidebarTree } from './sidebarTreeDriver';

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

it('Gemini retries an old save under its captured key without suppressing the new account echo', async () => {
  const aKeys = await accountKeys('gemini', 'a');
  const bKeys = await accountKeys('gemini', 'b');
  extensionLocal[aKeys.live] = privateData('a');
  extensionLocal[bKeys.live] = privateData('b');
  const harness = await makeHarness('gemini', 'a');
  const pending = deferred<boolean>();
  const write = vi
    .spyOn(harness.adapter!, 'saveData')
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValue(true);
  const oldSave = harness.save();
  await harness.switchTo('b');
  await harness.load();
  pending.resolve(false);
  await oldSave;
  expect(write.mock.calls.map(([key]) => key)).toEqual([aKeys.live, aKeys.live]);
  const reload = vi.spyOn(harness.store!, 'reloadFoldersFromStorage').mockResolvedValue();
  emitStorageChange({ [bKeys.live]: { newValue: privateData('b') } }, 'local');
  expect(reload).toHaveBeenCalledOnce();
});

it('Gemini discards an import result that completes after switching accounts', async () => {
  const aKeys = await accountKeys('gemini', 'a');
  const bKeys = await accountKeys('gemini', 'b');
  extensionLocal[aKeys.live] = privateData('a');
  extensionLocal[bKeys.live] = privateData('b');
  const harness = await makeHarness('gemini', 'a');
  const payload = FolderImportExportService.exportToPayload(privateData('a'));
  const result = await FolderImportExportService.importFromPayload(payload, privateData('a'), {
    strategy: 'merge',
    createBackup: false,
  });
  const pending = deferred<typeof result>();
  vi.spyOn(FolderImportExportService, 'importFromPayload').mockReturnValueOnce(pending.promise);
  const text = JSON.stringify(payload);
  const imported = harness.manager.transfer.import({ text }, 'merge', document.body);
  await harness.switchTo('b');
  await harness.load();
  pending.resolve(result);
  await imported;
  expect(harness.data.folders.map((folder) => folder.name)).toEqual(['Private b']);
  expect((extensionLocal[bKeys.live] as FolderData).folders.map((folder) => folder.name)).toEqual([
    'Private b',
  ]);
});

it('AI Studio does not restart a slow account resolution on every poll', async () => {
  const keys = await accountKeys('aistudio', 'a');
  extensionLocal[keys.live] = privateData('a');
  const harness = await makeHarness('aistudio', 'a');
  const resolved = await accountIsolationService.resolveAccountScope({
    pageUrl: window.location.href,
    email: 'b@example.com',
    routeUserId: null,
  });
  const pending = deferred<AccountScope>();
  const resolveScope = vi
    .spyOn(accountIsolationService, 'resolveAccountScope')
    .mockImplementation(() => pending.promise);
  selectAccount('aistudio', 'b');
  const first = harness.manager.refreshScopedDataOnAccountContextChange();
  const second = harness.manager.refreshScopedDataOnAccountContextChange();
  pending.resolve(resolved);
  await Promise.all([first, second]);
  expect(resolveScope).toHaveBeenCalledOnce();
});

it('Gemini does not revive an import after returning to its still-saving account', async () => {
  const aKeys = await accountKeys('gemini', 'a');
  const bKeys = await accountKeys('gemini', 'b');
  extensionLocal[aKeys.live] = privateData('a');
  extensionLocal[bKeys.live] = privateData('b');
  const harness = await makeHarness('gemini', 'a');
  const writes = pauseFirstWrite(harness, 'gemini', aKeys.live);
  const originalSave = harness.save();
  await writes.started;
  const payload = FolderImportExportService.exportToPayload(privateData('a'));
  const result = await FolderImportExportService.importFromPayload(payload, privateData('a'), {
    strategy: 'merge',
    createBackup: false,
  });
  const pending = deferred<typeof result>();
  vi.spyOn(FolderImportExportService, 'importFromPayload').mockReturnValueOnce(pending.promise);
  const text = JSON.stringify(payload);
  const imported = harness.manager.transfer.import({ text }, 'merge', document.body);
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
  pending.resolve(result);
  await imported;
  expect(harness.data.folders[0]?.name).toBe('New edit in a');
  expect((extensionLocal[aKeys.live] as FolderData).folders[0]?.name).toBe('New edit in a');
});

it('Gemini resets a focused floating draft on account switch and renders the loaded account', async () => {
  const aKeys = await accountKeys('gemini', 'a');
  const bKeys = await accountKeys('gemini', 'b');
  extensionLocal[aKeys.live] = privateData('a');
  extensionLocal[bKeys.live] = privateData('b');
  const harness = await makeHarness('gemini', 'a');
  const panel = mountFloatingPanel({ ...GEMINI_PANEL, data: harness.data });
  (
    harness.manager as unknown as { floatingUI: { handle: FloatingPanelHandle | null } }
  ).floatingUI.handle = panel;
  const geometry = panel.element.style.cssText;
  panel.element
    .shadowRoot!.querySelector<HTMLButtonElement>('.gv-floating-folder-panel__icon-button--create')!
    .click();
  const input = panel.element.shadowRoot!.querySelector<HTMLInputElement>(
    '.gv-floating-folder-panel__inline-input',
  )!;
  input.value = 'Private draft a';
  input.focus();
  const switching = harness.switchTo('b');
  expect(panel.element.shadowRoot!.textContent).not.toContain('Private a');
  expect(
    panel.element.shadowRoot!.querySelector('.gv-floating-folder-panel__inline-input'),
  ).toBeNull();
  expect(panel.element.style.cssText).toBe(geometry);
  await switching;
  await harness.load();
  expect(panel.element.shadowRoot!.textContent).toContain('Private b');
});

it('Gemini closes the old instructions editor on account change and ignores its detached save button', async () => {
  const aKeys = await accountKeys('gemini', 'a');
  const bKeys = await accountKeys('gemini', 'b');
  extensionLocal[aKeys.live] = privateData('a');
  extensionLocal[bKeys.live] = privateData('b');
  const harness = await makeHarness('gemini', 'a');
  harness.manager.treeView.applySettings(
    { [StorageKeys.FOLDER_PROJECT_ENABLED]: { newValue: true } },
    'sync',
  );
  const panel = await mountGeminiPanel(harness);
  const tree = sidebarTree(panel);
  tree.openMenuByButton('Private a');
  menuItem('folderAsProject_setInstructions').click();
  const editor = document.querySelector<HTMLTextAreaElement>('.gv-fi-textarea')!;
  editor.value = 'Private instructions from A';
  const oldSave = document.querySelector<HTMLButtonElement>('.gv-fi-btn-save')!;
  await harness.switchTo('b');
  await harness.load();
  expect(document.querySelector('.gv-fi-textarea')).toBeNull();
  oldSave.click();
  await Promise.resolve();
  expect(harness.data).toEqual(privateData('b'));
  expect(extensionLocal[bKeys.live]).toEqual(privateData('b'));
});

it('Gemini updates the mounted user filter button when account isolation changes in either direction', async () => {
  extensionSync[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] = false;
  const harness = await makeHarness('gemini', 'a');
  const panel = await mountGeminiPanel(harness);
  const filter = panel.querySelector<HTMLButtonElement>('.gv-folder-user-filter-toggle')!;
  expect(filter.hidden).toBe(false);
  await harness.store!.setAccountIsolationEnabled(true);
  expect(filter.hidden).toBe(true);
  await harness.store!.setAccountIsolationEnabled(false);
  expect(filter.hidden).toBe(false);
});

it('Gemini does not restart adapter migration while the first account mirror is pending', async () => {
  const aKeys = await accountKeys('gemini', 'a');
  const bKeys = await accountKeys('gemini', 'b');
  extensionLocal[bKeys.live] = privateData('b');
  const harness = await makeHarness('gemini', 'a');
  harness.data = privateData('a');
  const firstMirror = deferred<void>();
  const initMirror = deferred<void>();
  const started = deferred<void>();
  let originalMirrors = 0;
  mockBrowser.storage.local.set.mockImplementation(async (values) => {
    const snapshot = structuredClone(values);
    const data = snapshot[aKeys.live] as FolderData | undefined;
    if (data?.folders[0]?.name === 'Private a') {
      originalMirrors += 1;
      if (originalMirrors === 1) {
        started.resolve();
        await firstMirror.promise;
      } else {
        await initMirror.promise;
      }
    }
    Object.assign(extensionLocal, snapshot);
  });
  // Keep the real adapter: init() can write a chrome mirror independently of saveData().
  const originalSave = harness.save();
  await started.promise;
  harness.data.folders[0].name = 'Queued latest a';
  const queuedSave = harness.save();
  await harness.switchTo('b');
  await harness.load();
  const returning = harness.switchTo('a');
  await vi.waitFor(() => {
    expect(originalMirrors === 2 || harness.storageKey === aKeys.live).toBe(true);
  });
  firstMirror.resolve();
  await originalSave;
  await queuedSave;
  await vi.waitFor(() => {
    expect((extensionLocal[aKeys.live] as FolderData).folders[0]?.name).toBe('Queued latest a');
  });
  initMirror.resolve();
  await returning;
  await harness.load();
  expect((extensionLocal[aKeys.live] as FolderData).folders[0]?.name).toBe('Queued latest a');
  expect(backupData(aKeys.backup)?.folders[0]?.name).toBe('Queued latest a');
  expect(originalMirrors).toBe(1);
});
