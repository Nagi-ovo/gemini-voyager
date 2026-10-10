import { describe, expect, it } from 'vitest';

import { hashValue } from '@/core/utils/canonicalHash';
import { type ByteStore, createByteStore } from '@/features/storage/__tests__/byteStore';
import { createStorageBudget } from '@/features/storage/storageBudget';

import {
  BUNDLE_INTENT_KEY,
  type BundleRequest,
  type OpenBundle,
  resolveBundleIntent,
  writeBundle,
} from '../bundleIntent';
import { INTERRUPTED, type StoredOutcome } from '../folderOps';
import {
  type FolderOwnerMeta,
  OWNER_INDEX_KEY,
  ownerBackupKey,
  ownerIntentKey,
  ownerMetaKey,
  pendingOpKey,
} from '../folderOwnerState';
import { createAllowanceLedger } from '../ownerAllowances';
import { type Fault, createFaultyStorage } from './faultyStorage';
import {
  ALL_OWNER,
  KEY,
  TestClient,
  createWorld,
  folder,
  folderData,
  rename,
  storedData,
  storedMeta,
} from './ownerHarness';

const META = ownerMetaKey(KEY);
const PROMPTS = 'gvPromptItems';
const KIB = 1024;
const MIB = 1024 * KIB;
const pending = (txId: string): StoredOutcome => ({ kind: 'bundle_pending', txId });

/** A meta whose client `tab` has seq 3 inside bundle `txId`. */
const metaWith = (outcome: StoredOutcome, rev = 5): FolderOwnerMeta => ({
  v: 1,
  epoch: 'e',
  rev,
  dataHash: 'h',
  clients: { tab: { applied: 3, acked: 2, outcomes: { 3: outcome }, lastSeenAt: 0 } },
  retired: {},
});

function request(values: Record<string, unknown>, txId = 'tx'): BundleRequest {
  return { txId, site: 'gemini', seq: 3, clientId: 'tab', values, at: 7 };
}

const outcomeOf = (meta: unknown, seq = 3): unknown =>
  (meta as FolderOwnerMeta | undefined)?.clients.tab.outcomes[seq];

