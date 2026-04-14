import { storageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';

import {
  DEFAULT_IMAGE_EXPORT_WIDTH,
  type ImageExportWidth,
  isImageExportWidth,
  normalizeImageExportWidth,
} from '../types/export';

export async function getSavedImageExportWidth(): Promise<ImageExportWidth> {
  const result = await storageService.get<number>(StorageKeys.EXPORT_IMAGE_WIDTH);
  if (!result.success) {
    return DEFAULT_IMAGE_EXPORT_WIDTH;
  }

  return normalizeImageExportWidth(result.data);
}

export async function saveImageExportWidth(width: unknown): Promise<void> {
  if (!isImageExportWidth(width)) {
    return;
  }

  await storageService.set(StorageKeys.EXPORT_IMAGE_WIDTH, width);
}
