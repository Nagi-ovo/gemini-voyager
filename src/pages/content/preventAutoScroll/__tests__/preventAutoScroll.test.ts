import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { featureOwner } from '@/features/plugins/sites/featureOwners';

import { createGeminiBuiltinStartup } from '../../geminiBuiltinStartup';
import { claimPreventAutoScroll, startPreventAutoScrollBridge } from '../index';

const BRIDGE_ID = 'gv-prevent-auto-scroll-bridge';
const SCRIPT_ID = 'gv-prevent-auto-scroll-script';

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

function getBridge(): HTMLElement {
  const bridge = document.getElementById(BRIDGE_ID);
  if (!bridge) throw new Error('Expected prevent-auto-scroll bridge to exist.');
  return bridge;
}

function storageGetMock(): Mock {
  return chrome.storage.sync.get as unknown as Mock;
}

function addedListeners(): StorageListener[] {
  return (chrome.storage.onChanged.addListener as unknown as Mock).mock.calls.map(
    ([listener]) => listener as StorageListener,
  );
}

/** Deliver a sync change to every listener that was ever added, as Chrome would to live ones. */
function emitSyncChange(changes: Record<string, chrome.storage.StorageChange>): void {
  for (const listener of addedListeners()) listener(changes, 'sync');
}

function readKeysAskedFor(): string[] {
  return storageGetMock().mock.calls.flatMap(([keys]) =>
    keys && typeof keys === 'object' && !Array.isArray(keys) ? Object.keys(keys) : [],
  );
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The bridge and the switch-following claim as the Gemini start point runs them, with a
 * storage router feeding it; `unload` is page teardown.
 */
function startOnPage(): { started: Promise<void>; unload: () => void } {
  const cleanupManager = new CleanupManager();
  const startup = createGeminiBuiltinStartup(
    createOfficialAdmission(),
    cleanupManager,
    undefined,
    (site, feature) => (feature === 'preventAutoScroll' ? 'legacy' : featureOwner(site, feature)),
  );
  chrome.storage.onChanged.addListener((changes, areaName) =>
    startup.handleStorageChange(changes, areaName),
  );
  return {
    started: startup.startPreventAutoScroll(),
    unload: () => cleanupManager.executeCleanups(),
  };
}

/** Answer each storage read with the stored values it asks about. */
function mockStoredSettings(stored: Record<string, unknown>): void {
  storageGetMock().mockImplementation(async (defaults: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => [key, stored[key] ?? fallback]),
    ),
  );
}

