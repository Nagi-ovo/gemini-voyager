// @vitest-environment-options { "url": "https://gemini.google.com/app" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';
import { confirmDriver } from '@/tests/confirmDriver';

import { admitBatchDelete } from '../batchDeleteStartup';
import { NativeConversationMenus } from '../folder/NativeConversationMenus';
import { FolderManager } from '../folder/__tests__/geminiFolderManager';
import { mountSidebar } from '../folder/__tests__/sidebarRuntimeHarness';
import { sidebarTree, sidebarTreeRoot } from '../folder/__tests__/sidebarTreeDriver';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const ID = OFFICIAL_PLUGIN_IDS.geminiBatchDelete;
const ENABLED = StorageKeys.BATCH_DELETE_ENABLED;
const FIRST = '1111222233334444';
const SECOND = '5555666677778888';
let harness: LifecycleHarness;
let host: PluginHost | null;
let manager: FolderManager | null;
let rows: HTMLElement[];
let sidebar: ReturnType<typeof mountSidebar>;

async function flush(): Promise<void> {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

async function start(admit = true, foldersFirst = false): Promise<void> {
  if (foldersFirst) {
    manager = new FolderManager();
    await manager.init();
  }
  const admission = createOfficialAdmission();
  if (admit) admitBatchDelete(admission, 'gemini');
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
  if (!foldersFirst) {
    manager = new FolderManager();
    await manager.init();
  }
  await flush();
}

function write(values: Record<string, unknown>): void {
  const changes: Record<string, { newValue?: unknown }> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) harness.storage.sync.delete(key);
    else harness.storage.sync.set(key, value);
    changes[key] = { newValue: value };
  }
  harness.emitStorageChange(changes, 'sync');
}

const mounted = () => host?.getStatuses().find((entry) => entry.id === ID)?.kind === 'mounted';
const panel = () => document.querySelector<HTMLElement>('.gv-folder-container')!;
const selected = () => rows.filter((row) => row.classList.contains('gv-conversation-selected'));
const deleteButton = () => panel().querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!;
async function press(row = rows[0]): Promise<void> {
  row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await vi.advanceTimersByTimeAsync(500);
  row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  row.click();
  await flush();
}

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  window.history.replaceState({}, '', '/app');
  localStorage.clear();
  harness = installLifecycleHarness();
  host = null;
  manager = null;
  vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(false);
  sidebar = mountSidebar();
  rows = [FIRST, SECOND].map((id) => {
    const row = document.createElement('div');
    row.id = `batch-chat-${id}`;
    row.dataset.testId = 'conversation';
    row.setAttribute('jslog', `["c_${id}"]`);
    row.innerHTML = `<a href="/app/${id}"><span class="conversation-title">Chat ${id}</span></a>`;
    sidebar.recentsSection.appendChild(row);
    return row;
  });
  harness.storage.local.set(StorageKeys.PLUGINS_STATE, {
    [ID]: { enabled: false, installedAt: 1 },
  });
  harness.storage.local.set(StorageKeys.FOLDER_DATA, {
    folders: [
      { id: 'root', name: 'Saved', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
    ],
    folderContents: {
      root: [
        {
          conversationId: `c_${FIRST}`,
          title: 'Saved chat',
          url: `https://gemini.google.com/app/${FIRST}`,
          addedAt: 1,
        },
      ],
    },
  });
});
afterEach(async () => {
  manager?.destroy();
  host?.stop();
  await flush();
  harness.restore();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  localStorage.clear();
});

