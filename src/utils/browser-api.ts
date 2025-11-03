/**
 * Browser API Adapter
 * 
 * Provides a unified API for browser extensions across Chrome, Firefox, and Safari.
 * 
 * - Chrome/Firefox: Uses native chrome.* API (no polyfill overhead)
 * - Safari: Uses webextension-polyfill for compatibility
 * 
 * This conditional approach ensures:
 * 1. Zero performance impact for Chrome/Firefox builds
 * 2. Full Safari compatibility without affecting other browsers
 * 3. Type-safe API access across all browsers
 */

type StorageArea = {
  get(keys?: string | string[] | { [key: string]: any } | null): Promise<{ [key: string]: any }>;
  set(items: { [key: string]: any }): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
};

type StorageChangeCallback = (
  changes: { [key: string]: { oldValue?: any; newValue?: any } },
  areaName: string
) => void;

interface BrowserAPI {
  storage: {
    sync: StorageArea;
    local: StorageArea;
    onChanged: {
      addListener(callback: StorageChangeCallback): void;
      removeListener(callback: StorageChangeCallback): void;
    };
  };
  runtime: {
    getURL(path: string): string;
  };
  i18n: {
    getMessage(messageName: string, substitutions?: string | string[]): string;
  };
}

/**
 * Unified browser API
 * 
 * Usage:
 * ```typescript
 * import { browserAPI } from '@/utils/browser-api';
 * 
 * // Works on all browsers
 * const data = await browserAPI.storage.sync.get('key');
 * await browserAPI.storage.sync.set({ key: 'value' });
 * ```
 */
export const browserAPI: BrowserAPI = (() => {
  if (__BROWSER_TARGET__ === 'safari') {
    // Safari: use webextension-polyfill
    // @ts-ignore - dynamic import for Safari build only
    const browserPolyfill = require('webextension-polyfill');
    return browserPolyfill as any;
  } else {
    // Chrome/Firefox: use native chrome.* API with Promise wrapper
    const chromeAPI = (typeof chrome !== 'undefined' ? chrome : (window as any).chrome) as typeof chrome;
    
    const promisify = <T>(
      fn: (callback: (result: T) => void) => void
    ): Promise<T> => {
      return new Promise((resolve) => fn(resolve));
    };

    return {
      storage: {
        sync: {
          get: (keys?: string | string[] | { [key: string]: any } | null) =>
            promisify((cb) => chromeAPI.storage.sync.get(keys as any, cb)),
          set: (items: { [key: string]: any }) =>
            promisify((cb) => chromeAPI.storage.sync.set(items, cb)),
          remove: (keys: string | string[]) =>
            promisify((cb) => chromeAPI.storage.sync.remove(keys, cb)),
          clear: () =>
            promisify((cb) => chromeAPI.storage.sync.clear(cb)),
        },
        local: {
          get: (keys?: string | string[] | { [key: string]: any } | null) =>
            promisify((cb) => chromeAPI.storage.local.get(keys as any, cb)),
          set: (items: { [key: string]: any }) =>
            promisify((cb) => chromeAPI.storage.local.set(items, cb)),
          remove: (keys: string | string[]) =>
            promisify((cb) => chromeAPI.storage.local.remove(keys, cb)),
          clear: () =>
            promisify((cb) => chromeAPI.storage.local.clear(cb)),
        },
        onChanged: {
          addListener: (callback: StorageChangeCallback) =>
            chromeAPI.storage.onChanged.addListener(callback as any),
          removeListener: (callback: StorageChangeCallback) =>
            chromeAPI.storage.onChanged.removeListener(callback as any),
        },
      },
      runtime: {
        getURL: (path: string) => chromeAPI.runtime.getURL(path),
      },
      i18n: {
        getMessage: (messageName: string, substitutions?: string | string[]) =>
          chromeAPI.i18n.getMessage(messageName, substitutions as any),
      },
    };
  }
})();

