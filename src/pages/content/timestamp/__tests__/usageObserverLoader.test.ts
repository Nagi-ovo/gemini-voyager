import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

function dispatchObserverReady(): void {
  const event = new MessageEvent('message', {
    data: {
      source: 'gv-history-observer',
      type: 'ready',
      payload: { observerId: 'test-observer' },
    },
    origin: window.location.origin,
  });
  Object.defineProperty(event, 'source', { value: window });
  window.dispatchEvent(event);
}

describe('usage observer loader history configuration', () => {
  let storageListener: StorageListener | null;
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useFakeTimers();
    storageListener = null;
    document.querySelectorAll('script').forEach((script) => script.remove());
    postMessageSpy = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {}) as unknown as ReturnType<typeof vi.fn>;
    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: StorageListener) => {
      storageListener = listener;
    });
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
    vi.useRealTimers();
  });

  it('resends the resolved disabled setting when the observer becomes ready', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false });
      },
    );

    await import('../../usageObserverLoader');
    postMessageSpy.mockClear();
    dispatchObserverReady();

    expect(postMessageSpy).toHaveBeenLastCalledWith(
      {
        source: 'gv-history-observer-cmd',
        type: 'configure',
        payload: { enabled: false },
      },
      window.location.origin,
    );
  });

  it('does not DOM-inject observers in Chrome or Edge builds', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false });
      },
    );
    const appendChild = vi.spyOn(document.documentElement, 'appendChild');

    await import('../../usageObserverLoader');

    expect(appendChild).not.toHaveBeenCalled();
  });

  it('retains ordered DOM injection as the Firefox compatibility fallback', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false });
      },
    );
    const appendChild = vi.spyOn(document.documentElement, 'appendChild');
    const { injectObserverFallback } = await import('../../usageObserverLoader');

    injectObserverFallback('firefox');

    const injectedSources = appendChild.mock.calls
      .map(([node]) => (node as HTMLScriptElement).src)
      .filter((src) => src.includes('-observer.js'));
    expect(injectedSources).toEqual([
      'chrome-extension://test-extension-id/usage-observer.js',
      'chrome-extension://test-extension-id/conversation-history-observer.js',
    ]);
  });

  it('does not let a stale initial storage read overwrite a newer toggle', async () => {
    let resolveInitialRead: ((result: Record<string, unknown>) => void) | null = null;
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        resolveInitialRead = callback;
      },
    );

    await import('../../usageObserverLoader');
    expect(storageListener).toBeTypeOf('function');
    storageListener!(
      {
        [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: {
          oldValue: false,
          newValue: true,
        },
      },
      'sync',
    );
    resolveInitialRead!({ [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false });

    postMessageSpy.mockClear();
    dispatchObserverReady();
    expect(postMessageSpy).toHaveBeenLastCalledWith(
      {
        source: 'gv-history-observer-cmd',
        type: 'configure',
        payload: { enabled: true },
      },
      window.location.origin,
    );
  });

  it('keeps the observer unresolved until the initial setting is known', async () => {
    let resolveInitialRead: ((result: Record<string, unknown>) => void) | null = null;
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        resolveInitialRead = callback;
      },
    );

    await import('../../usageObserverLoader');
    postMessageSpy.mockClear();
    dispatchObserverReady();
    expect(postMessageSpy).not.toHaveBeenCalled();

    resolveInitialRead!({ [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: true });
    expect(postMessageSpy).toHaveBeenLastCalledWith(
      {
        source: 'gv-history-observer-cmd',
        type: 'configure',
        payload: { enabled: true },
      },
      window.location.origin,
    );
  });

  it('fails closed when the initial storage callback does not arrive', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {});

    await import('../../usageObserverLoader');
    postMessageSpy.mockClear();
    await vi.advanceTimersByTimeAsync(1_000);
    postMessageSpy.mockClear();
    dispatchObserverReady();

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    expect(postMessageSpy).toHaveBeenLastCalledWith(
      {
        source: 'gv-history-observer-cmd',
        type: 'configure',
        payload: { enabled: false },
      },
      window.location.origin,
    );
  });

  it('removes its storage listener on page unload', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false });
      },
    );

    await import('../../usageObserverLoader');
    const listener = storageListener;
    window.dispatchEvent(new Event('beforeunload'));

    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
  });
});
