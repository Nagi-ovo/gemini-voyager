/**
 * StorageService unit tests
 * Demonstrates testing best practices for the refactored code
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '../../types/common';
import { ChromeStorageService, LocalStorageService } from '../StorageService';

describe('LocalStorageService', () => {
  let service: LocalStorageService;

  beforeEach(() => {
    service = new LocalStorageService();
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('should return data when key exists', async () => {
      const testData = { value: 'test' };
      localStorage.setItem(StorageKeys.FOLDER_DATA, JSON.stringify(testData));

      const result = await service.get(StorageKeys.FOLDER_DATA);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(testData);
      }
    });

    it('should return error when key does not exist', async () => {
      const result = await service.get(StorageKeys.FOLDER_DATA);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toContain('not found');
      }
    });

    it('should handle JSON parse errors', async () => {
      localStorage.setItem(StorageKeys.FOLDER_DATA, 'invalid json');

      const result = await service.get(StorageKeys.FOLDER_DATA);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toContain('parse');
      }
    });
  });

  describe('set', () => {
    it('should store data successfully', async () => {
      const testData = { value: 'test' };

      const result = await service.set(StorageKeys.FOLDER_DATA, testData);

      expect(result.success).toBe(true);

      const stored = localStorage.getItem(StorageKeys.FOLDER_DATA);
      expect(stored).toBe(JSON.stringify(testData));
    });

    it('should handle storage errors', async () => {
      // Mock localStorage to throw error
      const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const result = await service.set(StorageKeys.FOLDER_DATA, { test: 'data' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toContain('Failed to write');
      }

      // Restore the spy
      setItemSpy.mockRestore();
    });
  });

  describe('remove', () => {
    it('should remove key successfully', async () => {
      localStorage.setItem(StorageKeys.FOLDER_DATA, 'test');

      const result = await service.remove(StorageKeys.FOLDER_DATA);

      expect(result.success).toBe(true);
      expect(localStorage.getItem(StorageKeys.FOLDER_DATA)).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all storage', async () => {
      localStorage.setItem(StorageKeys.FOLDER_DATA, 'test1');
      localStorage.setItem(StorageKeys.CHAT_WIDTH, 'test2');

      const result = await service.clear();

      expect(result.success).toBe(true);
      expect(localStorage.length).toBe(0);
    });
  });
});

describe('ChromeStorageService', () => {
  let service: ChromeStorageService;
  let originalRuntimeId: string | undefined;

  const setRuntimeId = (id: string | undefined): void => {
    Object.defineProperty(chrome.runtime, 'id', {
      value: id,
      configurable: true,
    });
  };

  beforeEach(() => {
    service = new ChromeStorageService();
    originalRuntimeId = chrome.runtime.id;
    vi.clearAllMocks();
  });

  afterEach(() => {
    setRuntimeId(originalRuntimeId);
  });

  it('returns context-invalidated error details when runtime context is gone', async () => {
    const getSpy = vi.spyOn(chrome.storage.sync, 'get').mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });

    const result = await service.get(StorageKeys.PROMPT_ITEMS);

    expect(getSpy).toHaveBeenCalledOnce();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Extension context invalidated');
    }
  });

  it('treats generic storage failures as context-invalidated when runtime id is missing', async () => {
    setRuntimeId(undefined);
    const getSpy = vi.spyOn(chrome.storage.sync, 'get').mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'get')");
    });

    const result = await service.get(StorageKeys.PROMPT_ITEMS);

    expect(getSpy).toHaveBeenCalledOnce();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Extension context invalidated');
    }
  });
});
