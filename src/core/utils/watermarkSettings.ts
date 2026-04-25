/**
 * Resolves the two watermark-removal toggles from a chrome.storage.sync record.
 *
 * Two independent flags control where watermark removal runs:
 *   - download: intercept downloads and strip the watermark before saving (the 🍌 path)
 *   - preview:  also strip watermarks from images shown in the chat UI (heavier;
 *               causes a brief flash while the canvas pipeline runs)
 *
 * Migration from the legacy single key `geminiWatermarkRemoverEnabled`:
 *   - If either new key is set, the new keys win (and any unset new key falls
 *     back to its default — both default to true).
 *   - Otherwise, the legacy key controls both: legacy=true → both on (preserves
 *     pre-split behavior); legacy=false → both off.
 *   - First install (no legacy, no new): both on. Users who want the lighter
 *     download-only path opt in via the popup.
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

export const WATERMARK_DEFAULT: WatermarkSettings = { download: true, preview: true };

export function resolveWatermarkSettings(
  record: Record<string, unknown> | null | undefined,
): WatermarkSettings {
  if (!record) return { ...WATERMARK_DEFAULT };

  const newDownload = record['gvWatermarkDownloadEnabled'];
  const newPreview = record['gvWatermarkPreviewEnabled'];
  const hasNew = typeof newDownload === 'boolean' || typeof newPreview === 'boolean';

  if (hasNew) {
    return {
      download: typeof newDownload === 'boolean' ? newDownload : WATERMARK_DEFAULT.download,
      preview: typeof newPreview === 'boolean' ? newPreview : WATERMARK_DEFAULT.preview,
    };
  }

  const legacy = record['geminiWatermarkRemoverEnabled'];
  if (legacy === false) return { download: false, preview: false };
  if (legacy === true) return { download: true, preview: true };

  return { ...WATERMARK_DEFAULT };
}
