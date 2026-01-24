/**
 * Safari-specific storage adapter
 * Uses browser.storage.local for reliable persistence on Safari
 *
 * Why Safari needs this:
 * - Safari's localStorage has 7-day deletion policy
 * - Random data loss on iOS 13+
 * - Private mode quota exceeded errors
 *
 * Solution:
 * - Use browser.storage.local (persistent, 10MB quota)
 * - Fallback to localStorage if storage API unavailable
 */
import browser from 'webextension-polyfill';

interface SafariStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Safari storage adapter using browser.storage.local
 * Provides async methods that replace localStorage for Safari
 */
export class SafariStorage implements SafariStorageAdapter {
  /**
   * Get item from browser.storage.local
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const result = await browser.storage.local.get(key);
      const value = result[key];
      // Ensure we return string or null
      if (typeof value === 'string') {
        return value;
      }
      return null;
    } catch (error) {
      console.error('[SafariStorage] Failed to get item:', key, error);
      // Fallback to localStorage
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
  }

  /**
   * Set item to browser.storage.local
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch (error) {
      console.error('[SafariStorage] Failed to set item:', key, error);
      // Fallback to localStorage
      try {
        localStorage.setItem(key, value);
      } catch (fallbackError) {
        console.error('[SafariStorage] Fallback to localStorage also failed:', fallbackError);
        throw error;
      }
    }
  }

  /**
   * Remove item from browser.storage.local
   */
  async removeItem(key: string): Promise<void> {
    try {
      await browser.storage.local.remove(key);
    } catch (error) {
      console.error('[SafariStorage] Failed to remove item:', key, error);
      // Fallback to localStorage
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore fallback errors for remove
      }
    }
  }

  /**
   * Migrate data from localStorage to browser.storage.local
   * Should be called once during initialization
   */
  async migrateFromLocalStorage(key: string): Promise<boolean> {
    try {
      // Check if already migrated
      const migrationKey = `${key}_migrated`;
      const alreadyMigrated = await this.getItem(migrationKey);
      if (alreadyMigrated === 'true') {
        return true;
      }

      // Check if there's data in localStorage
      const localData = localStorage.getItem(key);
      if (!localData) {
        // No data to migrate, mark as migrated
        await this.setItem(migrationKey, 'true');
        return true;
      }

      // Check if browser.storage.local already has data
      const browserData = await browser.storage.local.get(key);
      if (browserData[key]) {
        // Data already in browser.storage.local, no migration needed
        await this.setItem(migrationKey, 'true');
        return true;
      }

      // Migrate data
      await this.setItem(key, localData);
      await this.setItem(migrationKey, 'true');

      console.log(
        `[SafariStorage] Successfully migrated ${key} from localStorage to browser.storage.local`,
      );
      return true;
    } catch (error) {
      console.error('[SafariStorage] Migration failed:', error);
      return false;
    }
  }
}

/**
 * Singleton instance
 */
export const safariStorage = new SafariStorage();
