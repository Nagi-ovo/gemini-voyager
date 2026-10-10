import type { HighlightAccountScope } from '@/core/types/highlight';
import type {
  HighlightClearMarkerV1,
  HighlightConversationBucketV1,
  HighlightConversationIndexEntryV1,
  HighlightIndexV1,
  HighlightRecordV1,
  HighlightStoredAccountScope,
} from '@/core/types/highlight';
import {
  HIGHLIGHT_BUCKET_KEY_PREFIX,
  HIGHLIGHT_INDEX_KEY_PREFIX,
  HIGHLIGHT_LIMITS,
  HIGHLIGHT_SCHEMA_VERSION,
  isHighlightClearMarkerV1,
  isHighlightRecordV1,
} from '@/core/types/highlight';
import { hashString } from '@/core/utils/hash';

import type { HighlightQueryOptions } from './HighlightAnnotationService';
import { utf8Bytes } from './highlightSoftCap';

export type HighlightScope = HighlightAccountScope | HighlightStoredAccountScope;

export type HighlightAnnotationErrorCode =
  | 'INVALID_SCOPE'
  | 'VALIDATION_FAILED'
  | 'RECORD_TOO_LARGE'
  | 'SOFT_CAP_REACHED'
  | 'NOT_FOUND'
  | 'ACCOUNT_MISMATCH'
  | 'CORRUPT_DATA'
  | 'STORAGE_UNAVAILABLE';

