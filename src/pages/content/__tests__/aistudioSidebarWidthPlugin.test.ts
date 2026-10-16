// @vitest-environment-options { "url": "https://aistudio.google.com/library" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { startAIStudioSidebarLayout } from '../aistudioSidebarStartup';
import { AIStudioFolderManager } from '../folder/aistudio';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const ID = OFFICIAL_PLUGIN_IDS.aistudioSidebarWidth;
const WIDTH = StorageKeys.AISTUDIO_SIDEBAR_WIDTH;
const ENABLED = StorageKeys.AISTUDIO_SIDEBAR_WIDTH_ENABLED;
const HANDLE = '.gv-sidebar-resize-handle';
let harness: LifecycleHarness;
let host: PluginHost | null;
let folderManager: AIStudioFolderManager | null;
let nav: HTMLElement;

async function flush(): Promise<void> {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}

async function start(admit = true, url = location.href): Promise<void> {
  const admission = createOfficialAdmission();
  if (admit) startAIStudioSidebarLayout(admission);
  admission.close();
  host = new PluginHost({
    url,
    sources: [new BuiltinPluginSource()],
    doc: document,
    admission,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  await flush();
}

function popupWrites(values: Record<string, unknown>): void {
  const changes: Record<string, { newValue?: unknown }> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) harness.storage.sync.delete(key);
    else harness.storage.sync.set(key, value);
    changes[key] = { newValue: value };
  }
  harness.emitStorageChange(changes, 'sync');
}

const mounted = () => host?.getStatuses().find((entry) => entry.id === ID)?.kind === 'mounted';

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/library');
  document.head.innerHTML = '';
  document.body.className = '';
  document.body.innerHTML =
    '<div class="nav-content v3-left-nav expanded" style="width: 300px; position: sticky"><nav><div class="empty-space"></div></nav></div>';
  document.documentElement.className = '';
  nav = document.querySelector('.nav-content')!;
  localStorage.clear();
  harness = installLifecycleHarness();
  host = null;
  folderManager = null;
  // A leftover plugin preference must not override the native switch or width.
  harness.storage.local.set(StorageKeys.PLUGINS_STATE, {
    [ID]: { enabled: false, installedAt: 1, settings: { widthPx: 580 } },
  });
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
  localStorage.clear();
});

