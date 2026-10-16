import { WATERMARK_STORAGE_KEYS, resolveWatermarkSettings } from '@/core/utils/watermarkSettings';

import { acquireWatermarkControl, startWatermarkImageHealth } from '../index';

// Existing image/feedback regressions use their storage fixtures to acquire the
// same independent runtime leases now owned by the official PluginHost handlers.
let generation = 0;
let healthStop: (() => void) | undefined;
let downloadStop: (() => void) | undefined;
let previewStop: (() => void) | undefined;

export async function startWatermarkRemover(): Promise<void> {
  const current = ++generation;
  try {
    const settings = resolveWatermarkSettings(
      await chrome.storage.sync.get<Record<string, unknown>>([...WATERMARK_STORAGE_KEYS]),
    );
    if (current !== generation) return;
    healthStop ??= startWatermarkImageHealth();
    if (settings.download) downloadStop ??= acquireWatermarkControl('download');
    else {
      downloadStop?.();
      downloadStop = undefined;
    }
    if (settings.preview) previewStop ??= acquireWatermarkControl('preview');
    else {
      previewStop?.();
      previewStop = undefined;
    }
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  } catch {
    // Delayed failing reads belong to the retired test fixture, not a new lease.
  }
}

export const restartWatermarkRemover = startWatermarkRemover;

export function stopWatermarkRemover(): void {
  generation += 1;
  downloadStop?.();
  downloadStop = undefined;
  previewStop?.();
  previewStop = undefined;
  healthStop?.();
  healthStop = undefined;
}