describe('bundle writes (addendum P3P4 R3, R4)', () => {
  it('T11: a bundle cut at any storage call ends all prev, or all next with a saved outcome', async () => {
    const prev = { k1: 'k1-prev', k2: 'k2-prev', [META]: metaWith({ kind: 'saved' }, 4) };
    const next = { k1: 'k1-next', k2: 'k2-next', [META]: metaWith(pending('tx')) };
    const keys = Object.keys(next);
    // get, set intent, set values, get, set flip, set close.
    const cuts: Fault[] = [
      { call: 1, land: 'none', crash: true },
      { call: 2, land: 'none', crash: true },
      { call: 2, land: 'all', crash: true },
      ...keys.map((_, n) => ({ call: 3, land: keys.slice(0, n), crash: true })),
      { call: 3, land: [META], crash: true },
      { call: 3, land: 'all', crash: true },
      { call: 4, land: 'none', crash: true },
      { call: 5, land: 'none', crash: true },
      { call: 5, land: 'all', crash: true },
      { call: 6, land: 'none', crash: true },
    ];

    for (const cut of cuts) {
      const label = JSON.stringify(cut);
      const storage = createFaultyStorage(prev);
      storage.inject(cut);
      await writeBundle(storage.area, request(next)).catch(() => undefined);
      storage.restart();

      expect(await resolveBundleIntent(storage.area, ALL_OWNER), label).toBe('ok');

      const landed = cut.call > 2 || cut.land === 'all';
      const expected = landed ? next : prev;
      expect(storage.read('k1'), label).toBe(expected.k1);
      expect(storage.read('k2'), label).toBe(expected.k2);
      expect(outcomeOf(storage.read(META)), label).toEqual({ kind: 'saved' });
      expect((storage.read(META) as FolderOwnerMeta).rev, label).toBe(landed ? 6 : 4);
      const intent = storage.read(BUNDLE_INTENT_KEY) as { status: string } | undefined;
      expect(intent?.status, label).toBe(landed ? 'closed' : undefined);
    }
  });

  it.each([
    OWNER_INDEX_KEY,
    ownerIntentKey(KEY),
    pendingOpKey('tab', 4),
    ownerBackupKey(KEY, 'last'),
    BUNDLE_INTENT_KEY,
    ownerMetaKey('not-a-folder-key'),
  ])('refuses a bundle over %s, which owner turns read without declaring it', async (sidecar) => {
    const storage = createFaultyStorage({ [META]: metaWith({ kind: 'saved' }, 4) });
    const before = storage.snapshot();

    await expect(
      writeBundle(storage.area, request({ [META]: metaWith(pending('tx')), [sidecar]: 'x' })),
    ).rejects.toThrow('Not a bundle participant');

    expect(storage.calls()).toBe(0);
    expect(storage.snapshot()).toEqual(before);
  });

  it('keeps an earlier open bundle’s unlanded values when a disjoint bundle is written', async () => {
    const other = 'gvFolderDataChatGPT';
    const earlier: OpenBundle = {
      v: 1,
      txId: 'earlier',
      status: 'open',
      site: 'gemini',
      seq: 2,
      clientId: 'tab',
      at: 1,
      keys: {
        [PROMPTS]: { prevHash: await hashValue(['prompt']), nextHash: await hashValue(['merged']) },
      },
      values: { [PROMPTS]: ['merged'] },
    };
    const storage = createFaultyStorage({ [PROMPTS]: ['prompt'], [BUNDLE_INTENT_KEY]: earlier });
    const before = storage.snapshot();

    expect(
      await writeBundle(storage.area, {
        ...request({ [other]: folderData([]), [ownerMetaKey(other)]: metaWith(pending('tx')) }),
        site: 'chatgpt',
      }),
    ).toEqual({ kind: 'refused', reason: 'write_failed' });

    expect(storage.snapshot()).toEqual(before);
    expect(await resolveBundleIntent(storage.area, ALL_OWNER)).toBe('ok');
    expect(storage.read(PROMPTS)).toEqual(['merged']);
  });

  it.each([{ laterPrompts: ['prompt'] }, { laterPrompts: ['later user edit'] }])(
    'closes after a durable saved flip without replaying a later companion write: %j',
    async ({ laterPrompts }) => {
      const prev = { [PROMPTS]: ['prompt'], [META]: metaWith({ kind: 'saved' }, 4) };
      const next = { [PROMPTS]: ['merged prompt'], [META]: metaWith(pending('tx')) };
      const storage = createFaultyStorage(prev);
      // The saved flip lands, then the worker dies before closing the intent.
      storage.inject({ call: 5, land: 'all', crash: true });
      expect(await writeBundle(storage.area, request(next))).toEqual({ kind: 'pending' });
      expect(storage.read(PROMPTS)).toEqual(next[PROMPTS]);
      expect(outcomeOf(storage.read(META))).toEqual({ kind: 'saved' });
      expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
      storage.restart();
      storage.write(PROMPTS, laterPrompts);
      const writes: string[][] = [];
      storage.onCall((_call, op, keys) => {
        if (op === 'set') writes.push(keys);
      });

      expect(await resolveBundleIntent(storage.area, ALL_OWNER)).toBe('ok');

      expect(storage.read(PROMPTS)).toEqual(laterPrompts);
      expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ txId: 'tx', status: 'closed' });
      expect(outcomeOf(storage.read(META))).toEqual({ kind: 'saved' });
      expect((storage.read(META) as FolderOwnerMeta).rev).toBe(6);
      expect(writes).toEqual([[BUNDLE_INTENT_KEY]]);
    },
  );

  it('aborts with nothing landed when the all-or-nothing value set fails on quota (R3.4)', async () => {
    const prev = { k1: 'a'.repeat(10 * KIB), [META]: metaWith({ kind: 'saved' }, 4) };
    const next = { k1: 'b'.repeat(40 * KIB), [META]: metaWith(pending('tx')) };
    const store = createByteStore(prev, { quota: 70 * KIB });

    expect(await writeBundle(store.area, request(next))).toEqual({
      kind: 'refused',
      reason: 'quota',
    });

    expect(store.read('k1')).toEqual(prev.k1);
    expect(store.read(META)).toEqual(prev[META]);
    expect(store.read(BUNDLE_INTENT_KEY)).toMatchObject({ txId: 'tx', status: 'aborted' });
  });

  it('rolls a partial landing forward shrink-first and stays under the quota (R3.5, T23c)', async () => {
    const prev = { k1: 'a'.repeat(10 * KIB), k2: 'a'.repeat(10 * KIB) };
    const next = { k1: 'b'.repeat(20 * KIB), k2: 'b'.repeat(20 * KIB) };
    const store = createByteStore(prev, { quota: 75 * KIB, perKey: true });
    const peaks: number[] = [];
    const area = { ...store.area, set: tracked(store, peaks) };

    expect(await writeBundle(area, request(next))).toEqual({ kind: 'saved' });

    expect([store.read('k1'), store.read('k2')]).toEqual([next.k1, next.k2]);
    expect(Math.max(...peaks)).toBeLessThanOrEqual(75 * KIB);
    expect(store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' });
  });

  it('rolls forward after a crash shrinking keys first, so growth fits the space they free', async () => {
    const prev = { k1: 'a'.repeat(30 * KIB), k2: 'a'.repeat(10 * KIB) };
    const next = { k2: 'b'.repeat(30 * KIB), k1: 'b'.repeat(5 * KIB) };
    const crashed = createFaultyStorage(prev);
    crashed.inject({ call: 3, land: 'none', crash: true });
    await writeBundle(crashed.area, request(next)).catch(() => undefined);
    const store = createByteStore(crashed.snapshot(), { quota: 80 * KIB, perKey: true });

    expect(await resolveBundleIntent(store.area, ALL_OWNER)).toBe('ok');

    expect([store.read('k1'), store.read('k2')]).toEqual([next.k1, next.k2]);
    expect(store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' });
  });

  it('admits a bundle only with M free under a hard quota, before any intent (R3.1)', async () => {
    const store = createByteStore({ data: 'x'.repeat(2 * MIB) }, { quota: 5 * MIB });
    const budget = createStorageBudget({
      measure: async (keys) => ({
        bytesInUse: await store.area.getBytesInUse(null),
        keyBytes: await store.area.getBytesInUse(keys),
        limitBytes: 5 * MIB,
        quotaBytes: 5 * MIB,
      }),
      quota: async () => 5 * MIB,
      barrier: async () => undefined,
    });
    // Intent plus values: 2.8 MiB, which fits under 5 MiB but not with M = 512 KiB on top.
    const tooBig = { k1: 'v'.repeat(1.4 * MIB) };
    const fits = { k1: 'v'.repeat(1 * MIB) };

    expect(await writeBundle(store.area, request(tooBig), budget)).toEqual({
      kind: 'refused',
      reason: 'quota',
    });
    expect(store.has(BUNDLE_INTENT_KEY)).toBe(false);
    expect(store.has('k1')).toBe(false);

    expect(await writeBundle(store.area, request(fits, 'tx2'), budget)).toEqual({
      kind: 'saved',
    });
    expect(store.used()).toBeLessThanOrEqual(5 * MIB);
  });

  it('T26c: after a restart, 100 registered clients make a Safari bundle refuse instead of stall', async () => {
    const storage = createFaultyStorage({ [KEY]: folderData([folder('F', 'A')]) });
    const world = createWorld(storage);
    await new TestClient(world, 'tab').open(world.process());
    const meta = storedMeta(storage);
    const crowd = Object.fromEntries(
      Array.from({ length: 100 }, (_, n) => [`tab-${n}`, meta.clients.tab]),
    );
    /** Storage as a restarted background finds it: 2 MiB used, meta naming `clients`. */
    const restarted = (clients: FolderOwnerMeta['clients']) => {
      const store = createByteStore(
        {
          data: 'x'.repeat(2 * MIB),
          [OWNER_INDEX_KEY]: [KEY],
          [META]: { ...meta, clients },
        },
        { quota: 5 * MIB },
      );
      const ledger = createAllowanceLedger(store.area, ALL_OWNER);
      const budget = createStorageBudget({
        measure: async (keys) => ({
          bytesInUse: await store.area.getBytesInUse(null),
          keyBytes: await store.area.getBytesInUse(keys),
          limitBytes: 5 * MIB,
          quotaBytes: 5 * MIB,
        }),
        quota: async () => 5 * MIB,
        barrier: async () => undefined,
        reserved: () => ledger.reservedBytes(),
      });
      return { store, budget };
    };
    // Intent plus values: about 2 MiB, so 2 + 2 + M fits 5 MiB only with nothing reserved.
    const values = { k1: 'v'.repeat(1 * MIB) };

    const quiet = restarted({});
    expect(await writeBundle(quiet.store.area, request(values), quiet.budget)).toEqual({
      kind: 'saved',
    });

    const crowded = restarted(crowd);
    expect(await writeBundle(crowded.store.area, request(values), crowded.budget)).toEqual({
      kind: 'refused',
      reason: 'quota',
    });
    expect(crowded.store.has(BUNDLE_INTENT_KEY)).toBe(false);
    expect(crowded.store.has('k1')).toBe(false);
  });

  it('a stale bundle_pending settles as interrupted when its intent was overwritten (R4.3)', async () => {
    const storage = createFaultyStorage({ [KEY]: folderData([folder('F', 'A')]) });
    const world = createWorld(storage);
    const tab = new TestClient(world, 'tab');
    await tab.open(world.process());
    const meta = storedMeta(storage);
    meta.clients.tab = { ...meta.clients.tab, applied: 1, outcomes: { 1: pending('tx1') } };
    storage.write(META, meta);
    // A later bundle's settled intent replaced tx1's.
    storage.write(BUNDLE_INTENT_KEY, { v: 1, txId: 'tx2', status: 'closed', at: 0 });
    tab.bodies.set(1, rename('F', 'B'));
    tab.nextSeq = 2;

    const reply = await tab.send(world.process(), [1]);

    expect(reply).toMatchObject({ kind: 'ok', outcomes: { 1: INTERRUPTED } });
    expect(storedMeta(storage).clients.tab.applied).toBe(1);
    expect(storedData(storage).folders[0].name).toBe('A');
  });
});

