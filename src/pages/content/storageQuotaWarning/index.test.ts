import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { toastDriver } from '@/tests/toastDriver';

import { startStorageQuotaWarningToast } from './index';

let cleanup: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chrome.storage.sync.get).mockImplementation(((
    _keys: unknown,
    callback?: (items: Record<string, unknown>) => void,
  ) => {
    const items = { [StorageKeys.LANGUAGE]: 'en' };
    callback?.(items);
    return Promise.resolve(items);
  }) as typeof chrome.storage.sync.get);
  document.body.innerHTML = '';
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
});

function getMessageListener(): (message: unknown) => void {
  const addListener = chrome.runtime.onMessage.addListener as unknown as ReturnType<typeof vi.fn>;
  return addListener.mock.calls.at(-1)?.[0] as (message: unknown) => void;
}

describe('storage quota warning toast', () => {
  it('drops a warning whose strings arrive after the feature stopped', async () => {
    cleanup = startStorageQuotaWarningToast();
    getMessageListener()({
      type: 'gv.storageQuota.warning',
      payload: { level: 'warning', percent: 82 },
    });
    cleanup();
    cleanup = null;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(toastDriver.all()).toEqual([]);
  });

  it('registers the current tab and renders a warning message', async () => {
    cleanup = startStorageQuotaWarningToast();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'gv.storageQuota.ready' });

    getMessageListener()({
      type: 'gv.storageQuota.warning',
      payload: { level: 'warning', percent: 82 },
    });

    await vi.waitFor(() => expect(toastDriver.all()).toHaveLength(1));
    expect(toastDriver.all()[0]).toMatchObject({
      title: 'Near limit',
      message:
        'Voyager storage is 82% full. Open the extension popup to review or clean up stored data.',
      tone: 'warning',
      role: 'status',
    });
  });

  it('replaces an existing warning with the critical state and supports dismissal', async () => {
    cleanup = startStorageQuotaWarningToast();
    const listener = getMessageListener();
    listener({
      type: 'gv.storageQuota.warning',
      payload: { level: 'warning', percent: 82 },
    });
    await vi.waitFor(() => expect(toastDriver.all()).toHaveLength(1));

    listener({
      type: 'gv.storageQuota.warning',
      payload: { level: 'critical', percent: 96 },
    });
    await vi.waitFor(() => expect(toastDriver.find('Almost full')?.tone).toBe('error'));
    expect(toastDriver.all()).toHaveLength(1);
    expect(toastDriver.all()[0].role).toBe('alert');

    toastDriver.press(toastDriver.all()[0], 'Dismiss');
    expect(toastDriver.all()).toEqual([]);
  });

  it('dismissing while a newer warning is loading keeps it dismissed', async () => {
    cleanup = startStorageQuotaWarningToast();
    const listener = getMessageListener();
    listener({
      type: 'gv.storageQuota.warning',
      payload: { level: 'warning', percent: 82 },
    });
    await vi.waitFor(() => expect(toastDriver.all()).toHaveLength(1));

    const pendingLocaleReads: Array<() => void> = [];
    vi.mocked(chrome.storage.sync.get).mockImplementation(
      ((_keys: unknown, callback?: (items: Record<string, unknown>) => void) =>
        new Promise<Record<string, unknown>>((resolve) => {
          pendingLocaleReads.push(() => {
            const items = { [StorageKeys.LANGUAGE]: 'en' };
            callback?.(items);
            resolve(items);
          });
        })) as typeof chrome.storage.sync.get,
    );
    listener({
      type: 'gv.storageQuota.warning',
      payload: { level: 'critical', percent: 96 },
    });
    expect(pendingLocaleReads.length).toBeGreaterThan(0);
    expect(toastDriver.all()[0].title).toBe('Near limit');

    toastDriver.press(toastDriver.all()[0], 'Dismiss');
    expect(toastDriver.all()).toEqual([]);
    pendingLocaleReads.forEach((release) => release());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(toastDriver.all()).toEqual([]);
  });
});
