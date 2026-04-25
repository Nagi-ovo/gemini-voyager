import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

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

describe('createNewChatInFolder', () => {
  let manager: FolderManager | null = null;
  let pushStateSpy: MockInstance<typeof window.history.pushState>;
  let dispatchSpy: MockInstance<typeof window.dispatchEvent>;

  beforeEach(() => {
    window.history.replaceState({}, '', '/app');
    mockBrowserStorage.local.set.mockReset();
    mockBrowserStorage.local.set.mockResolvedValue(undefined);
    mockBrowserStorage.sync.get.mockResolvedValue({});
    mockBrowserStorage.local.get.mockResolvedValue({});
    pushStateSpy = vi.spyOn(window.history, 'pushState');
    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    vi.restoreAllMocks();
  });

  it('writes the pending folder ID to storage.local', async () => {
    manager = new FolderManager();
    (manager as unknown as TestableManager).createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockBrowserStorage.local.set).toHaveBeenCalledWith({
      [StorageKeys.FOLDER_PROJECT_PENDING_FOLDER_ID]: 'folder-1',
    });
  });

  it('dispatches the apply-pending custom event when already on /app', async () => {
    window.history.replaceState({}, '', '/app');
    manager = new FolderManager();
    (manager as unknown as TestableManager).createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();

    const customEventCalls = dispatchSpy.mock.calls.filter(
      (call) => (call[0] as Event).type === 'gv:folder-project:apply-pending',
    );
    expect(customEventCalls).toHaveLength(1);
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it('uses pushState + popstate to SPA-navigate from a conversation page', async () => {
    window.history.replaceState({}, '', '/app/abc123def456');
    manager = new FolderManager();
    (manager as unknown as TestableManager).createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/app');
    const popstateCalls = dispatchSpy.mock.calls.filter(
      (call) => (call[0] as Event).type === 'popstate',
    );
    expect(popstateCalls).toHaveLength(1);
  });

  it('preserves the multi-account user prefix when pushing state', async () => {
    window.history.replaceState({}, '', '/u/2/c/abc');
    manager = new FolderManager();
    (manager as unknown as TestableManager).createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/u/2/app');
  });

  it('falls back to navigating when storage.set rejects with a generic error', async () => {
    mockBrowserStorage.local.set.mockRejectedValue(new Error('quota exceeded'));
    window.history.replaceState({}, '', '/app/abc');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    manager = new FolderManager();
    (manager as unknown as TestableManager).createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/app');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('does not navigate when extension context is invalidated', async () => {
    mockBrowserStorage.local.set.mockRejectedValue(
      new Error('Extension context invalidated.'),
    );
    window.history.replaceState({}, '', '/app/abc');

    manager = new FolderManager();
    (manager as unknown as TestableManager).createNewChatInFolder('folder-1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(pushStateSpy).not.toHaveBeenCalled();
    const navEvents = dispatchSpy.mock.calls.filter((call) => {
      const t = (call[0] as Event).type;
      return t === 'popstate' || t === 'gv:folder-project:apply-pending';
    });
    expect(navEvents).toHaveLength(0);
  });
});
