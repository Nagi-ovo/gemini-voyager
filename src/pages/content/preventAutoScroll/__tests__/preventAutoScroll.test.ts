import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';

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
  const startup = createGeminiBuiltinStartup(createOfficialAdmission(), cleanupManager);
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

  it('an old release does not switch off a newer claim', () => {
    startPreventAutoScrollBridge()();
    const releaseOld = claimPreventAutoScroll();
    const releaseNew = claimPreventAutoScroll();

    releaseOld();
    expect(getBridge().dataset.enabled).toBe('true');

    releaseNew();
    expect(getBridge().dataset.enabled).toBe('false');
    releaseOld();
    expect(getBridge().dataset.enabled).toBe('false');
  });

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
});
