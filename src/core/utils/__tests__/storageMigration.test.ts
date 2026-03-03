import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IStorageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';
import {
  getMigrationStatus,
  isMigrationCompleted,
  migrateFromLocalStorage,
} from '../storageMigration';

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------
function makeMockStorage(data: Record<string, unknown> = {}): IStorageService {
  const store = new Map(Object.entries(data));
  return {
    get: vi.fn(async (key: string) => {
      if (!store.has(key)) {
        return { success: false, error: new Error(`not found: ${key}`) };
      }
      return { success: true, data: store.get(key) };
    }),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return { success: true, data: undefined };
    }),
    remove: vi.fn(async () => ({ success: true, data: undefined })),
    clear: vi.fn(async () => ({ success: true, data: undefined })),
  } as unknown as IStorageService;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// migrateFromLocalStorage
// ---------------------------------------------------------------------------
describe('migrateFromLocalStorage', () => {
  it('migrates a key that exists in localStorage', async () => {
    const key = StorageKeys.PROMPT_ITEMS;
    const value = [{ id: '1', text: 'hello' }];
    localStorage.setItem(key, JSON.stringify(value));

    const target = makeMockStorage();
    const result = await migrateFromLocalStorage([key], target);

    expect(result.migratedKeys).toContain(key);
    expect(result.skippedKeys).not.toContain(key);
    expect(result.errors).toHaveLength(0);
    expect(target.set).toHaveBeenCalledWith(key, value);
  });

  it('skips a key that does not exist in localStorage', async () => {
    const key = StorageKeys.PROMPT_ITEMS;
    // key is intentionally not set in localStorage

    const target = makeMockStorage();
    const result = await migrateFromLocalStorage([key], target);

    expect(result.skippedKeys).toContain(key);
    expect(result.migratedKeys).not.toContain(key);
    expect(target.set).not.toHaveBeenCalled();
  });

  it('skips a key already present in target when skipExisting is true (default)', async () => {
    const key = StorageKeys.PROMPT_PANEL_LOCKED;
    localStorage.setItem(key, JSON.stringify(true));

    // target already has the key
    const target = makeMockStorage({ [key]: true });
    const result = await migrateFromLocalStorage([key], target, { skipExisting: true });

    expect(result.skippedKeys).toContain(key);
    expect(result.migratedKeys).not.toContain(key);
    // set should not be called for the skipped key
    expect(target.set).not.toHaveBeenCalled();
  });

  it('removes key from localStorage after migration when deleteAfterMigration is true', async () => {
    const key = StorageKeys.LANGUAGE;
    localStorage.setItem(key, JSON.stringify('en'));

    const target = makeMockStorage();
    await migrateFromLocalStorage([key], target, {
      deleteAfterMigration: true,
      skipExisting: false,
    });

    expect(localStorage.getItem(key)).toBeNull();
  });

  it('records an error and does not migrate a key with invalid JSON in localStorage', async () => {
    const key = StorageKeys.FOLDER_DATA;
    // Store deliberately malformed JSON
    localStorage.setItem(key, 'NOT_VALID_JSON{{{');

    const target = makeMockStorage();
    const result = await migrateFromLocalStorage([key], target);

    const failedEntry = result.errors.find((e) => e.key === key);
    expect(failedEntry).toBeDefined();
    expect(result.migratedKeys).not.toContain(key);
    expect(target.set).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMigrationCompleted
// ---------------------------------------------------------------------------
describe('isMigrationCompleted', () => {
  it('returns true when the key exists in target storage', async () => {
    const key = StorageKeys.TIMELINE_SCROLL_MODE;
    const target = makeMockStorage({ [key]: 'smooth' });

    const completed = await isMigrationCompleted(key, target);

    expect(completed).toBe(true);
  });

  it('returns false when the key does not exist in target storage', async () => {
    const key = StorageKeys.TIMELINE_SCROLL_MODE;
    const target = makeMockStorage(); // empty

    const completed = await isMigrationCompleted(key, target);

    expect(completed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getMigrationStatus
// ---------------------------------------------------------------------------
describe('getMigrationStatus', () => {
  it('returns true for a key present in target and false for a key absent from target', async () => {
    const presentKey = StorageKeys.CHAT_WIDTH;
    const absentKey = StorageKeys.CTRL_ENTER_SEND;

    const target = makeMockStorage({ [presentKey]: 800 });
    const status = await getMigrationStatus([presentKey, absentKey], target);

    expect(status[presentKey]).toBe(true);
    expect(status[absentKey]).toBe(false);
  });

  it('returns false for a key that is only in localStorage but not in target', async () => {
    const key = StorageKeys.DEFAULT_MODEL;
    localStorage.setItem(key, JSON.stringify('gemini-pro'));

    const target = makeMockStorage(); // key not yet migrated
    const status = await getMigrationStatus([key], target);

    expect(status[key]).toBe(false);
  });

  it('returns true for a key that has been migrated to target', async () => {
    const key = StorageKeys.DEFAULT_MODEL;
    const target = makeMockStorage({ [key]: 'gemini-pro' });

    const status = await getMigrationStatus([key], target);

    expect(status[key]).toBe(true);
  });
});
