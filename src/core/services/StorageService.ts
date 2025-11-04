/**
 * Centralized storage service
 * Replaces direct localStorage and chrome.storage calls
 * Implements Repository pattern with type safety
 */

import { StorageError, ErrorCode, ErrorHandler } from '../errors/AppError';
import type { Result, StorageKey } from '../types/common';

import { logger } from './LoggerService';

export interface IStorageService {
  get<T>(key: StorageKey): Promise<Result<T>>;
  set<T>(key: StorageKey, value: T): Promise<Result<void>>;
  remove(key: StorageKey): Promise<Result<void>>;
  clear(): Promise<Result<void>>;
}

/**
 * Chrome Storage implementation
 */
export class ChromeStorageService implements IStorageService {
  private readonly logger = logger.createChild('ChromeStorage');

  async get<T>(key: StorageKey): Promise<Result<T>> {
    try {
      this.logger.debug(`Reading key: ${key}`);

      const result = await new Promise<Record<string, T>>((resolve) => {
        chrome.storage?.sync?.get([key], (items) => {
          resolve(items as Record<string, T>);
        });
      });

      const value = result[key];

      if (value === undefined) {
        this.logger.debug(`Key not found: ${key}`);
        return {
          success: false,
          error: new StorageError(
            ErrorCode.STORAGE_READ_FAILED,
            `Key not found: ${key}`,
            { key }
          ),
        };
      }

      this.logger.debug(`Successfully read key: ${key}`);
      return { success: true, data: value };
    } catch (error) {
      this.logger.error(`Failed to read key: ${key}`, { error });
      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_READ_FAILED,
          `Failed to read key: ${key}`,
          { key },
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  async set<T>(key: StorageKey, value: T): Promise<Result<void>> {
    try {
      this.logger.debug(`Writing key: ${key}`);

      await new Promise<void>((resolve, reject) => {
        chrome.storage?.sync?.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });

      this.logger.debug(`Successfully wrote key: ${key}`);
      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error(`Failed to write key: ${key}`, { error });
      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_WRITE_FAILED,
          `Failed to write key: ${key}`,
          { key, value },
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  async remove(key: StorageKey): Promise<Result<void>> {
    try {
      this.logger.debug(`Removing key: ${key}`);

      await new Promise<void>((resolve, reject) => {
        chrome.storage?.sync?.remove(key, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });

      this.logger.debug(`Successfully removed key: ${key}`);
      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error(`Failed to remove key: ${key}`, { error });
      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_WRITE_FAILED,
          `Failed to remove key: ${key}`,
          { key },
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  async clear(): Promise<Result<void>> {
    try {
      this.logger.debug('Clearing all storage');

      await new Promise<void>((resolve, reject) => {
        chrome.storage?.sync?.clear(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });

      this.logger.debug('Successfully cleared storage');
      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Failed to clear storage', { error });
      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_WRITE_FAILED,
          'Failed to clear storage',
          {},
          error instanceof Error ? error : undefined
        ),
      };
    }
  }
}

/**
 * LocalStorage implementation (fallback)
 */
export class LocalStorageService implements IStorageService {
  private readonly logger = logger.createChild('LocalStorage');

  async get<T>(key: StorageKey): Promise<Result<T>> {
    try {
      this.logger.debug(`Reading key: ${key}`);

      const raw = localStorage.getItem(key);

      if (raw === null) {
        this.logger.debug(`Key not found: ${key}`);
        return {
          success: false,
          error: new StorageError(
            ErrorCode.STORAGE_READ_FAILED,
            `Key not found: ${key}`,
            { key }
          ),
        };
      }

      const value = JSON.parse(raw) as T;

      this.logger.debug(`Successfully read key: ${key}`);
      return { success: true, data: value };
    } catch (error) {
      this.logger.error(`Failed to read/parse key: ${key}`, { error });
      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_PARSE_FAILED,
          `Failed to read/parse key: ${key}`,
          { key },
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  async set<T>(key: StorageKey, value: T): Promise<Result<void>> {
    try {
      this.logger.debug(`Writing key: ${key}`);

      const raw = JSON.stringify(value);
      localStorage.setItem(key, raw);

      this.logger.debug(`Successfully wrote key: ${key}`);
      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error(`Failed to write key: ${key}`, { error });
      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_WRITE_FAILED,
          `Failed to write key: ${key}`,
          { key, value },
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  async remove(key: StorageKey): Promise<Result<void>> {
    try {
      this.logger.debug(`Removing key: ${key}`);

      localStorage.removeItem(key);

      this.logger.debug(`Successfully removed key: ${key}`);
      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error(`Failed to remove key: ${key}`, { error });
      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_WRITE_FAILED,
          `Failed to remove key: ${key}`,
          { key },
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  async clear(): Promise<Result<void>> {
    try {
      this.logger.debug('Clearing all storage');

      localStorage.clear();

      this.logger.debug('Successfully cleared storage');
      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Failed to clear storage', { error });
      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_WRITE_FAILED,
          'Failed to clear storage',
          {},
          error instanceof Error ? error : undefined
        ),
      };
    }
  }
}

/**
 * Storage factory - automatically selects the best available storage
 */
export class StorageFactory {
  static create(): IStorageService {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      logger.info('Using ChromeStorageService');
      return new ChromeStorageService();
    }

    logger.info('Using LocalStorageService (fallback)');
    return new LocalStorageService();
  }
}

// Export singleton instance
export const storageService = StorageFactory.create();
