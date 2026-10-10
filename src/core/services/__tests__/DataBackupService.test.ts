import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { budgetCopyBridge } from '@/features/storage/__tests__/budgetCopyBridge';

import { DataBackupService } from '../DataBackupService';

// One in-memory extension storage behind both browser.storage.local (writes)
// and chrome.storage.local (StorageQuotaService's headroom probe). `set` rejects
// past `QUOTA_BYTES`, counting bytes the way Chrome does.
const extension = vi.hoisted(() => {
  const store: Record<string, unknown> = {};
  const itemBytes = (key: string, value: unknown): number => {
    const encoder = new TextEncoder();
    return encoder.encode(key).byteLength + encoder.encode(JSON.stringify(value)).byteLength;
  };
  const bytesIn = (items: Record<string, unknown>, keys?: string[] | null): number =>
    (keys ?? Object.keys(items))
      .filter((key) => key in items)
      .reduce((sum, key) => sum + itemBytes(key, items[key]), 0);
  const list = (keys?: string | string[] | null): string[] =>
    keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
  const area = {
    QUOTA_BYTES: undefined as number | undefined,
    get: async (keys?: string | string[] | null) =>
      Object.fromEntries(
        list(keys)
          .filter((key) => key in store)
          .map((key) => [key, store[key]]),
      ),
    set: async (items: Record<string, unknown>) => {
      const quota = area.QUOTA_BYTES ?? Number.POSITIVE_INFINITY;
      if (bytesIn({ ...store, ...items }) > quota) throw new Error('QUOTA_BYTES quota exceeded');
      Object.assign(store, items);
    },
    remove: async (keys: string | string[]) => {
      for (const key of list(keys)) delete store[key];
    },
    getBytesInUse: async (keys?: string | string[] | null) =>
      bytesIn(store, keys == null ? null : list(keys)),
  };
  return { store, area, itemBytes };
});
const durableStore = extension.store;

/** The background end of `runtime.sendMessage`; `null` while the background is unreachable. */
const runtime = vi.hoisted(() => ({
  background: null as null | ((message: unknown) => Promise<unknown>),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: vi.fn((message: unknown) =>
        runtime.background
          ? runtime.background(message)
          : Promise.reject(new Error('Could not establish connection')),
      ),
    },
    storage: {
      local: {
        get: vi.fn((keys) => extension.area.get(keys)),
        set: vi.fn((items) => extension.area.set(items)),
        remove: vi.fn((keys) => extension.area.remove(keys)),
      },
    },
  },
}));

// Toggle Safari detection per test. Read once per DataBackupService construction.
let isSafariValue = false;
vi.mock('@/core/utils/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/utils/browser')>()),
  isSafari: () => isSafariValue,
}));

const chromeLocal = chrome.storage.local;

function resetStores(): void {
  vi.clearAllMocks();
  vi.mocked(browser.storage.local.set).mockImplementation((items) => extension.area.set(items));
  localStorage.clear();
  for (const key of Object.keys(durableStore)) delete durableStore[key];
  extension.area.QUOTA_BYTES = undefined;
  (chrome.storage as { local: unknown }).local = extension.area;
  runtime.background = budgetCopyBridge((items) => browser.storage.local.set(items));
}

const usedBytes = (): number =>
  Object.entries(durableStore).reduce(
    (sum, [key, value]) => sum + extension.itemBytes(key, value),
    0,
  );

/** Chrome and Firefox require `unlimitedStorage`: no practical quota, only the soft cap. */
function grantUnlimitedStorage(): void {
  const runtimeApi = chrome.runtime as { getManifest?: () => unknown };
  runtimeApi.getManifest = () => ({ permissions: ['unlimitedStorage'] });
  onTestFinished(() => {
    delete runtimeApi.getManifest;
  });
}

interface Sample {
  folders: number[];
}

const PRIMARY_KEY = 'gvBackup_test-ns_primary';

