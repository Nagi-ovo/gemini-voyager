import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataBackupService } from '../DataBackupService';

// In-memory stand-in for browser.storage.local (the Safari durable mirror).
const durableStore: Record<string, unknown> = {};

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const key of list) {
            if (key in durableStore) out[key] = durableStore[key];
          }
          return out;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(durableStore, items);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) delete durableStore[key];
        }),
      },
    },
  },
}));

// Toggle Safari detection per test. Read once per DataBackupService construction.
let isSafariValue = false;
vi.mock('@/core/utils/browser', () => ({
  isSafari: () => isSafariValue,
}));

interface Sample {
  folders: number[];
}

const PRIMARY_KEY = 'gvBackup_test-ns_primary';

describe('DataBackupService durable mirror (Safari)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSafariValue = false;
    localStorage.clear();
    for (const key of Object.keys(durableStore)) delete durableStore[key];
  });

  it('writes only to localStorage on non-Safari and recovers from it', async () => {
    isSafariValue = false;
    const service = new DataBackupService<Sample>('test-ns');
    const data: Sample = { folders: [1, 2, 3] };

    expect(service.createPrimaryBackup(data)).toBe(true);
    expect(localStorage.getItem(PRIMARY_KEY)).toBeTruthy();
    // No durable mirror writes on non-Safari browsers.
    expect(Object.keys(durableStore)).toHaveLength(0);
    expect(service.recoverFromBackup()).toEqual(data);
  });

  it('mirrors backups to the durable store on Safari', async () => {
    isSafariValue = true;
    const service = new DataBackupService<Sample>('test-ns');
    await service.ensureHydrated();

    service.createPrimaryBackup({ folders: [9, 8, 7] });

    expect(localStorage.getItem(PRIMARY_KEY)).toBeTruthy();
    expect(durableStore[PRIMARY_KEY]).toBeTruthy();
  });

  it('restores backups from the durable store after Safari evicts localStorage', async () => {
    isSafariValue = true;
    const data: Sample = { folders: [5, 5, 5] };

    const writer = new DataBackupService<Sample>('test-ns');
    await writer.ensureHydrated();
    writer.createPrimaryBackup(data);
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
      writer.createPrimaryBackup(data);

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

  it('rejects a non-Safari backup older than 7 days (original TTL preserved)', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      isSafariValue = false;
      const service = new DataBackupService<Sample>('test-ns');
      service.createPrimaryBackup({ folders: [1] });

      vi.setSystemTime(new Date('2026-01-09T00:00:00Z')); // 8 days later
      expect(service.recoverFromBackup()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ensureHydrated resolves immediately on non-Safari', async () => {
    isSafariValue = false;
    const service = new DataBackupService<Sample>('test-ns');
    await expect(service.ensureHydrated()).resolves.toBeUndefined();
  });
});
