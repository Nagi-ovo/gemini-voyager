import { useCallback, useState } from 'react';

import { StorageKeys } from '@/core/types/common';
import { WATERMARK_DEFAULT, resolveWatermarkSettings } from '@/core/utils/watermarkSettings';

export const WATERMARK_SETTINGS_STORAGE_DEFAULTS = {
  [StorageKeys.WATERMARK_REMOVER_ENABLED]: null,
  [StorageKeys.WATERMARK_DOWNLOAD_ENABLED]: null,
  [StorageKeys.WATERMARK_PREVIEW_ENABLED]: null,
};

export function useWatermarkPopupSettings(
  writeSyncStorage: (payload: Record<string, unknown>) => Promise<void>,
) {
  const [values, setValues] = useState({ ...WATERMARK_DEFAULT });
  const hydrateFromStorage = useCallback((raw: Record<string, unknown>) => {
    setValues(resolveWatermarkSettings(raw));
  }, []);

  const onChange = useCallback(
    (kind: 'download' | 'preview', enabled: boolean) => {
      const next = { ...values, [kind]: enabled };
      setValues(next);
      void writeSyncStorage({
        [StorageKeys.WATERMARK_DOWNLOAD_ENABLED]: next.download,
        [StorageKeys.WATERMARK_PREVIEW_ENABLED]: next.preview,
        [StorageKeys.WATERMARK_REMOVER_ENABLED]: null,
      });
    },
    [values, writeSyncStorage],
  );

  return { values, onChange, hydrateFromStorage };
}
