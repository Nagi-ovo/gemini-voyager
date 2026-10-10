/**
 * The page globals the folder data modules read, for node. Imported first by
 * the node entry so it runs before any folder module evaluates.
 *
 * `localStorage` enforces Chrome's per-origin budget (5 Mi UTF-16 code units
 * across keys and values), so a library too large for Chrome's backups fails
 * here the same way.
 */
import { installExtensionApiStub } from '../stubs/extensionApi';

const LOCAL_STORAGE_QUOTA = 5 * 1024 * 1024;

class QuotaStorage {
  private readonly items = new Map<string, string>();
  private used = 0;

  get length(): number {
    return this.items.size;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    const text = String(value);
    const previous = this.items.get(key);
    const next = this.used - (previous === undefined ? 0 : key.length + previous.length);
    if (next + key.length + text.length > LOCAL_STORAGE_QUOTA) {
      const error = new Error(`Setting the value of '${key}' exceeded the quota.`);
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.items.set(key, text);
    this.used = next + key.length + text.length;
  }
  removeItem(key: string): void {
    const previous = this.items.get(key);
    if (previous === undefined) return;
    this.used -= key.length + previous.length;
    this.items.delete(key);
  }
  clear(): void {
    this.items.clear();
    this.used = 0;
  }
}

const scope = globalThis as unknown as Record<string, unknown>;
const events = new EventTarget();
scope.window = globalThis;
scope.addEventListener = events.addEventListener.bind(events);
scope.removeEventListener = events.removeEventListener.bind(events);
scope.dispatchEvent = events.dispatchEvent.bind(events);
scope.location = new URL('https://gemini.google.com/app');
Object.defineProperty(globalThis, 'localStorage', {
  value: new QuotaStorage(),
  configurable: true,
});
installExtensionApiStub();
