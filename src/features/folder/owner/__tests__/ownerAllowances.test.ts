import { describe, expect, it } from 'vitest';

import {
  HighlightAnnotationService,
  type HighlightStorageAdapter,
} from '@/core/services/HighlightAnnotationService';
import { createHighlightSourceTextHash } from '@/core/services/highlightAnnotationData';
import { StorageKeys } from '@/core/types/common';
import type { HighlightAccountScope } from '@/core/types/highlight';
import { type ByteStore, createByteStore, itemBytes } from '@/features/storage/__tests__/byteStore';
import { createStorageBudget } from '@/features/storage/storageBudget';

import type { FolderAuthority } from '../authority';
import type { FolderSite } from '../folderOwnerPolicy';
import { type FolderOwnerStorageArea, OWNER_INDEX_KEY, ownerMetaKey } from '../folderOwnerState';
import { ALLOWANCE_BYTES, createAllowanceLedger } from '../ownerAllowances';
import { createFaultyStorage } from './faultyStorage';
import { ALL_OWNER, KEY, TestClient, createWorld, folder, folderData } from './ownerHarness';

const MIB = 1024 * 1024;
const ALL_LEGACY: Readonly<Record<FolderSite, FolderAuthority>> = {
  gemini: 'legacy',
  aistudio: 'legacy',
  chatgpt: 'legacy',
};

/** Index and meta an owner build leaves behind with two registered tabs, as after a rollback. */
async function ownerLeftovers(key = KEY): Promise<Record<string, unknown>> {
  const storage = createFaultyStorage({ [key]: folderData([folder('F', 'A')]) });
  const world = createWorld(storage);
  await new TestClient(world, 'tab-1', key).open(world.process());
  await new TestClient(world, 'tab-2', key).open(world.process());
  return {
    [OWNER_INDEX_KEY]: storage.read(OWNER_INDEX_KEY),
    [ownerMetaKey(key)]: storage.read(ownerMetaKey(key)),
  };
}

function counted(store: ByteStore) {
  const reads = { count: 0 };
  const area: FolderOwnerStorageArea = {
    get: (keys) => (reads.count++, store.area.get(keys)),
    getAll: () => (reads.count++, store.area.get(null)),
    set: (items) => store.area.set(items),
    remove: (keys) => store.area.remove(keys),
  };
  return { area, reads };
}

const SCOPE: HighlightAccountScope = {
  platform: 'gemini',
  accountKey: 'email:user@example.com',
  accountId: 1,
  routeUserId: '0',
};

const highlight = (turn: number) => ({
  conversationId: 'gemini:conv:c1',
  conversationUrl: 'https://gemini.google.com/app/c1',
  conversationTitle: 'Notes',
  turnId: `u-turn-${turn}`,
  role: 'assistant' as const,
  anchor: {
    quote: { exact: 'a highlighted passage', prefix: 'Before ', suffix: ' after' },
    position: { start: 0, end: 21 },
    sourceTextHash: createHighlightSourceTextHash('response source'),
  },
  note: '',
  color: 'yellow' as const,
});

function highlightsOver(
  store: ByteStore,
  authority: Readonly<Record<FolderSite, FolderAuthority>>,
) {
  const budget = createStorageBudget({
    measure: async () => Promise.reject(new Error('highlights decide by their own check')),
    quota: async () => null,
    barrier: () => store.area.get('barrier'),
  });
  const ledger = createAllowanceLedger(counted(store).area, authority);
  budget.setReservations(() => ledger.reservedBytes());
  const storage: HighlightStorageAdapter = {
    get: (keys) => store.area.get(keys),
    set: (items) => store.area.set(items),
    remove: (keys) => store.area.remove(keys),
    getBytesInUse: (keys) => store.area.getBytesInUse(keys),
    getEffectiveQuotaBytes: async () => null,
  };
  return new HighlightAnnotationService({ storage, budget });
}

/** How many bytes one highlight add grows storage by, measured on a scratch store. */
async function addGrowth(leftovers: Record<string, unknown>): Promise<number> {
  const scratch = createByteStore(leftovers);
  const before = scratch.used();
  await highlightsOver(scratch, ALL_LEGACY).add(SCOPE, highlight(1));
  return scratch.used() - before;
}

describe('pending allowances (addendum P3P4 R3.2)', () => {
  it('reserves 16 KiB per registered client, rebuilt from meta after a restart', async () => {
    const store = createByteStore(await ownerLeftovers());
    const restarted = createAllowanceLedger(counted(store).area, ALL_OWNER);

    expect(await restarted.reservedBytes()).toBe(2 * ALLOWANCE_BYTES);
  });

  it('never counts the clients of a site this build leaves legacy', async () => {
    const gemini = await ownerLeftovers();
    const chatgpt = await ownerLeftovers(StorageKeys.FOLDER_DATA_CHATGPT);
    const store = createByteStore({
      ...gemini,
      ...chatgpt,
      [OWNER_INDEX_KEY]: [KEY, StorageKeys.FOLDER_DATA_CHATGPT],
    });
    const ledger = createAllowanceLedger(counted(store).area, { ...ALL_OWNER, chatgpt: 'legacy' });

    expect(await ledger.reservedBytes()).toBe(2 * ALLOWANCE_BYTES);
  });

  it('counts a client from the commit that registers it', async () => {
    const storage = createFaultyStorage({ [KEY]: folderData([folder('F', 'A')]) });
    const ledger = createAllowanceLedger(storage.area, ALL_OWNER);
    expect(await ledger.reservedBytes()).toBe(0);
    const world = createWorld(storage, undefined, ALL_OWNER, { allowances: ledger });

    await new TestClient(world, 'tab-1').open(world.process());

    expect(await ledger.reservedBytes()).toBe(ALLOWANCE_BYTES);
  });

  it('reserves nothing and reads nothing while every site is legacy, even over owner leftovers', async () => {
    const store = createByteStore(await ownerLeftovers());
    const { area, reads } = counted(store);

    expect(await createAllowanceLedger(area, ALL_LEGACY).reservedBytes()).toBe(0);
    expect(reads.count).toBe(0);
  });

  it('leaves a highlight add near the soft cap as it is today while every site is legacy', async () => {
    const leftovers = await ownerLeftovers();
    const growth = await addGrowth(leftovers);
    // 16 KiB under the highlights' usable 22.5 MiB once the add lands.
    const fill = 22.5 * MIB - ALLOWANCE_BYTES - growth - createByteStore(leftovers).used();
    const nearCap = { ...leftovers, data: 'x'.repeat(fill - itemBytes('data', '')) };

    const legacy = highlightsOver(createByteStore(nearCap), ALL_LEGACY);
    await expect(legacy.add(SCOPE, highlight(1))).resolves.toBeDefined();

    // The same add counts both tabs' 32 KiB once their site is owned.
    const owned = highlightsOver(createByteStore(nearCap), ALL_OWNER);
    await expect(owned.add(SCOPE, highlight(1))).rejects.toMatchObject({
      code: 'SOFT_CAP_REACHED',
    });
  });
});
