/**
 * Resolves the two watermark-removal toggles from a chrome.storage.sync record.
 *
 * Two independent flags control where watermark removal runs:
 *   - download: intercept downloads and strip the watermark before saving (the 🍌 path)
 *   - preview:  also strip watermarks from images shown in the chat UI (heavier;
 *               causes a brief flash while the canvas pipeline runs)
 *
 * Migration from the legacy single key `geminiWatermarkRemoverEnabled`:
 *   - If either new key is set, the new keys win. An unset sibling keeps its
 *     old default of true for existing partially configured installations.
 *   - Otherwise, the legacy key controls both: legacy=true → both on (preserves
 *     pre-split behavior); legacy=false → both off.
 *   - No saved preference: both off. Users can opt in to either path from the
 *     popup. Installs updated from a release with the old on default get both
 *     split keys saved as true (see `watermarkDefaultMigration.ts`).
 */

export interface WatermarkSettings {
  download: boolean;
  preview: boolean;
}

export const WATERMARK_STORAGE_KEYS = [
  'gvWatermarkDownloadEnabled',
  'gvWatermarkPreviewEnabled',
  'geminiWatermarkRemoverEnabled',
] as const;

export const WATERMARK_DEFAULT: WatermarkSettings = { download: false, preview: false };

/**
 * Whether the record holds a saved watermark choice. Without one,
 * `resolveWatermarkSettings` falls back to `WATERMARK_DEFAULT`.
 */
export function hasSavedWatermarkPreference(
  record: Record<string, unknown> | null | undefined,
): boolean {
  if (!record) return false;
  return WATERMARK_STORAGE_KEYS.some((key) => typeof record[key] === 'boolean');
}

export function resolveWatermarkSettings(
  record: Record<string, unknown> | null | undefined,
): WatermarkSettings {
  if (!record) return { ...WATERMARK_DEFAULT };

  const newDownload = record['gvWatermarkDownloadEnabled'];
  const newPreview = record['gvWatermarkPreviewEnabled'];
  const hasNew = typeof newDownload === 'boolean' || typeof newPreview === 'boolean';

  if (hasNew) {
    return {
      download: typeof newDownload === 'boolean' ? newDownload : true,
      preview: typeof newPreview === 'boolean' ? newPreview : true,
    };
  }

  const legacy = record['geminiWatermarkRemoverEnabled'];
  if (legacy === false) return { download: false, preview: false };
  if (legacy === true) return { download: true, preview: true };

  return { ...WATERMARK_DEFAULT };
}
