import { storageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';

import { type ExportSpeakerLabelOverrides, normalizeSpeakerLabelOverrides } from '../types/export';

const SPEAKER_LABEL_SAVE_DELAY_MS = 300;

export async function getSavedSpeakerLabelOverrides(): Promise<ExportSpeakerLabelOverrides> {
  try {
    const result = await storageService.get<unknown>(StorageKeys.EXPORT_SPEAKER_LABELS);
    if (!result.success) return {};
    return normalizeSpeakerLabelOverrides(result.data);
  } catch {
    return {};
  }
}

export async function saveSpeakerLabelOverrides(value: unknown): Promise<boolean> {
  const overrides = normalizeSpeakerLabelOverrides(value);

  try {
    if (Object.keys(overrides).length === 0) {
      const result = await storageService.remove(StorageKeys.EXPORT_SPEAKER_LABELS);
      return result.success;
    }

    const result = await storageService.set(StorageKeys.EXPORT_SPEAKER_LABELS, overrides);
    return result.success;
  } catch {
    return false;
  }
}

export class SpeakerLabelPreferenceSaver {
  private pendingValue: ExportSpeakerLabelOverrides | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<boolean> = Promise.resolve(true);

  constructor(private readonly delayMs = SPEAKER_LABEL_SAVE_DELAY_MS) {}

  schedule(value: unknown): void {
    this.pendingValue = normalizeSpeakerLabelOverrides(value);
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);

    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      void this.flush();
    }, this.delayMs);
  }

  flush(): Promise<boolean> {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const value = this.pendingValue;
    this.pendingValue = null;
    if (value === null) return this.writeChain;

    this.writeChain = this.writeChain.then(() => saveSpeakerLabelOverrides(value));
    return this.writeChain;
  }
}
