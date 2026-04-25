import { describe, expect, it } from 'vitest';

import {
  WATERMARK_DEFAULT,
  WATERMARK_STORAGE_KEYS,
  resolveWatermarkSettings,
} from '../watermarkSettings';

describe('resolveWatermarkSettings', () => {
  it('returns the default (both on) for null/undefined/empty', () => {
    expect(resolveWatermarkSettings(null)).toEqual(WATERMARK_DEFAULT);
    expect(resolveWatermarkSettings(undefined)).toEqual(WATERMARK_DEFAULT);
    expect(resolveWatermarkSettings({})).toEqual(WATERMARK_DEFAULT);
    expect(WATERMARK_DEFAULT).toEqual({ download: true, preview: true });
  });

  it('migrates legacy=true to both flags on (preserve pre-split behavior)', () => {
    expect(resolveWatermarkSettings({ geminiWatermarkRemoverEnabled: true })).toEqual({
      download: true,
      preview: true,
    });
  });

  it('migrates legacy=false to both flags off', () => {
    expect(resolveWatermarkSettings({ geminiWatermarkRemoverEnabled: false })).toEqual({
      download: false,
      preview: false,
    });
  });

  it('treats legacy=null/missing as no signal (uses default)', () => {
    expect(resolveWatermarkSettings({ geminiWatermarkRemoverEnabled: null })).toEqual(
      WATERMARK_DEFAULT,
    );
  });

  it('lets new keys take precedence over legacy', () => {
    expect(
      resolveWatermarkSettings({
        geminiWatermarkRemoverEnabled: true,
        gvWatermarkDownloadEnabled: false,
        gvWatermarkPreviewEnabled: false,
      }),
    ).toEqual({ download: false, preview: false });

    expect(
      resolveWatermarkSettings({
        geminiWatermarkRemoverEnabled: false,
        gvWatermarkDownloadEnabled: true,
        gvWatermarkPreviewEnabled: true,
      }),
    ).toEqual({ download: true, preview: true });
  });

  it('falls back to per-flag default when only one new key is set', () => {
    // Only download flag set → preview falls back to default (true). Legacy
    // is ignored once any new key is present.
    expect(
      resolveWatermarkSettings({
        gvWatermarkDownloadEnabled: false,
        geminiWatermarkRemoverEnabled: false,
      }),
    ).toEqual({ download: false, preview: true });

    // Only preview flag set → download falls back to default (true).
    expect(
      resolveWatermarkSettings({
        gvWatermarkPreviewEnabled: false,
        geminiWatermarkRemoverEnabled: true,
      }),
    ).toEqual({ download: true, preview: false });
  });

  it('ignores non-boolean values for the new keys (treated as unset)', () => {
    // String/number values shouldn't poison the result; the key is treated as unset
    // and we fall through to the legacy/default rules.
    expect(
      resolveWatermarkSettings({
        gvWatermarkDownloadEnabled: 'yes',
        gvWatermarkPreviewEnabled: 1,
      }),
    ).toEqual(WATERMARK_DEFAULT);
  });

  it('exposes all three storage keys for chrome.storage.get callers', () => {
    expect(WATERMARK_STORAGE_KEYS).toEqual(
      expect.arrayContaining([
        'gvWatermarkDownloadEnabled',
        'gvWatermarkPreviewEnabled',
        'geminiWatermarkRemoverEnabled',
      ]),
    );
    expect(WATERMARK_STORAGE_KEYS).toHaveLength(3);
  });
});
