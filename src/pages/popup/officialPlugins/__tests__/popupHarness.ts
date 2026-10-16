import { vi } from 'vitest';

/**
 * Browser APIs for popup tests that mount the real Popup with its hooks and the
 * packaged manifests. A test file mocks `webextension-polyfill` and `isSafari`
 * with these (an async `vi.mock` factory importing this module) and calls
 * `resetPopupBrowser()` before each test.
 */
export const extensionApi = {
  storage: {
    sync: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), getBytesInUse: vi.fn() },
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), getBytesInUse: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: { get: vi.fn(), query: vi.fn(), sendMessage: vi.fn(), create: vi.fn() },
  runtime: {
    id: 'test-extension-id',
    lastError: undefined as { message: string } | undefined,
    getManifest: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  permissions: {
    contains: vi.fn(),
    request: vi.fn(),
    onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  notifications: { create: vi.fn() },
  i18n: { getUILanguage: vi.fn(() => 'en'), getMessage: vi.fn((key: string) => key) },
};

/** Which browser `isSafari()` reports. */
export const browserTarget = { safari: false };

export const GEMINI_TAB = { id: 7, url: 'https://gemini.google.com/app' };
export const AI_STUDIO = 'https://aistudio.google.com/prompts/new_chat';

function readStorage(keys: unknown, stored: Record<string, unknown>): Record<string, unknown> {
  if (typeof keys === 'string') return { [keys]: stored[keys] };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, stored[key]]));
  if (keys && typeof keys === 'object') {
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [
        key,
        Object.hasOwn(stored, key) ? stored[key] : fallback,
      ]),
    );
  }
  return { ...stored };
}

/** Fresh sync and local stores behind the mocked APIs, on a Gemini tab, in Chrome. */
export function resetPopupBrowser(): {
  local: Record<string, unknown>;
  sync: Record<string, unknown>;
} {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubGlobal('chrome', extensionApi);
  extensionApi.runtime.lastError = undefined;
  browserTarget.safari = false;
  const local: Record<string, unknown> = {};
  const sync: Record<string, unknown> = {};
  for (const [area, stored] of [
    ['local', local],
    ['sync', sync],
  ] as const) {
    extensionApi.storage[area].get.mockImplementation((keys: unknown, callback?: unknown) => {
      const result = readStorage(keys, stored);
      if (typeof callback === 'function') callback(result);
      return Promise.resolve(result);
    });
    extensionApi.storage[area].set.mockImplementation(
      (updates: Record<string, unknown>, callback?: unknown) => {
        Object.assign(stored, updates);
        if (typeof callback === 'function') callback();
        return Promise.resolve();
      },
    );
    extensionApi.storage[area].getBytesInUse.mockResolvedValue(0);
  }
  extensionApi.runtime.getManifest.mockReturnValue({
    version: '1.8.3',
    update_url: 'https://clients2.google.com/service/update2/crx',
  });
  extensionApi.runtime.sendMessage.mockResolvedValue(undefined);
  extensionApi.tabs.query.mockResolvedValue([GEMINI_TAB]);
  extensionApi.tabs.sendMessage.mockResolvedValue(undefined);
  extensionApi.permissions.contains.mockResolvedValue(false);
  extensionApi.permissions.request.mockResolvedValue(true);
  return { local, sync };
}

/** Deliver a sync change to every storage listener the popup registered. */
export function emitSyncChange(changes: Record<string, unknown>): void {
  const payload = Object.fromEntries(
    Object.entries(changes).map(([key, newValue]) => [key, { newValue }]),
  );
  const removed = new Set(
    extensionApi.storage.onChanged.removeListener.mock.calls.map(([listener]) => listener),
  );
  for (const [listener] of extensionApi.storage.onChanged.addListener.mock.calls) {
    if (removed.has(listener)) continue;
    (listener as (changes: unknown, area: string) => void)(payload, 'sync');
  }
}

/** The official plugin rows in the mounted popup. */
export function popupRows(container: HTMLElement) {
  const row = (id: string) =>
    container.querySelector<HTMLLIElement>(`[data-official-plugin="${id}"]`);
  return {
    row,
    // The row's own switch; an enabled row's inline settings hold switches too.
    toggle: (id: string) => row(id)!.querySelector<HTMLInputElement>('input[aria-describedby]')!,
    listedIds: () =>
      [...container.querySelectorAll<HTMLElement>('[data-official-plugin]')].map(
        (element) => element.dataset.officialPlugin,
      ),
  };
}