describe('Gemini batch delete through the real builtin source, host and folder owner', () => {
  it.each([undefined, false, true])(
    'preserves missing/default on and explicit %s over stale plugin preferences',
    async (value) => {
      if (value !== undefined) harness.storage.sync.set(ENABLED, value);
      await start();
      expect(mounted()).toBe(value !== false);
      await press();
      expect(selected()).toHaveLength(value === false ? 0 : 1);
      expect(rows[0].draggable).toBe(true);
    },
  );

  it.each([undefined, false, true])(
    'keeps the existing folder availability requirement for switch %s',
    async (value) => {
      if (value !== undefined) harness.storage.sync.set(ENABLED, value);
      harness.storage.sync.set(StorageKeys.FOLDER_ENABLED, false);
      await start();
      await press();
      expect(mounted()).toBe(false);
      expect(selected()).toEqual([]);
      expect(harness.storage.sync.get(ENABLED)).toBe(value);
    },
  );

  it('does not bind selection before native admission, while native folder drag still works', async () => {
    await start(false);
    await press();
    expect(mounted()).toBe(false);
    expect(selected()).toEqual([]);
    expect(rows[0].draggable).toBe(true);
    expect(panel()).not.toBeNull();
  });

  it('clears selection and a pending confirm immediately, then binds exactly one long press after off/on', async () => {
    await start();
    await press();
    deleteButton().click();
    expect(confirmDriver.isOpen()).toBe(true);
    write({ [ENABLED]: false });
    await flush();
    expect(selected()).toEqual([]);
    expect(confirmDriver.isOpen()).toBe(false);
    expect(panel().classList.contains('gv-multi-select-mode')).toBe(false);
    expect(
      harness.ledger
        .openListeners()
        .filter((entry) => entry.startsWith('div#batch-chat-') && entry.includes(':mousedown:')),
    ).toEqual([]);
    write({ [ENABLED]: true });
    await flush();
    await press();
    expect(selected()).toHaveLength(1);
    rows[1].click();
    expect(selected()).toHaveLength(2);
    const rowPress = harness.ledger
      .openListeners()
      .filter((entry) => entry.startsWith('div#batch-chat-') && entry.includes(':mousedown:'));
    expect(rowPress).toHaveLength(2);
  });

  it('drags every selected chat into a folder after the folders turn off and on', async () => {
    const dragStart = (row: HTMLElement) => {
      const setData = vi.fn();
      const event = new Event('dragstart', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', {
        value: { setData, setDragImage: vi.fn(), effectAllowed: 'all' },
      });
      row.dispatchEvent(event);
      const payload = setData.mock.calls[0]?.[1];
      return typeof payload === 'string' ? JSON.parse(payload) : null;
    };
    await start();
    await vi.advanceTimersByTimeAsync(100);
    expect(rows.map((row) => row.draggable)).toEqual([true, true]);

    manager!.setFolders(false);
    await flush();
    // The folders' teardown gives the rows back as Gemini drew them.
    expect(rows.map((row) => row.draggable)).toEqual([false, false]);
    expect(rows.map((row) => row.dataset.gvConvDragAttached)).toEqual([undefined, undefined]);
    expect(dragStart(rows[0])).toBeNull();

    manager!.setFolders(true);
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    await press();
    rows[1].click();
    expect(selected()).toHaveLength(2);

    expect(
      dragStart(rows[0])?.conversations?.map(
        ({ conversationId }: { conversationId: string }) => conversationId,
      ),
    ).toEqual([`c_${FIRST}`, `c_${SECOND}`]);
  });

  it('finishes only the confirmed snapshot while off and holds re-enable until that run drains', async () => {
    let finishFirst!: (value: boolean) => void;
    const deleting = vi
      .spyOn(NativeConversationMenus.prototype, 'deleteConversation')
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValue(true);
    await start();
    await press();
    rows[1].click();
    deleteButton().click();
    confirmDriver.answer(confirmDriver.labels()[1]);
    await flush();
    expect(deleting).toHaveBeenCalledTimes(1);
    write({ [ENABLED]: false });
    await flush();
    expect(selected()).toEqual([]);
    expect(panel().classList.contains('gv-multi-select-mode')).toBe(false);
    write({ [ENABLED]: true });
    await flush();
    await press();
    expect(selected()).toEqual([]);
    expect(deleting).toHaveBeenCalledTimes(1);
    finishFirst(true);
    await vi.advanceTimersByTimeAsync(501);
    await flush();
    expect(deleting.mock.calls.map(([id]) => id)).toEqual([`c_${FIRST}`, `c_${SECOND}`]);
    expect(mounted()).toBe(true);
    await press();
    expect(selected()).toHaveLength(1);
    expect(deleting).toHaveBeenCalledTimes(2);
  });

  it('waits for a retired folder owner before re-enabling native selection', async () => {
    let finishFirst!: (value: boolean) => void;
    const deleting = vi
      .spyOn(NativeConversationMenus.prototype, 'deleteConversation')
      .mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            finishFirst = resolve;
          }),
      );
    // Native folders may subscribe before PluginHost, so they retire their registration first.
    await start(true, true);
    await press();
    rows[1].click();
    deleteButton().click();
    confirmDriver.answer(confirmDriver.labels()[1]);
    await flush();
    write({ [StorageKeys.FOLDER_ENABLED]: false });
    await flush();
    expect(deleting.mock.calls[0][1]?.aborted).toBe(true);
    write({ [StorageKeys.FOLDER_ENABLED]: true });
    await flush();
    await press();
    expect(selected()).toEqual([]);
    expect(mounted()).toBe(false);
    finishFirst(false);
    await flush();
    expect(deleting).toHaveBeenCalledTimes(1);
    expect(mounted()).toBe(true);
    await press();
    expect(selected()).toHaveLength(1);
  });

  it('stops future confirmed items when the account route changes during a run', async () => {
    let finishFirst!: (value: boolean) => void;
    const deleting = vi
      .spyOn(NativeConversationMenus.prototype, 'deleteConversation')
      .mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            finishFirst = resolve;
          }),
      );
    await start();
    await press();
    rows[1].click();
    deleteButton().click();
    confirmDriver.answer(confirmDriver.labels()[1]);
    await flush();
    window.history.replaceState({}, '', '/u/1/app');
    finishFirst(true);
    await vi.advanceTimersByTimeAsync(501);
    expect(deleting).toHaveBeenCalledTimes(1);
    expect(selected()).toEqual([]);
  });

  it('retires a same-slot account confirmation and aborts native waits during a disabled drain', async () => {
    const account = document.createElement('button');
    account.dataset.email = 'first@example.com';
    document.body.appendChild(account);
    const deleting = vi
      .spyOn(NativeConversationMenus.prototype, 'deleteConversation')
      .mockImplementation(
        (_id, signal) =>
          new Promise<boolean>((resolve) => {
            signal?.addEventListener('abort', () => resolve(false), { once: true });
          }),
      );
    await start();
    await press();
    deleteButton().click();
    expect(confirmDriver.isOpen()).toBe(true);
    account.dataset.email = 'second@example.com';
    await flush();
    expect(confirmDriver.isOpen()).toBe(false);
    expect(deleting).not.toHaveBeenCalled();
    await press();
    rows[1].click();
    deleteButton().click();
    confirmDriver.answer(confirmDriver.labels()[1]);
    await flush();
    expect(deleting).toHaveBeenCalledTimes(1);
    write({ [ENABLED]: false });
    await flush();
    account.dataset.email = 'third@example.com';
    await flush();
    expect(deleting.mock.calls[0][1]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(501);
    expect(deleting).toHaveBeenCalledTimes(1);
    expect(selected()).toEqual([]);
  });

  it('keeps a later folder selection when an accepted native run finishes', async () => {
    let finish!: (value: boolean) => void;
    vi.spyOn(NativeConversationMenus.prototype, 'deleteConversation').mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    await start();
    await press();
    deleteButton().click();
    confirmDriver.answer(confirmDriver.labels()[1]);
    await flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await press(sidebarTree(panel()).conversationRow('root', `Chat ${FIRST}`));
    const count = panel().querySelector('[data-selection-count="true"]')?.textContent;
    finish(false);
    await flush();
    expect(panel().classList.contains('gv-multi-select-mode')).toBe(true);
    expect(panel().querySelector('[data-selection-count="true"]')?.textContent).toBe(count);
    expect(deleteButton()).not.toBeNull();
  });

  it('preserves active folder selection and removal when batch delete is turned off', async () => {
    await start();
    const savedRow = sidebarTree(panel()).conversationRow('root', `Chat ${FIRST}`);
    await press(savedRow);
    expect(panel().classList.contains('gv-multi-select-mode')).toBe(true);
    const before = panel().querySelector('[data-selection-count="true"]')?.textContent;
    write({ [ENABLED]: false });
    await flush();
    expect(panel().classList.contains('gv-multi-select-mode')).toBe(true);
    expect(panel().querySelector('[data-selection-count="true"]')?.textContent).toBe(before);
    deleteButton().click();
    expect(confirmDriver.isOpen()).toBe(true);
    confirmDriver.answer(confirmDriver.labels()[1]);
    await flush();
    expect(sidebarTreeRoot(panel()).textContent).not.toContain(`Chat ${FIRST}`);
    expect(rows[0].isConnected).toBe(true);
    expect(rows[0].draggable).toBe(true);
  });
});
