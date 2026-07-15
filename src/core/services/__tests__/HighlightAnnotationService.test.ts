import { beforeEach, describe, expect, it } from 'vitest';

import { STORAGE_QUOTA_SOFT_CAP_KEY } from '@/core/services/StorageQuotaService';
import type {
  HighlightAccountScope,
  HighlightCreateInput,
  HighlightRecordV1,
} from '@/core/types/highlight';

import {
  HighlightAnnotationError,
  HighlightAnnotationService,
  type HighlightStorageAdapter,
  createHighlightSourceTextHash,
  getHighlightAccountHash,
  getHighlightBucketStorageKey,
  getHighlightIndexStorageKey,
} from '../HighlightAnnotationService';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class MemoryStorage implements HighlightStorageAdapter {
  readonly items: Record<string, unknown>;
  forcedBytesInUse: number | null = null;
  effectiveQuotaBytes: number | null = null;

  constructor(initial: Record<string, unknown> = {}) {
    this.items = clone(initial);
  }

  async get(keys: null | string | readonly string[]): Promise<Record<string, unknown>> {
    if (keys === null) return clone(this.items);
    const requested = typeof keys === 'string' ? [keys] : keys;
    return Object.fromEntries(
      requested.filter((key) => key in this.items).map((key) => [key, clone(this.items[key])]),
    );
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.items, clone(items));
  }

  async remove(keys: string | readonly string[]): Promise<void> {
    for (const key of typeof keys === 'string' ? [keys] : keys) delete this.items[key];
  }

  async getBytesInUse(): Promise<number> {
    return this.forcedBytesInUse ?? new TextEncoder().encode(JSON.stringify(this.items)).byteLength;
  }

  async getEffectiveQuotaBytes(): Promise<number | null> {
    return this.effectiveQuotaBytes;
  }
}

const SCOPE: HighlightAccountScope = {
  platform: 'gemini',
  accountKey: 'email:user@example.com',
  accountId: 1,
  routeUserId: '0',
};

function input(overrides: Partial<HighlightCreateInput> = {}): HighlightCreateInput {
  const exact = 'A useful selected passage';
  return {
    conversationId: 'gemini:conv:abc',
    conversationUrl: 'https://gemini.google.com/u/0/app/abc',
    conversationTitle: 'Research notes',
    turnId: 'u-turn-1',
    role: 'assistant',
    anchor: {
      quote: { exact, prefix: 'Before ', suffix: ' after' },
      position: { start: 10, end: 10 + exact.length },
      sourceTextHash: createHighlightSourceTextHash('response source'),
    },
    note: 'Remember this',
    color: 'yellow',
    ...overrides,
  };
}

function createHarness(initial: Record<string, unknown> = {}) {
  const storage = new MemoryStorage(initial);
  let uuidCounter = 0;
  let now = 1_000;
  const service = new HighlightAnnotationService({
    storage,
    now: () => now,
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
  });
  return {
    service,
    storage,
    advanceTime(value = 1) {
      now += value;
    },
    setTime(value: number) {
      now = value;
    },
  };
}

