import { describe, expect, it } from 'vitest';

import {
  HighlightAnnotationService,
  type HighlightStorageAdapter,
} from '@/core/services/HighlightAnnotationService';
import { createHighlightSourceTextHash } from '@/core/services/highlightAnnotationData';
import type { HighlightAccountScope, HighlightRecordV1 } from '@/core/types/highlight';

import { type StorageBudget, createStorageBudget } from '../storageBudget';
import { type ByteStore, createByteStore, itemBytes } from './byteStore';

const MIB = 1024 * 1024;
const SCOPE: HighlightAccountScope = {
  platform: 'gemini',
  accountKey: 'email:user@example.com',
  accountId: 1,
  routeUserId: '0',
};

function adapter(store: ByteStore): HighlightStorageAdapter {
  return {
    get: (keys) => store.area.get(keys),
    set: (items) => store.area.set(items),
    remove: (keys) => store.area.remove(keys),
    getBytesInUse: (keys) => store.area.getBytesInUse(keys),
    getEffectiveQuotaBytes: async () => null,
  };
}

function budgetOver(store: ByteStore): StorageBudget {
  return createStorageBudget({
    measure: async (keys) => ({
      bytesInUse: await store.area.getBytesInUse(null),
      keyBytes: await store.area.getBytesInUse(keys),
      limitBytes: 25 * MIB,
      quotaBytes: null,
    }),
    quota: async () => null,
    barrier: () => store.area.get('barrier'),
  });
}

let uuid = 0;
const nextUuid = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`;

function highlight(conversation: number, turn: number, exact = 'x'.repeat(15 * 1024)) {
  return {
    conversationId: `gemini:conv:c${conversation}`,
    conversationUrl: `https://gemini.google.com/app/c${conversation}`,
    conversationTitle: 'Notes',
    turnId: `u-turn-${turn}`,
    role: 'assistant' as const,
    anchor: {
      quote: { exact, prefix: 'Before ', suffix: ' after' },
      position: { start: 0, end: exact.length },
      sourceTextHash: createHighlightSourceTextHash('response source'),
    },
    note: 'n'.repeat(7 * 1024),
    color: 'yellow' as const,
  };
}

/** About `bytes` of valid records, made by a scratch service outside any budget. */
async function recordsOf(bytes: number): Promise<HighlightRecordV1[]> {
  const scratch = new HighlightAnnotationService({
    storage: adapter(createByteStore()),
    randomUUID: nextUuid,
  });
  const records: HighlightRecordV1[] = [];
  let size = 0;
  for (let i = 0; size < bytes; i += 1) {
    const { record } = await scratch.add(SCOPE, highlight(i % 40, i));
    records.push(record);
    size += JSON.stringify(record).length;
  }
  return records;
}

describe('highlights inside the storage budget (F2, T26d)', () => {
  it.each(['import first', 'copy first'] as const)(
    'admits only the first of a 7 MiB import and a 3 MiB copy: %s',
    async (order) => {
      const records = await recordsOf(7 * MIB);
      const store = createByteStore({ data: 'x'.repeat(15 * MIB) });
      const budget = budgetOver(store);
      // Signals once a writer's budget step has begun, before its check or write.
      let entered!: () => void;
      const inside = new Promise<void>((resolve) => (entered = resolve));
      const service = new HighlightAnnotationService({
        storage: adapter(store),
        budget: { runChecked: (step) => budget.runChecked((r) => (entered(), step(r))) },
        randomUUID: nextUuid,
      });
      const copyValue = 'c'.repeat(3 * MIB);
      const runImport = () =>
        service.importMerge(SCOPE, records).then(
          () => true,
          () => false,
        );
      const runCopy = () =>
        budget
          .run({ kind: 'copy', keys: ['copy'], bytes: itemBytes('copy', copyValue) }, () => {
            entered();
            return store.area.set({ copy: copyValue });
          })
          .then((result) => result.admitted);

      // The second writer arrives while the first is inside its step.
      const first = order === 'import first' ? runImport() : runCopy();
      await inside;
      const second = order === 'import first' ? runCopy() : runImport();
      const [imported, copied] =
        order === 'import first' ? [await first, await second] : [await second, await first];

      expect([imported, copied]).toEqual(order === 'import first' ? [true, false] : [false, true]);
      expect(store.used()).toBeLessThanOrEqual(22.5 * MIB);
      await expect(service.add(SCOPE, highlight(99, 1, 'a small passage'))).resolves.toMatchObject({
        duplicate: false,
      });
    },
    60_000,
  );

  it('counts the standing reservations as used, but still lets a commit shrink storage', async () => {
    const store = createByteStore({ data: 'x'.repeat(20 * MIB) });
    const budget = budgetOver(store);
    const service = new HighlightAnnotationService({ storage: adapter(store), budget });
    const { record } = await service.add(SCOPE, highlight(1, 1, 'a small passage'));
    budget.setReservations(() => 3 * MIB);

    await expect(service.add(SCOPE, highlight(2, 2, 'another passage'))).rejects.toMatchObject({
      code: 'SOFT_CAP_REACHED',
    });
    await expect(
      service.remove(SCOPE, record.conversationId, record.id, { tombstone: false }),
    ).resolves.toBeDefined();
  });
});