export class HighlightAnnotationError extends Error {
  constructor(
    public readonly code: HighlightAnnotationErrorCode,
    message: string,
    public readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HighlightAnnotationError';
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Deterministic total ordering used by local imports and future cloud merges. */
export function compareHighlightRecords(left: HighlightRecordV1, right: HighlightRecordV1): number {
  if (left.revision.counter !== right.revision.counter) {
    return left.revision.counter - right.revision.counter;
  }
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt;
  const deviceOrder = compareStrings(left.revision.deviceId, right.revision.deviceId);
  return deviceOrder !== 0 ? deviceOrder : compareStrings(left.id, right.id);
}

function compareClearMarkers(left: HighlightClearMarkerV1, right: HighlightClearMarkerV1): number {
  if (left.generation && right.generation) {
    if (left.generation.counter !== right.generation.counter) {
      return left.generation.counter - right.generation.counter;
    }
    const generationOrder = compareStrings(left.generation.id, right.generation.id);
    if (generationOrder !== 0) return generationOrder;
  } else if (left.generation || right.generation) {
    // Any marker written by the generation-aware implementation supersedes a
    // legacy marker whose ordering could only rely on cross-device clocks.
    return left.generation ? 1 : -1;
  }

  // Legacy fallback for v1 exports written before clear generations existed.
  if (left.revision.deviceId === right.revision.deviceId) {
    if (left.revision.counter !== right.revision.counter) {
      return left.revision.counter - right.revision.counter;
    }
    return left.clearedAt - right.clearedAt;
  }

  // Like record revisions, counters from different devices have no shared
  // scale. Prefer the later clear time, then use the remaining fields only as
  // deterministic tie-breakers.
  if (left.clearedAt !== right.clearedAt) return left.clearedAt - right.clearedAt;
  if (left.revision.counter !== right.revision.counter) {
    return left.revision.counter - right.revision.counter;
  }
  return compareStrings(left.revision.deviceId, right.revision.deviceId);
}

export function resolveHighlightClearMarker(
  localMarker: HighlightClearMarkerV1 | undefined,
  importedMarker: HighlightClearMarkerV1 | undefined,
): HighlightClearMarkerV1 | undefined {
  return localMarker && importedMarker
    ? compareClearMarkers(localMarker, importedMarker) >= 0
      ? localMarker
      : importedMarker
    : (localMarker ?? importedMarker);
}

export function isClearedByMarker(
  record: HighlightRecordV1,
  marker: HighlightClearMarkerV1 | undefined,
): boolean {
  if (!marker) return false;

  // New records inherit the current generation. Everything from an earlier
  // or concurrent generation is compacted, independent of device wall clocks.
  if (marker.generation) return record.clearGeneration !== marker.generation.id;

  // Legacy fallback for v1 exports written before clear generations existed.
  // Revision counters are monotonic only within one device. For that device,
  // the counter is authoritative even if the system clock moves backwards.
  if (record.revision.deviceId === marker.revision.deviceId) {
    return record.revision.counter <= marker.revision.counter;
  }

  // Counters from different devices are not directly comparable. Use the
  // clear timestamp first so a stale remote record cannot reappear merely
  // because that device happened to have a larger local counter.
  if (record.updatedAt !== marker.clearedAt) return record.updatedAt < marker.clearedAt;
  if (record.revision.counter !== marker.revision.counter) {
    return record.revision.counter < marker.revision.counter;
  }
  return compareStrings(record.revision.deviceId, marker.revision.deviceId) <= 0;
}

export function anchorIdentity(record: Pick<HighlightRecordV1, 'turnId' | 'anchor'>): string {
  const { quote, position, sourceTextHash } = record.anchor;
  return JSON.stringify([record.turnId, position.start, position.end, sourceTextHash, quote.exact]);
}

export function createHighlightSourceTextHash(sourceText: string): string {
  return `fnv1a:${hashString(sourceText)}`;
}

export function getHighlightAccountHash(scope: HighlightScope): string {
  if ('accountHash' in scope) {
    if (!scope.accountHash.trim()) {
      throw new HighlightAnnotationError('INVALID_SCOPE', 'Highlight account hash is required');
    }
    return scope.accountHash;
  }
  if (!scope.accountKey.trim()) {
    throw new HighlightAnnotationError('INVALID_SCOPE', 'Highlight account key is required');
  }
  return hashString(scope.accountKey);
}

export function getHighlightIndexStorageKey(scope: HighlightScope): string {
  return `${HIGHLIGHT_INDEX_KEY_PREFIX}${getHighlightAccountHash(scope)}`;
}

function getHighlightConversationKey(
  scope: Pick<HighlightStoredAccountScope, 'platform'>,
  conversationId: string,
): string {
  return hashString(`${scope.platform}:${conversationId}`);
}

export function getHighlightBucketStorageKey(
  scope: HighlightScope,
  conversationId: string,
): string {
  const accountHash = getHighlightAccountHash(scope);
  const conversationKey = getHighlightConversationKey(scope, conversationId);
  return `${HIGHLIGHT_BUCKET_KEY_PREFIX}${accountHash}:conv:${conversationKey}`;
}

export function storedScope(scope: HighlightScope): HighlightStoredAccountScope {
  return { platform: scope.platform, accountHash: getHighlightAccountHash(scope) };
}

export function createEmptyIndex(accountHash: string, now: number): HighlightIndexV1 {
  return {
    schemaVersion: HIGHLIGHT_SCHEMA_VERSION,
    accountHash,
    conversations: {},
    updatedAt: now,
  };
}

function createEmptyBucket(
  scope: HighlightStoredAccountScope,
  conversationId: string,
  now: number,
): HighlightConversationBucketV1 {
  return {
    schemaVersion: HIGHLIGHT_SCHEMA_VERSION,
    platform: scope.platform,
    accountHash: scope.accountHash,
    conversationId,
    records: {},
    updatedAt: now,
  };
}

export function parseIndex(value: unknown, accountHash: string, now: number): HighlightIndexV1 {
  if (value === undefined) return createEmptyIndex(accountHash, now);
  if (
    !isObject(value) ||
    value.schemaVersion !== HIGHLIGHT_SCHEMA_VERSION ||
    value.accountHash !== accountHash ||
    !isObject(value.conversations) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    throw new HighlightAnnotationError('CORRUPT_DATA', 'Highlight index is invalid', {
      accountHash,
    });
  }

  const conversations: Record<string, HighlightConversationIndexEntryV1> = {};
  for (const [key, rawEntry] of Object.entries(value.conversations)) {
    if (
      !isObject(rawEntry) ||
      (rawEntry.platform !== 'gemini' && rawEntry.platform !== 'aistudio') ||
      typeof rawEntry.conversationId !== 'string' ||
      typeof rawEntry.conversationKey !== 'string' ||
      rawEntry.conversationKey !== key ||
      typeof rawEntry.bucketKey !== 'string' ||
      !rawEntry.bucketKey.startsWith(HIGHLIGHT_BUCKET_KEY_PREFIX) ||
      !Number.isSafeInteger(rawEntry.activeCount) ||
      (rawEntry.activeCount as number) < 0 ||
      !Number.isSafeInteger(rawEntry.totalCount) ||
      (rawEntry.totalCount as number) < 0 ||
      typeof rawEntry.updatedAt !== 'number' ||
      !Number.isFinite(rawEntry.updatedAt)
    ) {
      throw new HighlightAnnotationError('CORRUPT_DATA', 'Highlight index entry is invalid', {
        accountHash,
        conversationKey: key,
      });
    }
    conversations[key] = rawEntry as unknown as HighlightConversationIndexEntryV1;
  }

  const clearMarkers: HighlightIndexV1['clearMarkers'] = {};
  if (value.clearMarkers !== undefined) {
    if (!isObject(value.clearMarkers)) {
      throw new HighlightAnnotationError('CORRUPT_DATA', 'Highlight clear markers are invalid');
    }
    for (const platform of ['gemini', 'aistudio'] as const) {
      const marker = value.clearMarkers[platform];
      if (marker === undefined) continue;
      if (!isHighlightClearMarkerV1(marker)) {
        throw new HighlightAnnotationError('CORRUPT_DATA', 'Highlight clear marker is invalid', {
          platform,
        });
      }
      clearMarkers[platform] = marker;
    }
  }

  return {
    schemaVersion: HIGHLIGHT_SCHEMA_VERSION,
    accountHash,
    conversations,
    ...(Object.keys(clearMarkers).length > 0 ? { clearMarkers } : {}),
    updatedAt: value.updatedAt,
  };
}

export function parseBucket(
  value: unknown,
  scope: HighlightStoredAccountScope,
  conversationId: string,
  now: number,
): HighlightConversationBucketV1 {
  if (value === undefined) return createEmptyBucket(scope, conversationId, now);
  if (
    !isObject(value) ||
    value.schemaVersion !== HIGHLIGHT_SCHEMA_VERSION ||
    value.platform !== scope.platform ||
    value.accountHash !== scope.accountHash ||
    value.conversationId !== conversationId ||
    !isObject(value.records) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    throw new HighlightAnnotationError('CORRUPT_DATA', 'Highlight conversation bucket is invalid', {
      accountHash: scope.accountHash,
      conversationId,
    });
  }

  const records: Record<string, HighlightRecordV1> = {};
  for (const [id, record] of Object.entries(value.records)) {
    if (
      id !== (isObject(record) ? record.id : undefined) ||
      !isHighlightRecordV1(record) ||
      record.platform !== scope.platform ||
      record.accountHash !== scope.accountHash ||
      record.conversationId !== conversationId
    ) {
      throw new HighlightAnnotationError('CORRUPT_DATA', 'Highlight record is invalid', {
        accountHash: scope.accountHash,
        conversationId,
        id,
      });
    }
    records[id] = record;
  }

  return {
    schemaVersion: HIGHLIGHT_SCHEMA_VERSION,
    platform: scope.platform,
    accountHash: scope.accountHash,
    conversationId,
    records,
    updatedAt: value.updatedAt,
  };
}

export function updateIndexEntry(
  index: HighlightIndexV1,
  bucketKey: string,
  bucket: HighlightConversationBucketV1,
  now: number,
): HighlightIndexV1 {
  const conversationKey = getHighlightConversationKey(bucket, bucket.conversationId);
  const records = Object.values(bucket.records);
  const conversations = { ...index.conversations };
  if (records.length === 0) {
    delete conversations[conversationKey];
  } else {
    conversations[conversationKey] = {
      platform: bucket.platform,
      conversationId: bucket.conversationId,
      conversationKey,
      bucketKey,
      activeCount: records.filter((record) => record.deletedAt === undefined).length,
      totalCount: records.length,
      updatedAt: now,
    };
  }
  return { ...index, conversations, updatedAt: now };
}

export function filterRecords(
  records: Iterable<HighlightRecordV1>,
  marker: HighlightClearMarkerV1 | undefined,
  options: HighlightQueryOptions,
): HighlightRecordV1[] {
  return Array.from(records)
    .filter((record) => !isClearedByMarker(record, marker))
    .filter((record) => options.includeDeleted === true || record.deletedAt === undefined)
    .sort((left, right) => right.updatedAt - left.updatedAt || compareStrings(left.id, right.id));
}

export function validateRecord(record: HighlightRecordV1): void {
  const recordId = record.id;
  const recordBytes = utf8Bytes(JSON.stringify(record));
  if (!isHighlightRecordV1(record)) {
    const code: HighlightAnnotationErrorCode =
      recordBytes > HIGHLIGHT_LIMITS.recordBytes ? 'RECORD_TOO_LARGE' : 'VALIDATION_FAILED';
    throw new HighlightAnnotationError(code, 'Highlight record failed validation', {
      id: recordId,
      recordBytes,
      maximumRecordBytes: HIGHLIGHT_LIMITS.recordBytes,
    });
  }
}

export function nextRevisionCounter(
  bucket: HighlightConversationBucketV1,
  marker: HighlightClearMarkerV1 | undefined,
): number {
  return (
    Math.max(
      marker?.revision.counter ?? 0,
      ...Object.values(bucket.records).map((record) => record.revision.counter),
    ) + 1
  );
}