describe('DataBackupService durable mirror (Safari)', () => {
  beforeEach(() => {
    isSafariValue = false;
    resetStores();
  });

  afterEach(() => {
    (chrome.storage as { local: unknown }).local = chromeLocal;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('writes only to localStorage on non-Safari and recovers from it', async () => {
    isSafariValue = false;
    const service = new DataBackupService<Sample>('test-ns');
    const data: Sample = { folders: [1, 2, 3] };

    expect(await service.createPrimaryBackup(data)).toBe(true);
    expect(localStorage.getItem(PRIMARY_KEY)).toBeTruthy();
    // No durable mirror writes on non-Safari browsers.
    expect(Object.keys(durableStore)).toHaveLength(0);
    expect(service.recoverFromBackup()).toEqual(data);
  });

  it('mirrors backups to the durable store on Safari', async () => {
    isSafariValue = true;
    const service = new DataBackupService<Sample>('test-ns');
    await service.ensureHydrated();

    await service.createPrimaryBackup({ folders: [9, 8, 7] });

    expect(localStorage.getItem(PRIMARY_KEY)).toBeTruthy();
    expect(durableStore[PRIMARY_KEY]).toBeTruthy();
  });

  it('restores backups from the durable store after Safari evicts localStorage', async () => {
    isSafariValue = true;
    const data: Sample = { folders: [5, 5, 5] };

    const writer = new DataBackupService<Sample>('test-ns');
    await writer.ensureHydrated();
    await writer.createPrimaryBackup(data);
    expect(durableStore[PRIMARY_KEY]).toBeTruthy();

    // Simulate Safari ITP wiping localStorage after ~7 days of inactivity.
    localStorage.clear();
    expect(localStorage.getItem(PRIMARY_KEY)).toBeNull();

    // A fresh page session hydrates from the durable mirror before recovery,
    // so the sync recoverFromBackup() still finds the data.
    const reader = new DataBackupService<Sample>('test-ns');
    await reader.ensureHydrated();
    expect(localStorage.getItem(PRIMARY_KEY)).toBeTruthy();
    expect(reader.recoverFromBackup()).toEqual(data);
  });

  it('still recovers a Safari backup older than 7 days (the ITP window the mirror targets)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      isSafariValue = true;
      const data: Sample = { folders: [7, 7, 7] };

      const writer = new DataBackupService<Sample>('test-ns');
      await writer.ensureHydrated();
      await writer.createPrimaryBackup(data);

      // Day 8: past the old 7-day TTL, and ITP has wiped page localStorage.
      vi.setSystemTime(new Date('2026-01-09T00:00:00Z'));
      localStorage.clear();

      const reader = new DataBackupService<Sample>('test-ns');
      await reader.ensureHydrated();
      // Must NOT be rejected as "too old" — that would defeat the whole fix.
      expect(reader.recoverFromBackup()).toEqual(data);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a non-Safari backup older than 7 days (original TTL preserved)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      isSafariValue = false;
      const service = new DataBackupService<Sample>('test-ns');
      await service.createPrimaryBackup({ folders: [1] });

      vi.setSystemTime(new Date('2026-01-09T00:00:00Z')); // 8 days later
      expect(service.recoverFromBackup()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

// Atomic quota stand-in: an unsuccessful replacement must leave the old value intact.
function limitLocalStorage(limit: number): void {
  const values = new Map<string, string>();
  const setItem = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    const next = new Map(values).set(key, value);
    const size = [...next].reduce((sum, [name, stored]) => sum + name.length + stored.length, 0);
    if (size > limit) throw new DOMException('Storage full', 'QuotaExceededError');
    setItem(key, value);
    values.set(key, value);
  });
}

const EMERGENCY_KEY = 'gvBackup_test-ns_emergency';
const BEFORE_UNLOAD_KEY = 'gvBackup_test-ns_beforeUnload';
const MiB = 1024 * 1024;

describe('DataBackupService quota fallback', () => {
  beforeEach(() => {
    isSafariValue = false;
    resetStores();
  });

  afterEach(() => {
    (chrome.storage as { local: unknown }).local = chromeLocal;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps the previous emergency slot and recovers the newer durable copy on a fresh page', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    limitLocalStorage(700);
    const old: Sample = { folders: [1] };
    const newer: Sample = { folders: Array.from({ length: 300 }, (_, i) => i) };
    const writer = new DataBackupService<Sample>('test-ns');
    expect(await writer.createEmergencyBackup(old)).toBe(true);
    const previous = localStorage.getItem(EMERGENCY_KEY);

    vi.advanceTimersByTime(1);
    expect(await writer.createEmergencyBackup(newer)).toBe(true);
    expect(localStorage.getItem(EMERGENCY_KEY)).toBe(previous);
    const reader = new DataBackupService<Sample>('test-ns');
    await reader.ensureHydrated();
    expect(reader.recoverFromBackup()).toEqual(newer);
  });

  it('reports failure when both stores reject a write and retains both older backups', async () => {
    limitLocalStorage(700);
    const old: Sample = { folders: [1] };
    const writer = new DataBackupService<Sample>('test-ns');
    expect(await writer.createEmergencyBackup(old)).toBe(true);
    const previous = localStorage.getItem(EMERGENCY_KEY)!;
    durableStore[EMERGENCY_KEY] = previous;
    vi.spyOn(browser.storage.local, 'set').mockRejectedValue(new Error('Extension quota full'));

    expect(await writer.createEmergencyBackup({ folders: Array(300).fill(100) })).toBe(false);
    expect(localStorage.getItem(EMERGENCY_KEY)).toBe(previous);
    expect(durableStore[EMERGENCY_KEY]).toBe(previous);
    await writer.ensureHydrated();
    expect(writer.recoverFromBackup()).toEqual(old);
  });

  it.each([false, true])(
    'recovers an absent emergency slot while localStorage stays full (Safari: %s)',
    async (safari) => {
      isSafariValue = safari;
      limitLocalStorage(700);
      const data: Sample = { folders: Array(300).fill(100) };
      const writer = new DataBackupService<Sample>('test-ns');
      expect(await writer.createEmergencyBackup(data)).toBe(true);
      expect(localStorage.getItem(EMERGENCY_KEY)).toBeNull();

      const reader = new DataBackupService<Sample>('test-ns');
      await reader.ensureHydrated();
      expect(localStorage.getItem(EMERGENCY_KEY)).toBeNull();
      expect(reader.recoverFromBackup()).toEqual(data);
    },
  );

  it('recovers an unload fallback when neither higher-priority slot is available', async () => {
    limitLocalStorage(700);
    const data: Sample = { folders: Array(300).fill(100) };
    const writer = new DataBackupService<Sample>('test-ns');
    writer.setupBeforeUnloadBackup(() => data);
    // Let the headroom measurement the unload copy decides from land.
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.dispatchEvent(new Event('beforeunload'));
    await writer.ensureHydrated();
    writer.destroy();

    const reader = new DataBackupService<Sample>('test-ns');
    await reader.ensureHydrated();
    expect(reader.recoverFromBackup()).toEqual(data);
  });

  it('rejects an invalid durable copy and keeps the valid local copy', async () => {
    const data: Sample = { folders: [1] };
    const service = new DataBackupService<Sample>('test-ns', (value) =>
      Array.isArray(value.folders),
    );
    await service.createEmergencyBackup(data);
    durableStore[EMERGENCY_KEY] = JSON.stringify({
      data: { folders: 'broken' },
      metadata: { timestamp: new Date().toISOString() },
    });
    await service.ensureHydrated();
    expect(service.recoverFromBackup()).toEqual(data);
  });

  it('does not let an older delayed fallback replace a newer emergency backup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    limitLocalStorage(700);
    let release!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    vi.mocked(browser.storage.local.set).mockImplementation(async (items) => {
      if (++writes === 1) await firstWrite;
      Object.assign(durableStore, items);
    });
    const service = new DataBackupService<Sample>('test-ns');
    const old = service.createEmergencyBackup({ folders: Array(300).fill(100) });
    vi.advanceTimersByTime(1);
    const newer: Sample = { folders: Array(300).fill(101) };
    const latest = service.createEmergencyBackup(newer);
    await Promise.resolve();
    await Promise.resolve();
    release();
    await Promise.all([old, latest]);

    const reader = new DataBackupService<Sample>('test-ns');
    await reader.ensureHydrated();
    expect(reader.recoverFromBackup()).toEqual(newer);
  });

  it('clears durable fallbacks as well as page slots', async () => {
    limitLocalStorage(700);
    const service = new DataBackupService<Sample>('test-ns');
    await service.createEmergencyBackup({ folders: Array(300).fill(100) });
    service.clearAllBackups();
    await service.ensureHydrated();
    expect(service.recoverFromBackup()).toBeNull();
    expect(Object.keys(durableStore)).toHaveLength(0);
  });
  it("recovers another tab's newer fallback beside an older page copy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:02Z'));
    const pageFull = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    const newer: Sample = { folders: Array(300).fill(2) };
    expect(await new DataBackupService<Sample>('test-ns').createEmergencyBackup(newer)).toBe(true);

    // The other tab took its smaller snapshot first; its page write lands afterwards.
    pageFull.mockRestore();
    vi.setSystemTime(new Date('2026-01-01T00:00:01Z'));
    const olderTab = new DataBackupService<Sample>('test-ns');
    expect(await olderTab.createEmergencyBackup({ folders: [1] })).toBe(true);
    await olderTab.ensureHydrated();

    vi.setSystemTime(new Date('2026-01-01T00:00:03Z'));
    const reader = new DataBackupService<Sample>('test-ns');
    await reader.ensureHydrated();
    expect(reader.recoverFromBackup()).toEqual(newer);
  });

  it('skips a fallback copy that would not leave the reserve free for other data', async () => {
    extension.area.QUOTA_BYTES = 10 * MiB;
    limitLocalStorage(700);
    const data: Sample = { folders: Array.from({ length: 100_000 }, (_, i) => i) };
    const copyBytes = extension.itemBytes(
      EMERGENCY_KEY,
      JSON.stringify({
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0',
          dataSize: JSON.stringify(data).length,
          itemCount: data.folders.length,
        },
      }),
    );
    // The copy itself fits under the quota, with half a MiB to spare.
    durableStore.gvOtherFeature = 'x'.repeat(10 * MiB - MiB / 2 - copyBytes - 32);

    const service = new DataBackupService<Sample>('test-ns');
    expect(await service.createEmergencyBackup(data)).toBe(false);
    expect(durableStore).not.toHaveProperty(EMERGENCY_KEY);
    // The room the copy would have taken stays available to other features.
    await expect(extension.area.set({ gvFolderData: 'y'.repeat(MiB) })).resolves.toBeUndefined();
  });

  it('sends the Safari unload copy while an earlier mirror write is still in flight', async () => {
    isSafariValue = true;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(browser.storage.local.set).mockImplementation(async (items) => {
      if (PRIMARY_KEY in items) await held;
      await extension.area.set(items);
    });
    const service = new DataBackupService<Sample>('test-ns');
    const primary = service.createPrimaryBackup({ folders: [1] });
    await vi.waitFor(() =>
      expect(browser.storage.local.set).toHaveBeenCalledWith({ [PRIMARY_KEY]: expect.any(String) }),
    );

    const latest: Sample = { folders: [2] };
    service.setupBeforeUnloadBackup(() => latest);
    window.dispatchEvent(new Event('beforeunload'));
    // Sent within the event itself; an unloading page cannot wait for the held write.
    expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: BEFORE_UNLOAD_KEY }),
    );

    release();
    await primary;
    await service.ensureHydrated();
    service.destroy();
    expect(JSON.parse(durableStore[BEFORE_UNLOAD_KEY] as string).data).toEqual(latest);
  });
  it('lets a Safari unload copy replace a same-size slot that only fits by reuse', async () => {
    isSafariValue = true;
    const unloadAt = async (service: DataBackupService<Sample>, data: Sample) => {
      service.setupBeforeUnloadBackup(() => data);
      window.dispatchEvent(new Event('beforeunload'));
      await service.ensureHydrated();
      service.destroy();
    };
    await unloadAt(new DataBackupService<Sample>('test-ns'), {
      folders: Array(750_000).fill(1),
    });

    // A later page: storage now fits that slot again, but not a second copy of it.
    extension.area.QUOTA_BYTES = 10 * MiB;
    const used = Object.entries(durableStore).reduce(
      (sum, [key, value]) => sum + extension.itemBytes(key, value),
      0,
    );
    durableStore.gvOtherFeature = 'x'.repeat(7 * MiB - used);
    const later = new DataBackupService<Sample>('test-ns');
    await later.createPrimaryBackup({ folders: [0] });
    await unloadAt(later, { folders: Array(750_000).fill(2) });

    // Compare a marker: a failing deep diff of 750k items would stall the reporter.
    expect(JSON.parse(durableStore[BEFORE_UNLOAD_KEY] as string).data.folders[0]).toBe(2);
  });

  it('recovers the copy that landed when a later backup write hangs', async () => {
    vi.useFakeTimers();
    limitLocalStorage(700);
    const landed: Sample = { folders: Array(300).fill(1) };
    const service = new DataBackupService<Sample>('test-ns');
    expect(await service.createEmergencyBackup(landed)).toBe(true);
    vi.mocked(browser.storage.local.set).mockImplementation(() => new Promise(() => {}));
    void service.createEmergencyBackup({ folders: Array(300).fill(2) });

    let recovered = false;
    const recovery = service.ensureHydrated().then(() => {
      recovered = true;
    });
    await vi.advanceTimersByTimeAsync(2000);
    await recovery;

    expect(recovered).toBe(true);
    expect(service.recoverFromBackup()).toEqual(landed);
  });

  it('skips the copy when the background cannot be reached, keeping the page copy', async () => {
    isSafariValue = true;
    runtime.background = null;
    const data: Sample = { folders: [1] };
    const service = new DataBackupService<Sample>('test-ns');

    expect(await service.createPrimaryBackup(data)).toBe(true);
    expect(durableStore).not.toHaveProperty(PRIMARY_KEY);
    expect(service.recoverFromBackup()).toEqual(data);
  });

  it("admits one of three tabs' 3 MiB fallbacks on 15 MiB used (T25a)", async () => {
    grantUnlimitedStorage();
    durableStore.gvOtherFeature = 'x'.repeat(15 * MiB);
    limitLocalStorage(700);
    const tabs = ['a', 'b', 'c'].map((ns) => new DataBackupService<Sample>(`tab-${ns}`));
    // About 3 MiB once serialized.
    const data: Sample = { folders: Array.from({ length: 1_570_000 }, () => 1) };

    const saved = await Promise.all(tabs.map((tab) => tab.createEmergencyBackup(data)));

    expect(saved.filter(Boolean)).toHaveLength(1);
    expect(usedBytes()).toBeLessThanOrEqual(18.75 * MiB);
  });

  it('admits an unload copy against the slot bytes when it writes, not when the tab measured (T26e)', async () => {
    isSafariValue = true;
    grantUnlimitedStorage();
    const big: Sample = { folders: Array.from({ length: 2_000_000 }, () => 1) };
    const small: Sample = { folders: [1] };
    // Tab A's earlier unload copy fills the shared slot (~4 MiB).
    const tabA = new DataBackupService<Sample>('test-ns');
    tabA.setupBeforeUnloadBackup(() => big);
    window.dispatchEvent(new Event('beforeunload'));
    await tabA.ensureHydrated();
    tabA.destroy();
    durableStore.gvOtherFeature = 'x'.repeat(15 * MiB - usedBytes());

    // Tab B shrinks the slot; other data then grows into the room that freed.
    const tabB = new DataBackupService<Sample>('test-ns');
    tabB.setupBeforeUnloadBackup(() => small);
    window.dispatchEvent(new Event('beforeunload'));
    await tabB.ensureHydrated();
    tabB.destroy();
    delete durableStore.gvOtherFeature;
    durableStore.gvOtherFeature = 'x'.repeat(18.7 * MiB - usedBytes());

    // Tab A unloads again with its big copy.
    const again = new DataBackupService<Sample>('test-ns');
    again.setupBeforeUnloadBackup(() => big);
    window.dispatchEvent(new Event('beforeunload'));
    await again.ensureHydrated();
    again.destroy();

    expect(usedBytes()).toBeLessThanOrEqual(18.75 * MiB);
    expect(JSON.parse(durableStore[BEFORE_UNLOAD_KEY] as string).data.folders).toHaveLength(1);
  });
});
