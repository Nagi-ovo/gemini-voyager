import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { DEFAULT_IMAGE_EXPORT_WIDTH, IMAGE_EXPORT_WIDTH_WIDE } from '../../types/export';
import { getSavedImageExportWidth, saveImageExportWidth } from '../ImageExportPreferenceService';

const { getMock, setMock } = vi.hoisted(() => {
  return {
    getMock: vi.fn(),
    setMock: vi.fn(),
  };
});

vi.mock('@/core/services/StorageService', () => {
  return {
    storageService: {
      get: getMock,
      set: setMock,
    },
  };
});

describe('ImageExportPreferenceService', () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset();
  });

  it('returns the saved width when storage contains a valid preset', async () => {
    getMock.mockResolvedValue({ success: true, data: IMAGE_EXPORT_WIDTH_WIDE });

    await expect(getSavedImageExportWidth()).resolves.toBe(IMAGE_EXPORT_WIDTH_WIDE);
    expect(getMock).toHaveBeenCalledWith(StorageKeys.EXPORT_IMAGE_WIDTH);
  });

  it('falls back to the default width when storage is missing or invalid', async () => {
    getMock.mockResolvedValueOnce({ success: false, error: new Error('missing') });
    await expect(getSavedImageExportWidth()).resolves.toBe(DEFAULT_IMAGE_EXPORT_WIDTH);

    getMock.mockResolvedValueOnce({ success: true, data: 777 });
    await expect(getSavedImageExportWidth()).resolves.toBe(DEFAULT_IMAGE_EXPORT_WIDTH);
  });

  it('saves only valid widths', async () => {
    setMock.mockResolvedValue({ success: true, data: undefined });

    await saveImageExportWidth(IMAGE_EXPORT_WIDTH_WIDE);
    await saveImageExportWidth(777);
    await saveImageExportWidth(undefined);

    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(StorageKeys.EXPORT_IMAGE_WIDTH, IMAGE_EXPORT_WIDTH_WIDE);
  });
});
