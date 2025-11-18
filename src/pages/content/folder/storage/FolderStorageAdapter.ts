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

import type { FolderData } from '../types';
import { safariStorage } from '@/core/utils/safariStorage';
import { isSafari } from '@/core/utils/browser';

/**
 * Unified storage interface for folder data
 * All implementations must provide async methods
 */
export interface IFolderStorageAdapter {
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
  async loadData(key: string): Promise<FolderData | null> {
    try {
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
