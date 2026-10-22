/**
 * The `webextension-polyfill` stand-in for the account-scoped backup suites
 * (`accountScopedBackup*.test.ts`). It imports nothing from the project, so a
 * test file's `vi.mock` factory can load it before the folder code does.
 */
import { vi } from 'vitest';

export const mockBrowser = {
  runtime: {
    id: 'test-extension-id',
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    sendMessage: vi.fn(),
  },
  storage: {
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn() },
  },
};