describe('AI Studio sidebar width through the real builtin source and plugin host', () => {
  it.each([undefined, false, true])(
    'respects the AI Studio switch %s independently of Gemini and stale plugin state',
    async (enabled) => {
      if (enabled !== undefined) harness.storage.sync.set(ENABLED, enabled);
      harness.storage.sync.set(StorageKeys.SIDEBAR_WIDTH_ENABLED, false);
      harness.storage.sync.set(WIDTH, 420);
      await start();
      expect(mounted()).toBe(enabled !== false);
      expect(nav.style.width).toBe(enabled === false ? '300px' : '420px');
      expect(nav.querySelectorAll(HANDLE)).toHaveLength(enabled === false ? 0 : 1);
    },
  );

  it.each([
    [undefined, false, false],
    [undefined, true, true],
    [undefined, undefined, true],
    [true, false, true],
    [false, true, false],
    [false, false, false],
    ['true', false, false],
  ])(
    'derives switch %s from folders %s only without an explicit boolean',
    async (enabled, folders, expected) => {
      if (enabled !== undefined) harness.storage.sync.set(ENABLED, enabled);
      if (folders !== undefined) harness.storage.sync.set(StorageKeys.FOLDER_ENABLED, folders);
      harness.storage.sync.set(WIDTH, 420);
      await start();
      expect(mounted()).toBe(expected);
      expect(nav.style.width).toBe(expected ? '420px' : '300px');
      expect(nav.querySelectorAll(HANDLE)).toHaveLength(expected ? 1 : 0);
      expect(harness.storage.sync.get(ENABLED)).toBe(enabled);
    },
  );

  it('follows live folder toggles while the width switch is missing without persisting the derived switch', async () => {
    harness.storage.sync.set(StorageKeys.FOLDER_ENABLED, false);
    harness.storage.sync.set(WIDTH, 420);
    await start();
    for (const folders of [true, false, true, undefined, false]) {
      popupWrites({ [StorageKeys.FOLDER_ENABLED]: folders });
      await flush();
      const expected = folders !== false;
      expect(mounted()).toBe(expected);
      expect(nav.style.width).toBe(expected ? '420px' : '300px');
      expect(nav.querySelectorAll(HANDLE)).toHaveLength(expected ? 1 : 0);
      expect(harness.storage.sync.has(ENABLED)).toBe(false);
    }
    popupWrites({ [ENABLED]: true });
    await flush();
    expect(mounted()).toBe(true);
    for (const folders of [true, false]) {
      popupWrites({ [StorageKeys.FOLDER_ENABLED]: folders });
      await flush();
      expect(mounted()).toBe(true);
    }
    popupWrites({ [ENABLED]: undefined });
    await flush();
    expect(mounted()).toBe(false);
    popupWrites({ [StorageKeys.FOLDER_ENABLED]: true });
    await flush();
    expect(mounted()).toBe(true);
    popupWrites({ [ENABLED]: false });
    await flush();
    for (const folders of [false, true]) {
      popupWrites({ [StorageKeys.FOLDER_ENABLED]: folders });
      await flush();
      expect(mounted()).toBe(false);
      expect(nav.querySelector(HANDLE)).toBeNull();
      expect(nav.style.width).toBe('300px');
    }
  });

  it.each(['aistudio.google.com', 'aistudio.google.cn'])(
    'keeps layout off under the master switch, then mounts immediately on %s',
    async (hostname) => {
      harness.storage.sync.set(StorageKeys.GV_AISTUDIO_ENABLED, false);
      harness.storage.sync.set(ENABLED, true);
      harness.storage.sync.set(WIDTH, 420);
      await start(true, `https://${hostname}/library`);
      expect(mounted()).toBe(false);
      expect(nav.style.width).toBe('300px');
      expect(nav.querySelector(HANDLE)).toBeNull();
      expect(harness.ledger.openObservers()).toEqual([]);
      popupWrites({ [StorageKeys.GV_AISTUDIO_ENABLED]: true });
      await flush();
      expect(mounted()).toBe(true);
      expect(nav.style.width).toBe('420px');
      expect(nav.querySelectorAll(HANDLE)).toHaveLength(1);
      popupWrites({ [StorageKeys.GV_AISTUDIO_ENABLED]: false });
      await flush();
      expect(mounted()).toBe(false);
      expect(nav.style.width).toBe('300px');
      expect(nav.querySelector(HANDLE)).toBeNull();
      expect(harness.ledger.openObservers()).toEqual([]);
    },
  );

  it.each([
    [440, '510', '440px'],
    [undefined, '510', '280px'],
    [100, '510px', '510px'],
    ['440', '470', '470px'],
    [700, null, '360px'],
    [null, '900', '360px'],
  ])('loads sync %s with localStorage %s as %s', async (sync, local, expected) => {
    if (sync !== undefined) harness.storage.sync.set(WIDTH, sync);
    if (local !== null) localStorage.setItem(WIDTH, local);
    await start();
    expect(mounted()).toBe(true);
    expect(nav.style.width).toBe(expected);
    expect(harness.storage.sync.get(WIDTH)).toBe(sync);
  });

  it.each([
    ['490', '490px'],
    [null, '360px'],
  ])(
    'keeps the localStorage/default fallback when sync reading fails (%s)',
    async (local, expected) => {
      if (local !== null) localStorage.setItem(WIDTH, local);
      vi.mocked(chrome.storage.sync.get).mockRejectedValue(new Error('sync unavailable'));
      await start();
      expect(mounted()).toBe(true);
      expect(nav.style.width).toBe(expected);
    },
  );

  it('applies live width in place and restores native layout on off, then creates only one handle on re-enable', async () => {
    await start();
    const handle = nav.querySelector(HANDLE);
    expect(handle).not.toBeNull();
    popupWrites({ [WIDTH]: 460.6 });
    await flush();
    expect(nav.style.width).toBe('461px');
    expect(nav.querySelector(HANDLE)).toBe(handle);
    for (const value of ['500', undefined, null]) {
      popupWrites({ [WIDTH]: value });
      await flush();
      expect(nav.style.width).toBe('461px');
      expect(nav.querySelector(HANDLE)).toBe(handle);
    }
    popupWrites({ [ENABLED]: false });
    await flush();
    expect(mounted()).toBe(false);
    expect(nav.style.width).toBe('300px');
    expect(nav.style.position).toBe('sticky');
    expect(nav.style.minWidth).toBe('');
    expect(nav.style.maxWidth).toBe('');
    expect(nav.style.flex).toBe('');
    expect(nav.querySelector(HANDLE)).toBeNull();
    expect(harness.ledger.openObservers()).toEqual([]);
    popupWrites({ [WIDTH]: 390, [ENABLED]: true });
    await flush();
    expect(mounted()).toBe(true);
    expect(nav.style.width).toBe('390px');
    expect(nav.querySelectorAll(HANDLE)).toHaveLength(1);
    popupWrites({ [ENABLED]: undefined });
    await flush();
    expect(mounted()).toBe(true);
    expect(nav.querySelectorAll(HANDLE)).toHaveLength(1);
  });

  it('does not mount before its production native start point admits it', async () => {
    harness.storage.sync.set(ENABLED, true);
    await start(false);
    expect(mounted()).toBe(false);
    expect(nav.style.width).toBe('300px');
    expect(nav.querySelector(HANDLE)).toBeNull();
  });

  it('preserves the native initial-route restriction on an unsupported AI Studio apps page', async () => {
    window.history.replaceState({}, '', '/apps');
    harness.storage.sync.set(ENABLED, true);
    await start();
    expect(mounted()).toBe(false);
    expect(nav.style.width).toBe('300px');
    expect(nav.querySelector(HANDLE)).toBeNull();
  });

  it('starts native folders and creates a folder through their UI while the width plugin is off', async () => {
    harness.storage.sync.set(ENABLED, false);
    harness.storage.local.set(StorageKeys.FOLDER_DATA_AISTUDIO, {
      folders: [],
      folderContents: {},
    });
    await start();
    folderManager = new AIStudioFolderManager();
    await folderManager.init();
    await flush();
    expect(mounted()).toBe(false);
    expect(nav.querySelector(HANDLE)).toBeNull();
    expect(nav.style.width).toBe('300px');
    const panel = nav.querySelector('.gv-folder-container')!;
    expect(panel).not.toBeNull();
    expect(document.querySelector('.gv-library-drop-zone')).not.toBeNull();
    const add = panel.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!;
    expect(add.disabled).toBe(false);
    add.click();
    await flush();
    const tree = panel.querySelector('.gv-aistudio-folder-tree')!.shadowRoot!;
    const input = tree.querySelector<HTMLInputElement>('input')!;
    expect(input).not.toBeNull();
    input.value = 'Width independent folder';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(tree.textContent).toContain('Width independent folder');
    expect(harness.storage.local.get(StorageKeys.FOLDER_DATA_AISTUDIO)).toEqual(
      expect.objectContaining({
        folders: [expect.objectContaining({ name: 'Width independent folder' })],
      }),
    );
    expect(nav.querySelector(HANDLE)).toBeNull();
    expect(nav.style.width).toBe('300px');
  });
});
