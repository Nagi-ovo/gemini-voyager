import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { FolderManager } from '../manager';

const { mockBrowserStorage } = vi.hoisted(() => ({
  mockBrowserStorage: {
    local: { set: vi.fn(), get: vi.fn(), remove: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: mockBrowserStorage,
  },
}));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestableManager = {
  createNewChatInFolder: (folderId: string) => void;
};

interface LocationMock {
  pathname: string;
  origin: string;
  href: string;
  reload: ReturnType<typeof vi.fn>;
}

describe('createNewChatInFolder', () => {
  let manager: FolderManager | null = null;
  let locationMock: LocationMock;
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    locationMock = {
      pathname: '/app',
      origin: 'https://gemini.google.com',
      href: '',
      reload: vi.fn(),
    };
    Object.defineProperty(window, 'location', {
      value: locationMock,
      writable: true,
      configurable: true,
    });
    mockBrowserStorage.local.set.mockReset();
    mockBrowserStorage.local.set.mockResolvedValue(undefined);
    mockBrowserStorage.sync.get.mockResolvedValue({});
    mockBrowserStorage.local.get.mockResolvedValue({});
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    manager?.destroy();
    manager = null;
    vi.restoreAllMocks();
  });

  it('writes the pending folder ID to storage.local', async () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    typedManager.createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockBrowserStorage.local.set).toHaveBeenCalledWith({
      [StorageKeys.FOLDER_PROJECT_PENDING_FOLDER_ID]: 'folder-1',
    });
  });

  it('reloads when already on /app', async () => {
    locationMock.pathname = '/app';
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    typedManager.createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(locationMock.reload).toHaveBeenCalledTimes(1);
    expect(locationMock.href).toBe('');
  });

  it('navigates to /app from a conversation page', async () => {
    locationMock.pathname = '/app/abc123def456';
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    typedManager.createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(locationMock.href).toBe('https://gemini.google.com/app');
    expect(locationMock.reload).not.toHaveBeenCalled();
  });

  it('preserves the multi-account user prefix (/u/N/app)', async () => {
    locationMock.pathname = '/u/2/c/abc';
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    typedManager.createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(locationMock.href).toBe('https://gemini.google.com/u/2/app');
  });

  it('falls back to navigating when storage.set rejects with a generic error', async () => {
    mockBrowserStorage.local.set.mockRejectedValue(new Error('quota exceeded'));
    locationMock.pathname = '/app/abc';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    typedManager.createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(locationMock.href).toBe('https://gemini.google.com/app');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not navigate when extension context is invalidated', async () => {
    mockBrowserStorage.local.set.mockRejectedValue(new Error('Extension context invalidated.'));
    locationMock.pathname = '/app/abc';

    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    typedManager.createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(locationMock.href).toBe('');
    expect(locationMock.reload).not.toHaveBeenCalled();
  });
});
