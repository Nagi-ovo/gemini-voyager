/**
 * Folder Storage Adapter
 *
 * Enterprise-grade storage abstraction using Strategy Pattern
 * Provides unified interface for different storage backends
 *
 * Design Patterns:
 * - Strategy Pattern: Different storage implementations (localStorage vs browser.storage)
 * - Factory Pattern: Automatic strategy selection based on browser
 * - Adapter Pattern: Converts different storage APIs to unified interface
 *
 * Benefits:
 * - Single Responsibility: Each adapter handles one storage type
 * - Open/Closed: Easy to add new storage backends without modifying existing code
 * - Dependency Inversion: FolderManager depends on interface, not implementation
 * - Testability: Easy to mock storage in unit tests
 */
import { isSafari } from '@/core/utils/browser';
import { safariStorage } from '@/core/utils/safariStorage';

import type { FolderData } from '../types';

/**
 * Unified storage interface for folder data
 * All implementations must provide async methods
 */
export interface IFolderStorageAdapter {
  /**
   * Initialize the storage adapter
   * Used for adapter-specific setup like data migration
   * @param key Storage key
   */
  init(key: string): Promise<void>;

  /**
   * Load folder data from storage
   * @returns FolderData or null if no data exists
   */
  loadData(key: string): Promise<FolderData | null>;

  /**
   * Save folder data to storage
   * @param key Storage key
   * @param data Folder data to save
   * @returns true if save succeeded
   */
  saveData(key: string, data: FolderData): Promise<boolean>;

  /**
   * Remove folder data from storage
   * @param key Storage key
   */
  removeData(key: string): Promise<void>;

  /**
   * Get storage backend name for debugging
   */
  getBackendName(): string;
}

/**
 * LocalStorage implementation for Chrome/Firefox/Edge
 * Synchronous localStorage API wrapped in async interface for consistency
 */
export class LocalStorageFolderAdapter implements IFolderStorageAdapter {
  /**
   * Initialize and migrate existing data to chrome.storage.local
   * This enables popup/sync to access folder data
   */
  async init(key: string): Promise<void> {
    try {
      // Check if we need to migrate localStorage data to chrome.storage.local
      const localData = localStorage.getItem(key);
      if (localData) {
        const result = await chrome.storage.local.get(key);
        if (!result[key]) {
          // Migrate localStorage data to chrome.storage.local
          const data = JSON.parse(localData) as FolderData;
          await chrome.storage.local.set({ [key]: data });
          console.log('[LocalStorageFolderAdapter] Migrated folder data to chrome.storage.local');
        }
      }
    } catch (error) {
      console.warn('[LocalStorageFolderAdapter] Migration check failed:', error);
    }
  }

  async loadData(key: string): Promise<FolderData | null> {
    try {
      // First check chrome.storage.local (for synced data from popup/download)
      const chromeResult = await chrome.storage.local.get(key);
      if (chromeResult[key]) {
        console.log('[LocalStorageFolderAdapter] Loaded data from chrome.storage.local');
        // Also sync to localStorage for consistency
        localStorage.setItem(key, JSON.stringify(chromeResult[key]));
        return chromeResult[key] as FolderData;
      }

      // Fallback to localStorage
      const stored = localStorage.getItem(key);
      if (!stored) {
        return null;
      }
      return JSON.parse(stored) as FolderData;
    } catch (error) {
      console.error('[LocalStorageFolderAdapter] Failed to load data:', error);
      return null;
    }
  }

  async saveData(key: string, data: FolderData): Promise<boolean> {
    try {
      const dataString = JSON.stringify(data);
      localStorage.setItem(key, dataString);

      // Verify the save was successful
      const verification = localStorage.getItem(key);
      if (verification !== dataString) {
        throw new Error('Save verification failed - data mismatch');
      }

      // Also mirror to chrome.storage.local for popup/sync access
      try {
        await chrome.storage.local.set({ [key]: data });
      } catch (storageError) {
        console.warn(
          '[LocalStorageFolderAdapter] Failed to mirror to chrome.storage.local:',
          storageError,
        );
      }

      return true;
    } catch (error) {
      console.error('[LocalStorageFolderAdapter] Failed to save data:', error);
      return false;
    }
  }

  async removeData(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('[LocalStorageFolderAdapter] Failed to remove data:', error);
    }
  }

  getBackendName(): string {
    return 'localStorage';
  }
}

/**
 * BrowserStorage implementation for Safari
 * Uses browser.storage.local for reliable persistence
 *
 * Why Safari needs this:
 * - Safari's localStorage has 7-day deletion policy
 * - Random data loss on iOS 13+
 * - Private mode quota exceeded errors
 * - browser.storage.local is more reliable (10MB quota, persistent)
 */
export class SafariFolderAdapter implements IFolderStorageAdapter {
  /**
   * Initialize Safari adapter with data migration
   * Migrates data from localStorage to browser.storage.local (one-time)
   */
  async init(key: string): Promise<void> {
    await this.migrateFromLocalStorage(key);
  }

  async loadData(key: string): Promise<FolderData | null> {
    try {
      const stored = await safariStorage.getItem(key);
      if (!stored) {
        return null;
      }
      return JSON.parse(stored) as FolderData;
    } catch (error) {
      console.error('[SafariFolderAdapter] Failed to load data:', error);
      return null;
    }
  }

  async saveData(key: string, data: FolderData): Promise<boolean> {
    try {
      const dataString = JSON.stringify(data);
      await safariStorage.setItem(key, dataString);

      // Verify the save was successful for robustness
      const verification = await safariStorage.getItem(key);
      if (verification !== dataString) {
        throw new Error('Save verification failed - data mismatch');
      }

      return true;
    } catch (error) {
      console.error('[SafariFolderAdapter] Failed to save data:', error);
      return false;
    }
  }

  async removeData(key: string): Promise<void> {
    try {
      await safariStorage.removeItem(key);
    } catch (error) {
      console.error('[SafariFolderAdapter] Failed to remove data:', error);
    }
  }

  getBackendName(): string {
    return 'browser.storage.local (Safari)';
  }

  /**
   * Migrate data from localStorage to browser.storage.local
   * Should be called once during initialization
   */
  async migrateFromLocalStorage(key: string): Promise<boolean> {
    try {
      return await safariStorage.migrateFromLocalStorage(key);
    } catch (error) {
      console.error('[SafariFolderAdapter] Migration failed:', error);
      return false;
    }
  }
}

/**
 * Factory function to create appropriate storage adapter
 * Automatically selects based on browser detection
 *
 * Strategy Selection:
 * - Safari → SafariFolderAdapter (browser.storage.local)
 * - Others → LocalStorageFolderAdapter (localStorage)
 *
 * @returns Storage adapter instance
 */
export function createFolderStorageAdapter(): IFolderStorageAdapter {
  if (isSafari()) {
    console.log('[FolderStorage] Using SafariFolderAdapter (browser.storage.local)');
    return new SafariFolderAdapter();
  }

  console.log('[FolderStorage] Using LocalStorageFolderAdapter (localStorage)');
  return new LocalStorageFolderAdapter();
}
