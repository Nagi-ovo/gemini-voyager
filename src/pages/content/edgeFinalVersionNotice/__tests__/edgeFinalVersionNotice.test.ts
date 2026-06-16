import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { isEdgeReleaseChannel } from '@/core/utils/browser';

import { startEdgeFinalVersionNotice } from '../index';

vi.mock('@/core/utils/browser', () => ({
  isEdgeReleaseChannel: vi.fn(() => true),
}));

vi.mock('@/utils/i18n', () => ({
  getCurrentLanguage: vi.fn(async () => 'zh'),
}));

type StorageState = Record<string, unknown>;

function mockLocalStorage(state: StorageState): void {
  (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (defaults: Record<string, unknown>, callback: (result: StorageState) => void) => {
      callback({ ...defaults, ...state });
    },
  );
  (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (values: StorageState, callback?: () => void) => {
      Object.assign(state, values);
      callback?.();
    },
  );
}

describe('Edge final version notice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T10:00:00Z'));
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.mocked(isEdgeReleaseChannel).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows the notice after the configured usage delay and persists first-seen time', async () => {
    const state: StorageState = {};
    mockLocalStorage(state);

    const cleanup = startEdgeFinalVersionNotice(1000);
    await Promise.resolve();

    expect(state[StorageKeys.EDGE_FINAL_VERSION_NOTICE_FIRST_SEEN_AT]).toBe(Date.now());
    expect(document.querySelector('.gv-edge-final-version-notice')).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);

    expect(document.querySelector('.gv-edge-final-version-notice')?.textContent).toContain(
      '会继续支持 Edge',
    );

    cleanup();
  });

  it('does not schedule the notice once it has already been shown', async () => {
    mockLocalStorage({ [StorageKeys.EDGE_FINAL_VERSION_NOTICE_SHOWN]: true });

    const cleanup = startEdgeFinalVersionNotice(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector('.gv-edge-final-version-notice')).toBeNull();

    cleanup();
  });

  it('marks the notice shown when dismissed', async () => {
    const state: StorageState = {};
    mockLocalStorage(state);

    const cleanup = startEdgeFinalVersionNotice(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    document
      .querySelector<HTMLButtonElement>('.gv-edge-final-version-notice__btn--secondary')
      ?.click();

    expect(state[StorageKeys.EDGE_FINAL_VERSION_NOTICE_SHOWN]).toBeUndefined();
    expect(document.querySelector('.gv-edge-final-version-notice')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(10_000);

    document
      .querySelector<HTMLButtonElement>('.gv-edge-final-version-notice__btn--secondary')
      ?.click();

    expect(state[StorageKeys.EDGE_FINAL_VERSION_NOTICE_SHOWN]).toBe(true);
    expect(document.querySelector('.gv-edge-final-version-notice')).toBeNull();

    cleanup();
  });

  it('does not start outside the Edge release channel', async () => {
    vi.mocked(isEdgeReleaseChannel).mockReturnValue(false);
    mockLocalStorage({});

    const cleanup = startEdgeFinalVersionNotice(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector('.gv-edge-final-version-notice')).toBeNull();

    cleanup();
  });

  it('keeps notice actions disabled during the required reading time', async () => {
    mockLocalStorage({});

    const cleanup = startEdgeFinalVersionNotice(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    const dismissButton = document.querySelector<HTMLButtonElement>(
      '.gv-edge-final-version-notice__btn--secondary',
    );
    const storeButton = document.querySelector<HTMLButtonElement>(
      '.gv-edge-final-version-notice__btn--primary',
    );
    const closeButton = document.querySelector<HTMLButtonElement>(
      '.gv-edge-final-version-notice__close',
    );

    expect(dismissButton?.disabled).toBe(true);
    expect(storeButton?.disabled).toBe(true);
    expect(closeButton?.disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(dismissButton?.disabled).toBe(false);
    expect(storeButton?.disabled).toBe(false);
    expect(closeButton?.disabled).toBe(false);

    cleanup();
  });
});