describe('prevent auto scroll', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.getElementById(BRIDGE_ID)?.remove();
    document.getElementById(SCRIPT_ID)?.remove();
    vi.clearAllMocks();
    mockStoredSettings({});
  });

  it('syncs the initial enabled and Ctrl+Enter bridge state', async () => {
    mockStoredSettings({
      [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true,
      [StorageKeys.CTRL_ENTER_SEND]: true,
    });

    const { unload } = startOnPage();

    await vi.waitFor(() => {
      expect(getBridge().dataset.enabled).toBe('true');
      expect(getBridge().dataset.ctrlEnterSend).toBe('true');
    });
    expect(document.getElementById(SCRIPT_ID)?.getAttribute('src')).toContain(
      'prevent-auto-scroll.js',
    );
    unload();
  });

  it('updates bridge fields independently from storage changes', async () => {
    mockStoredSettings({ [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true });

    const { unload } = startOnPage();
    await vi.waitFor(() => expect(getBridge().dataset.enabled).toBe('true'));

    emitSyncChange({ [StorageKeys.CTRL_ENTER_SEND]: { oldValue: false, newValue: true } });
    expect(getBridge().dataset.enabled).toBe('true');
    expect(getBridge().dataset.ctrlEnterSend).toBe('true');

    emitSyncChange({
      [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: { oldValue: true, newValue: false },
    });
    await vi.waitFor(() => expect(getBridge().dataset.enabled).toBe('false'));
    expect(getBridge().dataset.ctrlEnterSend).toBe('true');
    unload();
  });

  it('page teardown switches prevention off and stops following storage', async () => {
    mockStoredSettings({ [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true });

    const { unload } = startOnPage();
    await vi.waitFor(() => expect(getBridge().dataset.enabled).toBe('true'));
    unload();

    expect(getBridge().dataset.enabled).toBe('false');
    emitSyncChange({
      [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: { oldValue: false, newValue: true },
    });
    await settle();
    expect(getBridge().dataset.enabled).toBe('false');
  });

  it.each(['same module', 'successor content script'] as const)(
    'an old release does not switch off a newer claim from the %s',
    async (copy) => {
      startPreventAutoScrollBridge()();
      let claimOld = claimPreventAutoScroll;
      let claimNew = claimPreventAutoScroll;
      if (copy === 'successor content script') {
        vi.resetModules();
        claimOld = (await import('../bridge')).claimPreventAutoScroll;
        vi.resetModules();
        claimNew = (await import('../bridge')).claimPreventAutoScroll;
      }
      const releaseOld = claimOld();
      const releaseNew = claimNew();
      try {
        releaseOld();
        expect(getBridge().dataset.enabled).toBe('true');
        releaseNew();
        expect(getBridge().dataset.enabled).toBe('false');
        releaseOld();
        expect(getBridge().dataset.enabled).toBe('false');
      } finally {
        releaseOld();
        releaseNew();
      }
    },
  );

  it('a late initial read after release leaves the bridge off', async () => {
    const read = deferred<Record<string, unknown>>();
    storageGetMock().mockImplementation(async (defaults: Record<string, unknown>) =>
      StorageKeys.PREVENT_AUTO_SCROLL_ENABLED in defaults ? read.promise : defaults,
    );

    const { unload } = startOnPage();
    await vi.waitFor(() =>
      expect(readKeysAskedFor()).toContain(StorageKeys.PREVENT_AUTO_SCROLL_ENABLED),
    );
    unload();
    read.resolve({ [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true });
    await settle();

    expect(getBridge().dataset.enabled).toBe('false');
  });

  it('bridge stop removes its storage listener', () => {
    const stop = startPreventAutoScrollBridge();
    const [listener] = addedListeners();

    stop();

    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
    listener({ [StorageKeys.CTRL_ENTER_SEND]: { oldValue: false, newValue: true } }, 'sync');
    expect(getBridge().dataset.ctrlEnterSend).toBeUndefined();
  });

  it('bridge keeps data-ctrl-enter-send in sync while no claim is held', async () => {
    mockStoredSettings({
      [StorageKeys.CTRL_ENTER_SEND]: true,
      [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true,
    });

    const stop = startPreventAutoScrollBridge();
    await vi.waitFor(() => expect(getBridge().dataset.ctrlEnterSend).toBe('true'));

    emitSyncChange({ [StorageKeys.CTRL_ENTER_SEND]: { oldValue: true, newValue: false } });
    expect(getBridge().dataset.ctrlEnterSend).toBe('false');
    // The bridge alone never switches prevention on, whatever the setting says.
    expect(getBridge().dataset.enabled).toBe('false');
    stop();
  });

  it('follows a local Ctrl+Enter send shortcut while the Gemini switch is off', async () => {
    vi.resetModules();
    storageGetMock().mockImplementation(
      (defaults: Record<string, unknown>, callback?: (value: Record<string, unknown>) => void) => {
        callback?.(defaults);
        return Promise.resolve(defaults);
      },
    );
    const { startSendKeyCoordinator } =
      await import('@/core/services/composer/sendKeys/sendKeyCoordinator');
    const coordinator = startSendKeyCoordinator('gemini');
    const { startPreventAutoScrollBridge: startBridge } = await import('../bridge');
    const stop = startBridge();
    try {
      await coordinator.whenReady();
      await settle();
      expect(getBridge().dataset.ctrlEnterSend).toBe('false');
      const release = coordinator.registerMainMode({
        source: 'local.send',
        mode: 'ctrlEnterSends',
      });
      expect(getBridge().dataset.ctrlEnterSend).toBe('true');
      emitSyncChange({ [StorageKeys.CTRL_ENTER_SEND]: { newValue: false } });
      expect(getBridge().dataset.ctrlEnterSend).toBe('true');
      release();
      expect(getBridge().dataset.ctrlEnterSend).toBe('false');
    } finally {
      stop();
      coordinator.stop();
    }
  });
});
