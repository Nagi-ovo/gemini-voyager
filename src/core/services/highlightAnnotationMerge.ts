import type {
  HighlightClearMarkerV1,
  HighlightConversationBucketV1,
  HighlightImportStats,
  HighlightIndexV1,
  HighlightRecordV1,
  HighlightStoredAccountScope,
} from '@/core/types/highlight';
import { isHighlightClearMarkerV1 } from '@/core/types/highlight';

import {
  HighlightAnnotationError,
  anchorIdentity,
  compareHighlightRecords,
  getHighlightIndexStorageKey,
  isClearedByMarker,
  updateIndexEntry,
  validateRecord,
} from './highlightAnnotationData';

/** Validate the entire import before storage is read or changed. */
export function validateHighlightImport(
  scope: HighlightStoredAccountScope,
  importedRecords: readonly HighlightRecordV1[],
  clearMarker?: HighlightClearMarkerV1,
): void {
  for (const record of importedRecords) {
    validateRecord(record);
    if (record.accountHash !== scope.accountHash || record.platform !== scope.platform) {
      throw new HighlightAnnotationError(
        'ACCOUNT_MISMATCH',
        'Imported highlight belongs to a different account or platform',
        {
          id: record.id,
          expectedAccountHash: scope.accountHash,
          actualAccountHash: record.accountHash,
          expectedPlatform: scope.platform,
          actualPlatform: record.platform,
        },
      );
    }
  }
  if (clearMarker !== undefined && !isHighlightClearMarkerV1(clearMarker)) {
    throw new HighlightAnnotationError('VALIDATION_FAILED', 'Imported clear marker is invalid');
  }
}

/** Reconcile conflicts and clear generations into one budgeted write plan. */
export function planHighlightImport(
  scope: HighlightStoredAccountScope,
  index: HighlightIndexV1,
  preparedBuckets: Map<string, { key: string; bucket: HighlightConversationBucketV1 }>,
  importedRecords: readonly HighlightRecordV1[],
  effectiveMarker: HighlightClearMarkerV1 | undefined,
  readNow: () => number,
): {
  setItems: Record<string, unknown>;
  removeKeys: string[];
  getStats: () => HighlightImportStats;
} {
  const buckets = new Map(preparedBuckets);
  // Compact anything covered by the winning bounded clear marker before
  // processing imported records. This prevents cleared data from being
  // resurrected and prevents per-record deletion history from growing.
  if (effectiveMarker) {
    for (const [conversationId, state] of buckets) {
      const records = Object.fromEntries(
        Object.entries(state.bucket.records).filter(
          ([, record]) => !isClearedByMarker(record, effectiveMarker),
        ),
      );
      buckets.set(conversationId, {
        ...state,
        bucket: { ...state.bucket, records },
      });
    }
  }

  let imported = 0;
  let updated = 0;
  let duplicates = 0;
  let skippedByClearMarker = 0;

  for (const incoming of importedRecords) {
    if (isClearedByMarker(incoming, effectiveMarker)) {
      skippedByClearMarker += 1;
      continue;
    }
    const state = buckets.get(incoming.conversationId);
    if (!state) {
      throw new HighlightAnnotationError('CORRUPT_DATA', 'Import bucket was not prepared', {
        conversationId: incoming.conversationId,
      });
    }
    const records = { ...state.bucket.records };
    const existingById = records[incoming.id];
    if (existingById) {
      if (compareHighlightRecords(incoming, existingById) > 0) {
        records[incoming.id] = incoming;
        updated += 1;
      } else {
        duplicates += 1;
        continue;
      }
    } else {
      const incomingIdentity = anchorIdentity(incoming);
      const existingAnchor = Object.values(records).find(
        (record) =>
          record.deletedAt === undefined &&
          incoming.deletedAt === undefined &&
          anchorIdentity(record) === incomingIdentity,
      );
      if (existingAnchor) {
        if (compareHighlightRecords(incoming, existingAnchor) > 0) {
          delete records[existingAnchor.id];
          records[incoming.id] = incoming;
          updated += 1;
        } else {
          duplicates += 1;
          continue;
        }
      } else {
        records[incoming.id] = incoming;
        imported += 1;
      }
    }
    buckets.set(incoming.conversationId, {
      ...state,
      bucket: { ...state.bucket, records, updatedAt: readNow() },
    });
  }

  const now = readNow();
  let nextIndex: HighlightIndexV1 = {
    ...index,
    conversations: Object.fromEntries(
      Object.entries(index.conversations).filter(([, entry]) => entry.platform !== scope.platform),
    ),
    clearMarkers: effectiveMarker
      ? { ...index.clearMarkers, [scope.platform]: effectiveMarker }
      : index.clearMarkers,
    updatedAt: now,
  };
  const setItems: Record<string, unknown> = {};
  const removeKeys: string[] = [];
  for (const state of buckets.values()) {
    const bucket = { ...state.bucket, updatedAt: now };
    nextIndex = updateIndexEntry(nextIndex, state.key, bucket, now);
    if (Object.keys(bucket.records).length === 0) removeKeys.push(state.key);
    else setItems[state.key] = bucket;
  }
  setItems[getHighlightIndexStorageKey(scope)] = nextIndex;
  return {
    setItems,
    removeKeys,
    // Read the surviving records after the commit settles, as the original import did.
    getStats: () => ({
      imported,
      updated,
      duplicates,
      skippedByClearMarker,
      total: Array.from(buckets.values()).reduce(
        (sum, { bucket }) =>
          sum +
          Object.values(bucket.records).filter((record) => record.deletedAt === undefined).length,
        0,
      ),
    }),
  };
}
