import { beforeEach, vi } from 'vitest';

vi.mock('@/core/services/KeyboardShortcutService', () => ({
  keyboardShortcutService: {
    init: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(() => () => {}),
  },
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(chrome.storage.sync.get).mockImplementation(((
    keys: unknown,
    callback?: (values: Record<string, unknown>) => void,
  ) => {
    const values =
      typeof keys === 'object' && keys !== null && !Array.isArray(keys)
        ? (keys as Record<string, unknown>)
        : {};
    callback?.(values);
    return Promise.resolve(values);
  }) as typeof chrome.storage.sync.get);
});
