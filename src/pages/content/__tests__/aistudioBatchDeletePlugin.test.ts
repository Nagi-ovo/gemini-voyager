// @vitest-environment-options { "url": "https://aistudio.google.com/library" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as accountIsolation from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { askConfirm } from '@/core/ui/confirm';
import * as toast from '@/core/ui/toast/toaster';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { admitBatchDelete } from '../batchDeleteStartup';
import { AIStudioFolderManager } from '../folder/__tests__/aistudioFolderManager';
import { LibraryBatchDeleter } from '../folder/aistudioLibraryBatchDelete';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

vi.mock('@/core/ui/confirm', () => ({ askConfirm: vi.fn(async () => 'confirm') }));
const ID = OFFICIAL_PLUGIN_IDS.aistudioBatchDelete;
const ENABLED = StorageKeys.BATCH_DELETE_ENABLED;
let harness: LifecycleHarness;
let host: PluginHost | null;
let folderManager: AIStudioFolderManager | null;
const row = () => document.querySelector<HTMLElement>('tr')!;
const toolbar = () => document.querySelector('.gv-aistudio-library-select');
const mounted = () => host?.getStatuses().find((entry) => entry.id === ID)?.kind === 'mounted';
async function flush(): Promise<void> {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
async function press(): Promise<void> {
  row().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await vi.advanceTimersByTimeAsync(500);
  row().dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}
async function start(admit = true, attachLibrary = true): Promise<void> {
  const admission = createOfficialAdmission();
  if (admit) admitBatchDelete(admission, 'aistudio');
  admission.close();
  host = new PluginHost({
    url: location.href,
    sources: [new BuiltinPluginSource()],
    doc: document,
    admission,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  if (attachLibrary) {
    folderManager = new AIStudioFolderManager();
    await folderManager.init();
  }
  await flush();
}
function write(key: string, value: unknown): void {
  if (value === undefined) harness.storage.sync.delete(key);
  else harness.storage.sync.set(key, value);
  harness.emitStorageChange({ [key]: { newValue: value } }, 'sync');
}
beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/library');
  document.body.innerHTML =
    '<div class="nav-content v3-left-nav"><nav><div class="empty-space"></div></nav></div><table class="mat-mdc-table"><tr class="mat-mdc-row"><td><a href="/prompts/p1">One</a></td></tr></table>';
  harness = installLifecycleHarness();
  harness.storage.local.set(StorageKeys.FOLDER_DATA_AISTUDIO, { folders: [], folderContents: {} });
  host = null;
  folderManager = null;
});
afterEach(async () => {
  (folderManager as unknown as { destroy(): void } | null)?.destroy();
  host?.stop();
  await flush();
  harness.restore();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

describe('AI Studio batch delete through the packaged source and PluginHost', () => {
  it.each([
    [undefined, undefined, true],
    [false, undefined, false],
    [true, undefined, true],
    [undefined, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])(
    'binds batch switch %s and folder switch %s to availability %s',
    async (enabled, folders, expected) => {
      if (enabled !== undefined) harness.storage.sync.set(ENABLED, enabled);
      if (folders !== undefined) harness.storage.sync.set(StorageKeys.FOLDER_ENABLED, folders);
      await start();
      expect(mounted()).toBe(expected);
      await press();
      expect(!!toolbar()).toBe(expected);
      expect(harness.storage.sync.get(ENABLED)).toBe(enabled);
    },
  );

  it('does not bind selection before native library attachment succeeds', async () => {
    await start(true, false);
    await press();
    expect(toolbar()).toBeNull();
    folderManager = new AIStudioFolderManager();
    await folderManager.init();
    await press();
    expect(toolbar()).not.toBeNull();
  });

  it('does not scan account headers for unrelated page mutations while idle or selecting', async () => {
    await start();
    const detect = vi.spyOn(accountIsolation, 'detectAccountContextFromDocument');
    const mutateHeader = async () => {
      detect.mockClear();
      const header = document.createElement('span');
      header.title = 'unrelated';
      document.body.append(header);
      await flush();
      expect(detect).not.toHaveBeenCalled();
    };
    await mutateHeader();
    await press();
    await mutateHeader();
  });

  it('keeps library row selection inactive on prompt routes', async () => {
    window.history.replaceState({}, '', '/prompts/p1');
    await start();
    const detect = vi.spyOn(accountIsolation, 'detectAccountContextFromDocument');
    await press();
    expect(toolbar()).toBeNull();
    detect.mockClear();
    document.body.append(document.createElement('section'));
    await flush();
    expect(detect).not.toHaveBeenCalled();
    window.history.replaceState({}, '', '/library');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.advanceTimersByTimeAsync(0);
    await press();
    expect(toolbar()).not.toBeNull();
  });

  it('follows live folder availability while the batch switch remains missing', async () => {
    await start();
    await press();
    write(StorageKeys.FOLDER_ENABLED, false);
    await flush();
    expect(mounted()).toBe(false);
    expect(toolbar()).toBeNull();
    write(StorageKeys.FOLDER_ENABLED, true);
    await flush();
    await press();
    expect(mounted()).toBe(true);
    expect(toolbar()).not.toBeNull();
    expect(harness.storage.sync.has(ENABLED)).toBe(false);
  });

  it('does not admit the batch lifecycle from unsupported initial apps routes', async () => {
    window.history.replaceState({}, '', '/apps');
    await start();
    expect(mounted()).toBe(false);
    window.history.replaceState({}, '', '/library');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await press();
    expect(toolbar()).toBeNull();
  });

  it('keeps an admitted plugin inactive under the AI Studio master switch', async () => {
    harness.storage.sync.set(StorageKeys.GV_AISTUDIO_ENABLED, false);
    await start();
    await press();
    expect(mounted()).toBe(false);
    expect(toolbar()).toBeNull();
  });

  it('does nothing without admission at the native start point', async () => {
    await start(false);
    await press();
    expect(mounted()).toBe(false);
    expect(toolbar()).toBeNull();
  });

  it('clears live selection immediately and re-enables one long-press handler', async () => {
    await start();
    await press();
    expect(row().classList.contains('gv-library-row-selected')).toBe(true);
    for (let i = 0; i < 2; i++) {
      write(ENABLED, false);
      await flush();
      expect(toolbar()).toBeNull();
      expect(row().classList.contains('gv-library-row-selected')).toBe(false);
      await press();
      expect(toolbar()).toBeNull();
      write(ENABLED, true);
      await flush();
      await press();
      expect(document.querySelectorAll('.gv-aistudio-library-select')).toHaveLength(1);
      expect(document.querySelector('[data-selection-count]')?.textContent).toContain('1');
    }
  });

  it('finishes the confirmed immutable run while off and blocks re-enable until it settles', async () => {
    let finish!: (result: { successCount: number; failedCount: number }) => void;
    const run = vi.spyOn(LibraryBatchDeleter.prototype, 'run').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const second = document.createElement('tr');
    second.className = 'mat-mdc-row';
    second.innerHTML = '<td><a href="/prompts/p2">Two</a></td>';
    row().parentElement!.append(second);
    await start();
    await press();
    second.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    document.querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!.click();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toEqual(['p1', 'p2']);
    const isCurrent = run.mock.calls[0][1]!;
    write(ENABLED, false);
    await flush();
    expect(toolbar()).toBeNull();
    expect(isCurrent()).toBe(true);
    write(ENABLED, true);
    await flush();
    await press();
    expect(toolbar()).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    finish({ successCount: 2, failedCount: 0 });
    await flush();
    await press();
    expect(toolbar()).not.toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('destroys its toaster immediately when disabled during an accepted run', async () => {
    const createToaster = toast.createToaster;
    const destroyed = vi.fn();
    vi.spyOn(toast, 'createToaster').mockImplementation(() => {
      const toaster = createToaster();
      const destroy = toaster.destroy;
      toaster.destroy = () => {
        destroyed();
        destroy();
      };
      return toaster;
    });
    let finish!: (result: { successCount: number; failedCount: number }) => void;
    vi.spyOn(LibraryBatchDeleter.prototype, 'run').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await start();
    await press();
    document.querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!.click();
    await flush();
    destroyed.mockClear();
    write(ENABLED, false);
    await flush();
    expect(destroyed).toHaveBeenCalled();
    finish({ successCount: 1, failedCount: 0 });
    await flush();
  });

  it('keeps confirmation and deletion current while the account header is temporarily absent', async () => {
    const account = document.createElement('span');
    account.title = 'first@example.com';
    document.body.append(account);
    let answer!: (value: 'confirm') => void;
    vi.mocked(askConfirm).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    let finish!: (result: { successCount: number; failedCount: number }) => void;
    const run = vi.spyOn(LibraryBatchDeleter.prototype, 'run').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await start();
    await press();
    document.querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!.click();
    await flush();
    const signal = vi.mocked(askConfirm).mock.calls.at(-1)![0].signal!;
    account.title = '';
    await flush();
    expect(signal.aborted).toBe(false);
    answer('confirm');
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    const current = run.mock.calls[0][1]!;
    expect(current()).toBe(true);
    account.title = 'first@example.com';
    await flush();
    expect(current()).toBe(true);
    account.title = '';
    await flush();
    expect(current()).toBe(true);
    account.title = 'second@example.com';
    await flush();
    expect(current()).toBe(false);
    finish({ successCount: 0, failedCount: 1 });
    await flush();
  });

  it('dismisses an unaccepted confirmation on disable and cannot delete from its late answer', async () => {
    let answer!: (value: 'confirm') => void;
    vi.mocked(askConfirm).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const run = vi.spyOn(LibraryBatchDeleter.prototype, 'run');
    await start();
    await press();
    document.querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!.click();
    await flush();
    const signal = vi.mocked(askConfirm).mock.calls.at(-1)![0].signal!;
    write(ENABLED, false);
    await flush();
    expect(signal.aborted).toBe(true);
    expect(toolbar()).toBeNull();
    answer('confirm');
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it('ignores a late old confirmation after exit and a fresh selection', async () => {
    let answer!: (value: 'confirm') => void;
    vi.mocked(askConfirm).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const run = vi.spyOn(LibraryBatchDeleter.prototype, 'run');
    await start();
    await press();
    document.querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!.click();
    await flush();
    document.querySelector<HTMLButtonElement>('.gv-multi-select-exit-btn')!.click();
    await press();
    answer('confirm');
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(row().classList.contains('gv-library-row-selected')).toBe(true);
  });

  it('invalidates an accepted run across route departure and return even while disabled', async () => {
    let finish!: (result: { successCount: number; failedCount: number }) => void;
    const run = vi.spyOn(LibraryBatchDeleter.prototype, 'run').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await start();
    await press();
    document.querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!.click();
    await flush();
    const isCurrent = run.mock.calls[0][1]!;
    write(ENABLED, false);
    await flush();
    window.history.replaceState({}, '', '/u/1/library');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.history.replaceState({}, '', '/library');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(isCurrent()).toBe(false);
    finish({ successCount: 0, failedCount: 1 });
    await flush();
    expect(toolbar()).toBeNull();
  });

  it.each(['text', 'title'])(
    'retires a disabled drain when account %s evidence changes and returns',
    async (evidence) => {
      const account = document.createElement('span');
      if (evidence === 'text') {
        account.className = 'account-switcher-text';
        account.append(document.createTextNode('first@example.com'));
      } else account.setAttribute(evidence, 'first@example.com');
      document.body.append(account);
      let finish!: (result: { successCount: number; failedCount: number }) => void;
      const run = vi.spyOn(LibraryBatchDeleter.prototype, 'run').mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      await start();
      await press();
      document.querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!.click();
      await flush();
      const isCurrent = run.mock.calls[0][1]!;
      write(ENABLED, false);
      await flush();
      for (const email of ['second@example.com', 'first@example.com']) {
        if (evidence === 'text') (account.firstChild as Text).data = email;
        else account.setAttribute(evidence, email);
        await flush();
      }
      expect(isCurrent()).toBe(false);
      finish({ successCount: 0, failedCount: 1 });
      await flush();
    },
  );

  it('keeps folder creation and native library drag sources while batch delete is off', async () => {
    harness.storage.sync.set(ENABLED, false);
    harness.storage.local.set(StorageKeys.FOLDER_DATA_AISTUDIO, {
      folders: [],
      folderContents: {},
    });
    await start();
    expect(row().draggable).toBe(true);
    expect(document.querySelector('.gv-library-drop-zone')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!.click();
    await flush();
    const tree = document.querySelector('.gv-aistudio-folder-tree')!.shadowRoot!;
    const input = tree.querySelector<HTMLInputElement>('input')!;
    input.value = 'Still native';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(tree.textContent).toContain('Still native');
    await press();
    expect(toolbar()).toBeNull();
    expect(harness.storage.local.get(StorageKeys.FOLDER_DATA_AISTUDIO)).toMatchObject({
      folders: [expect.objectContaining({ name: 'Still native' })],
    });
  });
});