describe('HighlightAnnotationService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores a bounded record in an account index and conversation bucket', async () => {
    const { service, storage } = createHarness();
    const result = await service.add(SCOPE, input());

    expect(result.duplicate).toBe(false);
    expect(result.record).toMatchObject({
      schemaVersion: 1,
      accountHash: getHighlightAccountHash(SCOPE),
      conversationId: 'gemini:conv:abc',
      anchor: { quote: { exact: 'A useful selected passage' } },
    });
    const indexKey = getHighlightIndexStorageKey(SCOPE);
    const bucketKey = getHighlightBucketStorageKey(SCOPE, 'gemini:conv:abc');
    expect(storage.items[indexKey]).toBeDefined();
    expect(storage.items[bucketKey]).toBeDefined();
    expect(Object.keys(storage.items).join(' ')).not.toContain(SCOPE.accountKey);
    expect(JSON.stringify(storage.items)).not.toContain('<html');
  });

  it('serializes concurrent additions and deduplicates the same text anchor', async () => {
    const { service } = createHarness();

    const [first, second] = await Promise.all([
      service.add(SCOPE, input()),
      service.add(SCOPE, input()),
    ]);

    expect([first.duplicate, second.duplicate].sort()).toEqual([false, true]);
    expect(first.record.id).toBe(second.record.id);
    expect(await service.getConversation(SCOPE, 'gemini:conv:abc')).toHaveLength(1);
  });

  it('supports updates plus hard and tombstone deletion from a stored account scope', async () => {
    const { service, advanceTime } = createHarness();
    const added = await service.add(SCOPE, input());
    const storedScope = {
      platform: SCOPE.platform,
      accountHash: getHighlightAccountHash(SCOPE),
    } as const;

    advanceTime();
    const updated = await service.update(
      storedScope,
      added.record.conversationId,
      added.record.id,
      { note: 'Updated note', color: 'blue' },
    );
    expect(updated).toMatchObject({ note: 'Updated note', color: 'blue' });
    expect(updated.revision.counter).toBeGreaterThan(added.record.revision.counter);

    advanceTime();
    const removed = await service.remove(storedScope, updated.conversationId, updated.id, {
      tombstone: true,
    });
    expect(removed).toMatchObject({ removed: true, tombstone: true });
    expect(removed.record).toMatchObject({
      anchor: { quote: { exact: 'x', prefix: '', suffix: '' } },
      deletedAt: expect.any(Number),
    });
    expect(removed.record).not.toHaveProperty('note');
    expect(removed.record).not.toHaveProperty('conversationTitle');
    expect(await service.getAll(SCOPE)).toEqual([]);
    expect(await service.getAll(SCOPE, { includeDeleted: true })).toHaveLength(1);

    expect(await service.remove(storedScope, updated.conversationId, updated.id)).toMatchObject({
      removed: true,
      tombstone: false,
    });
    expect(await service.getAll(SCOPE, { includeDeleted: true })).toEqual([]);
  });

  it.each([
    {
      name: 'exact quote',
      modify: () =>
        input({
          anchor: {
            ...input().anchor,
            quote: { ...input().anchor.quote, exact: 'é'.repeat(8_193) },
          },
        }),
    },
    {
      name: 'prefix context',
      modify: () =>
        input({
          anchor: {
            ...input().anchor,
            quote: { ...input().anchor.quote, prefix: 'p'.repeat(129) },
          },
        }),
    },
    { name: 'note', modify: () => input({ note: 'n'.repeat(8 * 1024 + 1) }) },
  ])('rejects an oversized $name', async ({ modify }) => {
    const { service } = createHarness();
    await expect(service.add(SCOPE, modify())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    } satisfies Partial<HighlightAnnotationError>);
  });

  it('accepts the exact byte boundary and reports a typed oversized-record error', async () => {
    const { service } = createHarness();
    const exact = 'é'.repeat(8_192);
    await expect(
      service.add(
        SCOPE,
        input({
          note: undefined,
          conversationTitle: undefined,
          anchor: {
            ...input().anchor,
            quote: { exact, prefix: '', suffix: '' },
            position: { start: 0, end: exact.length },
          },
        }),
      ),
    ).resolves.toMatchObject({ duplicate: false });

    await expect(
      service.add(
        SCOPE,
        input({
          conversationId: 'gemini:conv:huge',
          conversationTitle: 't'.repeat(20 * 1024),
          anchor: {
            ...input().anchor,
            quote: { exact, prefix: '', suffix: '' },
            position: { start: 0, end: exact.length },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'RECORD_TOO_LARGE' });
  });

  it('preserves the larger of 512 KiB or 10% of the configured soft cap', async () => {
    const { service, storage } = createHarness({ [STORAGE_QUOTA_SOFT_CAP_KEY]: 25 });
    storage.forcedBytesInUse = 25 * 1024 * 1024 * 0.9 - 10;

    await expect(service.add(SCOPE, input())).rejects.toMatchObject({
      code: 'SOFT_CAP_REACHED',
      context: expect.objectContaining({
        softCapMb: 25,
        reserveBytes: 2.5 * 1024 * 1024,
      }),
    });
  });

  it('uses the lower runtime quota until unlimited storage is granted', async () => {
    const { service, storage } = createHarness({ [STORAGE_QUOTA_SOFT_CAP_KEY]: 100 });
    storage.effectiveQuotaBytes = 10 * 1024 * 1024;
    storage.forcedBytesInUse = 9 * 1024 * 1024 - 10;

    await expect(service.add(SCOPE, input())).rejects.toMatchObject({
      code: 'SOFT_CAP_REACHED',
      context: expect.objectContaining({
        configuredSoftCapBytes: 100 * 1024 * 1024,
        runtimeQuotaBytes: 10 * 1024 * 1024,
        softCapBytes: 10 * 1024 * 1024,
      }),
    });
  });

  it('allows a compact tombstone deletion even when storage is already at the cap', async () => {
    const { service, storage } = createHarness({ [STORAGE_QUOTA_SOFT_CAP_KEY]: 25 });
    const added = await service.add(SCOPE, input({ note: undefined }));
    storage.forcedBytesInUse = 25 * 1024 * 1024;

    await expect(
      service.remove(SCOPE, added.record.conversationId, added.record.id, { tombstone: true }),
    ).resolves.toMatchObject({ removed: true, tombstone: true });
  });

  it('keeps a bounded clear marker and blocks stale data from global reads/imports', async () => {
    const { service, storage, advanceTime } = createHarness();
    const added = await service.add(SCOPE, input());
    const bucketKey = getHighlightBucketStorageKey(SCOPE, added.record.conversationId);
    const staleBucket = clone(storage.items[bucketKey]);
    advanceTime(100);

    const cleared = await service.clearAll(SCOPE);
    expect(cleared.removed).toBe(1);
    expect(storage.items[bucketKey]).toBeUndefined();

    // Simulate a crash/stale mirror leaving a pre-clear bucket behind.
    await storage.set({ [bucketKey]: staleBucket });
    expect(await service.getAllAccounts()).toEqual([]);

    const stats = await service.importMerge(SCOPE, [added.record]);
    expect(stats.skippedByClearMarker).toBe(1);
    expect(await service.getAll(SCOPE)).toEqual([]);
  });

  it('keeps post-clear records visible when the device clock moves backwards', async () => {
    const { service, advanceTime, setTime } = createHarness();
    await service.add(SCOPE, input());
    advanceTime(10_000);
    await service.clearAll(SCOPE);
    setTime(500);

    await service.add(SCOPE, input({ conversationId: 'gemini:conv:after-clear' }));
    expect(await service.getAll(SCOPE)).toEqual([
      expect.objectContaining({ conversationId: 'gemini:conv:after-clear' }),
    ]);
  });

  it('blocks a stale remote record despite a higher counter and fast remote clock', async () => {
    const { service, advanceTime } = createHarness();
    const added = await service.add(SCOPE, input());
    advanceTime(100);
    const cleared = await service.clearAll(SCOPE);
    const staleRemote: HighlightRecordV1 = {
      ...clone(added.record),
      updatedAt: cleared.clearMarker.clearedAt + 1_000_000,
      revision: { deviceId: 'remote-device', counter: 999 },
    };

    await expect(service.importMerge(SCOPE, [staleRemote])).resolves.toMatchObject({
      imported: 0,
      skippedByClearMarker: 1,
      total: 0,
    });
    expect(await service.getAll(SCOPE)).toEqual([]);
  });

  it('keeps a remote record created after observing the clear generation despite a slow clock', async () => {
    const { service, advanceTime } = createHarness();
    const added = await service.add(SCOPE, input());
    advanceTime(100);
    const cleared = await service.clearAll(SCOPE);
    const generation = cleared.clearMarker.generation;
    expect(generation).toBeDefined();
    if (!generation) throw new Error('Expected a clear generation');

    const postClearRemote: HighlightRecordV1 = {
      ...clone(added.record),
      id: '00000000-0000-4000-8000-remote0000001',
      createdAt: 1,
      updatedAt: 1,
      revision: { deviceId: 'remote-device', counter: 1 },
      clearGeneration: generation.id,
    };

    await expect(service.importMerge(SCOPE, [postClearRemote])).resolves.toMatchObject({
      imported: 1,
      skippedByClearMarker: 0,
      total: 1,
    });
    expect(await service.getAll(SCOPE)).toEqual([
      expect.objectContaining({ id: postClearRemote.id, clearGeneration: generation.id }),
    ]);
  });

  it('keeps a newer local clear marker over an older high-counter remote marker', async () => {
    const { service, advanceTime } = createHarness();
    const added = await service.add(SCOPE, input());
    advanceTime(200);
    const localClear = await service.clearAll(SCOPE);
    const betweenClears: HighlightRecordV1 = {
      ...clone(added.record),
      updatedAt: localClear.clearMarker.clearedAt - 50,
      revision: { deviceId: 'remote-device', counter: 1_000 },
    };

    const stats = await service.importMerge(SCOPE, [betweenClears], {
      clearMarker: {
        clearedAt: localClear.clearMarker.clearedAt - 100,
        revision: { deviceId: 'remote-device', counter: 999 },
      },
    });

    expect(stats).toMatchObject({ imported: 0, skippedByClearMarker: 1, total: 0 });
    expect((await service.getAccountSnapshot(SCOPE)).clearMarker).toEqual(localClear.clearMarker);
  });

  it('orders same-device clear markers by counter when the clock moves backwards', async () => {
    const { service, advanceTime, setTime } = createHarness();
    await service.add(SCOPE, input());
    advanceTime(1_000);
    const earlierRevision = await service.clearAll(SCOPE);
    setTime(500);
    const laterRevision = await service.clearAll(SCOPE);

    await service.importMerge(SCOPE, [], { clearMarker: earlierRevision.clearMarker });

    expect(laterRevision.clearMarker.revision.counter).toBeGreaterThan(
      earlierRevision.clearMarker.revision.counter,
    );
    expect(laterRevision.clearMarker.clearedAt).toBeLessThan(earlierRevision.clearMarker.clearedAt);
    expect((await service.getAccountSnapshot(SCOPE)).clearMarker).toEqual(
      laterRevision.clearMarker,
    );
  });

  it('merges imports deterministically by revision and deduplicates anchor identity', async () => {
    const { service } = createHarness();
    const added = await service.add(SCOPE, input());
    const older: HighlightRecordV1 = {
      ...clone(added.record),
      note: 'Older',
      revision: { ...added.record.revision, counter: 0 },
    };
    const newer: HighlightRecordV1 = {
      ...clone(added.record),
      note: 'Newer',
      updatedAt: added.record.updatedAt + 10,
      revision: { deviceId: 'remote-device', counter: 10 },
    };

    expect(await service.importMerge(SCOPE, [older])).toMatchObject({ duplicates: 1 });
    expect(await service.importMerge(SCOPE, [newer])).toMatchObject({ updated: 1 });
    expect((await service.getAll(SCOPE))[0]?.note).toBe('Newer');

    const sameAnchorNewId: HighlightRecordV1 = {
      ...clone(newer),
      id: 'remote-record-id',
      note: 'Newest anchor winner',
      revision: { deviceId: 'remote-device', counter: 11 },
    };
    expect(await service.importMerge(SCOPE, [sameAnchorNewId])).toMatchObject({ updated: 1 });
    expect(await service.getAll(SCOPE)).toEqual([
      expect.objectContaining({ id: 'remote-record-id', note: 'Newest anchor winner' }),
    ]);
  });

  it('isolates accounts and rejects records imported into the wrong account', async () => {
    const { service } = createHarness();
    const added = await service.add(SCOPE, input());
    const otherScope: HighlightAccountScope = {
      ...SCOPE,
      accountKey: 'email:other@example.com',
      accountId: 2,
      routeUserId: '1',
    };
    await service.add(otherScope, input({ conversationId: 'gemini:conv:other' }));

    expect(await service.getAllAccounts()).toHaveLength(2);
    expect(await service.getAll(SCOPE)).toHaveLength(1);
    await expect(service.importMerge(otherScope, [added.record])).rejects.toMatchObject({
      code: 'ACCOUNT_MISMATCH',
    });
  });

  it('claims legacy default-account highlights for the resolved account', async () => {
    const { service } = createHarness();
    const legacyScope: HighlightAccountScope = {
      platform: 'gemini',
      accountKey: 'default',
      accountId: 0,
      routeUserId: null,
    };
    await service.add(legacyScope, input());

    await expect(service.claimLegacyDefaultHighlights(SCOPE)).resolves.toBe(1);

    const claimed = await service.getAll(SCOPE);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      conversationId: 'gemini:conv:abc',
      accountHash: getHighlightAccountHash(SCOPE),
    });
    expect(await service.getAll(legacyScope)).toEqual([]);
    await expect(service.claimLegacyDefaultHighlights(SCOPE)).resolves.toBe(0);
  });

  it('clears every account while retaining one bounded marker per account/platform', async () => {
    const { service, storage, advanceTime } = createHarness();
    const otherScope: HighlightAccountScope = {
      ...SCOPE,
      accountKey: 'email:other@example.com',
      accountId: 2,
      routeUserId: '1',
    };
    await service.add(SCOPE, input());
    await service.add(otherScope, input({ conversationId: 'gemini:conv:other' }));
    advanceTime(100);

    const result = await service.clearAllAccounts();

    expect(result.removed).toBe(2);
    expect(result.accounts).toHaveLength(2);
    expect(await service.getAllAccounts()).toEqual([]);
    expect(Object.keys(storage.items).filter((key) => key.includes(':bucket:v1:'))).toEqual([]);
    expect(Object.keys(storage.items).filter((key) => key.includes(':index:v1:'))).toHaveLength(2);
  });
});