describe('T26f: an abandoned bundle never reads as saved (R4.2)', () => {
  it('answers a same-seq retry with interrupted after a companion write', async () => {
    const storage = createFaultyStorage({
      [KEY]: folderData([folder('F', 'A')]),
      [PROMPTS]: ['prompt'],
    });
    const world = createWorld(storage);
    const tab = new TestClient(world, 'tab');
    await tab.open(world.process());
    const nextK = folderData([folder('F', 'Merged')]);
    const meta = storedMeta(storage);
    const nextMeta: FolderOwnerMeta = {
      ...meta,
      rev: meta.rev + 1,
      dataHash: await hashValue(nextK),
      clients: {
        ...meta.clients,
        tab: { ...meta.clients.tab, applied: 1, outcomes: { 1: pending('tx') } },
      },
    };
    const values = { [KEY]: nextK, [META]: nextMeta, [PROMPTS]: ['merged prompt'] };
    // K and meta land in the value set; the prompts do not, and the process dies.
    storage.inject({ call: storage.calls() + 3, land: [KEY, META], crash: true });
    await writeBundle(storage.area, { ...request(values), seq: 1 }).catch(() => undefined);
    storage.restart();
    // A timeline write changes the companion key (allowed outside the queue).
    storage.write(PROMPTS, ['timeline edit']);
    await resolveBundleIntent(storage.area, ALL_OWNER);
    // The durable outcome is written before the abandon, by the resolution itself.
    expect(outcomeOf(storage.read(META), 1)).toEqual(INTERRUPTED);
    tab.bodies.set(1, { kind: 'cloudMerge' } as never);
    tab.nextSeq = 2;

    const reply = await tab.send(world.process(), [1]);

    expect(reply).toMatchObject({ kind: 'ok', outcomes: { 1: INTERRUPTED } });
    expect(storedMeta(storage).clients.tab.applied).toBe(1);
    expect(storage.read(PROMPTS)).toEqual(['timeline edit']);
    expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ txId: 'tx', status: 'abandoned' });
    // Nothing is re-applied on a later turn either.
    const again = await tab.send(world.process(), [1]);
    expect(again).toMatchObject({ kind: 'ok', outcomes: { 1: INTERRUPTED } });
  });
});

/** A `set` that records the store's usage after every call, landed or not. */
function tracked(store: ByteStore, peaks: number[]) {
  return async (items: Record<string, unknown>) => {
    try {
      await store.area.set(items);
    } finally {
      peaks.push(store.used());
    }
  };
}
