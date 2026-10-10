import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { resolveWatermarkSettings } from '@/core/utils/watermarkSettings';

import {
  LAST_VERSION_WITH_WATERMARK_REMOVAL_ON_BY_DEFAULT,
  keepWatermarkRemovalForUpdatedInstall,
  registerWatermarkDefaultMigrationOnInstall,
} from '../watermarkDefaultMigration';

function syncArea(initial: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = { ...initial };
  const area = {
    get: vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.filter((key) => key in state).map((key) => [key, state[key]])),
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(state, items);
    }),
  };
  return { state, area };
}

const updateFromOldDefault = { reason: 'update', previousVersion: '1.8.3' };

describe('keepWatermarkRemovalForUpdatedInstall', () => {
  it('saves removal on for an updated install with no watermark preference', async () => {
    const { state, area } = syncArea();

    expect(await keepWatermarkRemovalForUpdatedInstall(updateFromOldDefault, area)).toBe(true);

    expect(state).toEqual({
      [StorageKeys.WATERMARK_DOWNLOAD_ENABLED]: true,
      [StorageKeys.WATERMARK_PREVIEW_ENABLED]: true,
    });
    expect(resolveWatermarkSettings(state)).toEqual({ download: true, preview: true });
  });

  it('includes updates from the last release with the old default', async () => {
    const { state, area } = syncArea();

    await keepWatermarkRemovalForUpdatedInstall(
      { reason: 'update', previousVersion: LAST_VERSION_WITH_WATERMARK_REMOVAL_ON_BY_DEFAULT },
      area,
    );

    expect(resolveWatermarkSettings(state)).toEqual({ download: true, preview: true });
  });

  it('leaves a fresh install on the new off default', async () => {
    const { state, area } = syncArea();

    expect(await keepWatermarkRemovalForUpdatedInstall({ reason: 'install' }, area)).toBe(false);

    expect(area.set).not.toHaveBeenCalled();
    expect(resolveWatermarkSettings(state)).toEqual({ download: false, preview: false });
  });

  it('leaves installs that started on the off default untouched after later updates', async () => {
    const { state, area } = syncArea();

    await keepWatermarkRemovalForUpdatedInstall(
      { reason: 'update', previousVersion: '1.9.1' },
      area,
    );
    await keepWatermarkRemovalForUpdatedInstall(
      { reason: 'update', previousVersion: '2.0.0' },
      area,
    );

    expect(area.set).not.toHaveBeenCalled();
    expect(resolveWatermarkSettings(state)).toEqual({ download: false, preview: false });
  });

  it('ignores browser and shared-module updates', async () => {
    const { area } = syncArea();

    await keepWatermarkRemovalForUpdatedInstall(
      { reason: 'chrome_update', previousVersion: '1.8.0' },
      area,
    );
    await keepWatermarkRemovalForUpdatedInstall({ reason: 'shared_module_update' }, area);

    expect(area.set).not.toHaveBeenCalled();
  });

  it.each([
    [
      'both split keys off',
      { gvWatermarkDownloadEnabled: false, gvWatermarkPreviewEnabled: false },
    ],
    ['one split key off', { gvWatermarkDownloadEnabled: false }],
    ['one split key on', { gvWatermarkPreviewEnabled: true }],
    ['legacy key off', { geminiWatermarkRemoverEnabled: false }],
    ['legacy key on', { geminiWatermarkRemoverEnabled: true }],
  ])('keeps a saved preference untouched: %s', async (_label, saved) => {
    const { state, area } = syncArea(saved);
    const before = resolveWatermarkSettings(state);

    expect(await keepWatermarkRemovalForUpdatedInstall(updateFromOldDefault, area)).toBe(false);

    expect(area.set).not.toHaveBeenCalled();
    expect(state).toEqual(saved);
    expect(resolveWatermarkSettings(state)).toEqual(before);
  });

  it('treats null values as no saved preference', async () => {
    const { state, area } = syncArea({
      geminiWatermarkRemoverEnabled: null,
      gvWatermarkDownloadEnabled: null,
      gvWatermarkPreviewEnabled: null,
    });

    await keepWatermarkRemovalForUpdatedInstall(updateFromOldDefault, area);

    expect(resolveWatermarkSettings(state)).toEqual({ download: true, preview: true });
    expect(state.geminiWatermarkRemoverEnabled).toBeNull();
  });

  it('does not overwrite a choice made after the first run', async () => {
    const { state, area } = syncArea();

    await keepWatermarkRemovalForUpdatedInstall(updateFromOldDefault, area);
    await area.set({ gvWatermarkDownloadEnabled: false, gvWatermarkPreviewEnabled: false });
    area.set.mockClear();
    expect(await keepWatermarkRemovalForUpdatedInstall(updateFromOldDefault, area)).toBe(false);

    expect(area.set).not.toHaveBeenCalled();
    expect(resolveWatermarkSettings(state)).toEqual({ download: false, preview: false });
  });

  it.each([undefined, 'not-a-version'])(
    'keeps the old behavior when an update reports previous version %s',
    async (previousVersion) => {
      const { state, area } = syncArea();

      await keepWatermarkRemovalForUpdatedInstall({ reason: 'update', previousVersion }, area);

      expect(resolveWatermarkSettings(state)).toEqual({ download: true, preview: true });
    },
  );

  it('does not throw when storage fails', async () => {
    const area = {
      get: vi.fn().mockRejectedValue(new Error('quota')),
      set: vi.fn(),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await keepWatermarkRemovalForUpdatedInstall(updateFromOldDefault, area)).toBe(false);

    expect(area.set).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('registerWatermarkDefaultMigrationOnInstall', () => {
  it('runs the migration from the onInstalled event', async () => {
    const state: Record<string, unknown> = {};
    vi.mocked(chrome.storage.sync.get).mockImplementation(async () => ({}));
    vi.mocked(chrome.storage.sync.set).mockImplementation(async (items: object) => {
      Object.assign(state, items);
    });

    registerWatermarkDefaultMigrationOnInstall();
    const listener = vi.mocked(chrome.runtime.onInstalled.addListener).mock.calls.at(-1)?.[0];
    listener?.({ reason: 'update', previousVersion: '1.9.0' } as chrome.runtime.InstalledDetails);
    await vi.waitFor(() => expect(resolveWatermarkSettings(state).download).toBe(true));
  });
});
