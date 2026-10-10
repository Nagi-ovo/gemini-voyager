/**
 * The highlights' soft-cap measurement: what a commit would leave in local
 * storage, against the configured soft cap (or the effective quota when lower)
 * minus a reserve of max(512 KiB, 10%).
 */
import {
  DEFAULT_STORAGE_SOFT_CAP_MB,
  STORAGE_QUOTA_SOFT_CAP_KEY,
  STORAGE_SOFT_CAP_OPTIONS_MB,
  type StorageSoftCapMb,
} from '@/core/services/StorageQuotaService';

const MEBIBYTE = 1024 * 1024;
const MINIMUM_STORAGE_RESERVE_BYTES = 512 * 1024;
const STORAGE_RESERVE_RATIO = 0.1;

export interface SoftCapStorage {
  get(keys: null | string | readonly string[]): Promise<Record<string, unknown>>;
  getBytesInUse?(keys: null | string | readonly string[]): Promise<number>;
  getEffectiveQuotaBytes?(): Promise<number | null>;
}

export interface SoftCapVerdict {
  /** The commit grows storage past the usable bytes, counting `reservedBytes` as used. */
  exceeds: boolean;
  context: Record<string, unknown>;
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function serializedItemBytes(key: string, value: unknown): number {
  return utf8Bytes(JSON.stringify({ [key]: value }));
}

function normalizeSoftCap(value: unknown): StorageSoftCapMb {
  return STORAGE_SOFT_CAP_OPTIONS_MB.includes(value as StorageSoftCapMb)
    ? (value as StorageSoftCapMb)
    : DEFAULT_STORAGE_SOFT_CAP_MB;
}

export async function measureSoftCap(
  storage: SoftCapStorage,
  setItems: Record<string, unknown>,
  removeKeys: readonly string[],
  reservedBytes: number,
): Promise<SoftCapVerdict> {
  const affectedKeys = Array.from(new Set([...Object.keys(setItems), ...removeKeys]));
  const keysToRead = Array.from(new Set([...affectedKeys, STORAGE_QUOTA_SOFT_CAP_KEY]));
  let currentItems = await storage.get(storage.getBytesInUse ? keysToRead : null);
  let currentBytes: number | null = null;
  if (storage.getBytesInUse) {
    try {
      const measured = await storage.getBytesInUse(null);
      if (Number.isFinite(measured) && measured >= 0) currentBytes = measured;
    } catch {
      // Fall back to a complete deterministic estimate below.
    }
  }
  if (currentBytes === null) {
    if (storage.getBytesInUse) currentItems = await storage.get(null);
    currentBytes = utf8Bytes(JSON.stringify(currentItems));
  }

  const softCapMb = normalizeSoftCap(currentItems[STORAGE_QUOTA_SOFT_CAP_KEY]);
  const configuredSoftCapBytes = softCapMb * MEBIBYTE;
  const runtimeQuotaBytes = await storage.getEffectiveQuotaBytes?.();
  const softCapBytes =
    typeof runtimeQuotaBytes === 'number'
      ? Math.min(configuredSoftCapBytes, runtimeQuotaBytes)
      : configuredSoftCapBytes;
  const reserveBytes = Math.max(
    MINIMUM_STORAGE_RESERVE_BYTES,
    Math.ceil(softCapBytes * STORAGE_RESERVE_RATIO),
  );
  const usableBytes = softCapBytes - reserveBytes;
  let oldAffectedBytes = 0;
  for (const key of affectedKeys) {
    if (key in currentItems) oldAffectedBytes += serializedItemBytes(key, currentItems[key]);
  }
  const newAffectedBytes = Object.entries(setItems).reduce(
    (sum, [key, value]) => sum + serializedItemBytes(key, value),
    0,
  );
  const projectedBytes = Math.max(0, currentBytes - oldAffectedBytes + newAffectedBytes);

  return {
    // Bytes other writers hold promised count as used (addendum P3P4 R6.2).
    exceeds: projectedBytes + reservedBytes > usableBytes && projectedBytes > currentBytes,
    context: {
      currentBytes,
      projectedBytes,
      softCapBytes,
      configuredSoftCapBytes,
      runtimeQuotaBytes,
      reserveBytes,
      reservedBytes,
      softCapMb,
    },
  };
}
