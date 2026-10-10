import { describe, expect, it, vi } from 'vitest';

import { StorageQuotaService } from '@/core/services/StorageQuotaService';
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { hashValue } from '@/core/utils/canonicalHash';
import { createPromptLibraryOwner } from '@/features/prompt/library/promptLibraryOwner';
import { createByteStore, itemBytes } from '@/features/storage/__tests__/byteStore';
import { createStorageBudget } from '@/features/storage/storageBudget';
import { createWriteQueue } from '@/features/storage/writeQueue';

import { BUNDLE_INTENT_KEY, writeBundle } from '../bundleIntent';
import { BUNDLE_RETRY_MS, createBundleRecovery } from '../bundleRecovery';
import { FolderClient } from '../client/folderClient';
import { createFolderOwnerCore } from '../folderOwnerCore';
import type { FolderOwnerRequest } from '../folderOwnerMessages';
import { FOLDER_SITE_POLICIES } from '../folderOwnerPolicy';
import { dispatchFolderOwnerRequest } from '../folderOwnerRequests';
import {
  type FolderOwnerMeta,
  ownerBackupKey,
  ownerMetaKey,
  pendingOpKey,
} from '../folderOwnerState';
import { ALLOWANCE_BYTES, createAllowanceLedger } from '../ownerAllowances';
import { writePreBulk } from '../ownerBackups';
import { budgetedCopy } from '../ownerBudget';
import { ALL_OWNER, KEY, folder, folderData } from './ownerHarness';

const KIB = 1024;
const MIB = 1024 * KIB;
const QUOTA = 5 * MIB;
const PROMPTS = StorageKeys.PROMPT_ITEMS;
const OTHER = StorageKeys.FOLDER_DATA_CHATGPT;

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};

/** The complete stored K, including its JSON and key, occupies `bytes`. */
function dataOf(bytes: number): FolderData {
  const data = folderData([folder('F', 'Work', { instructions: '' })]);
  data.folders[0].instructions = 'x'.repeat(bytes - itemBytes(KEY, data));
  return data;
}

const promptsOf = (bytes: number) => ['p'.repeat(bytes - itemBytes(PROMPTS, ['']))];

async function quotaWorld(perKey: boolean, initialBytes: number) {
  const prev = dataOf(MIB / 2);
  const store = createByteStore(
    { [KEY]: prev, [PROMPTS]: promptsOf(MIB / 2), [OTHER]: folderData([]) },
    { quota: QUOTA, perKey },
  );
  const ledger = createAllowanceLedger(store.area, ALL_OWNER);
  const queue = createWriteQueue();
  const budget = createStorageBudget({
    measure: async (keys) => ({
      bytesInUse: await store.area.getBytesInUse(null),
      keyBytes: await store.area.getBytesInUse(keys),
      limitBytes: QUOTA,
      quotaBytes: QUOTA,
    }),
    quota: async () => QUOTA,
    barrier: () => store.area.get('barrier'),
    reserved: () => ledger.reservedBytes(),
  });
  const owner = createFolderOwnerCore({
    area: store.area,
    authority: ALL_OWNER,
    budget,
    allowances: ledger,
    serialize: queue,
    now: () => 1_000_000,
    newId: () => 'owner-epoch',
  });
  await owner.open({ key: KEY, clientId: 'bulk', ackedThrough: 0 });
  const applying = deferred();
  const client = new FolderClient({
    key: OTHER,
    policy: FOLDER_SITE_POLICIES.chatgpt,
    area: store.area,
    subscribe: store.subscribe,
    send: async (request: FolderOwnerRequest) => {
      if (request.type === 'gv.folderOwner.apply') await applying.promise;
      return dispatchFolderOwnerRequest(request, owner);
    },
    now: () => 1_000_000,
    monotonic: () => 0,
    newId: () => 'outsider',
  });
  await client.open();
  await store.area.set({
    filler: 'f'.repeat(initialBytes - store.used() - itemBytes('filler', '')),
  });
  const meta = store.read(ownerMetaKey(KEY)) as FolderOwnerMeta;
  await writePreBulk(
    budgetedCopy(budget, store.area),
    KEY,
    { kind: 'ready', data: prev, hash: meta.dataHash, meta },
    1_000_000,
  );
  const next = dataOf(0.75 * MIB);
  const nextMeta: FolderOwnerMeta = {
    ...meta,
    rev: meta.rev + 1,
    dataHash: await hashValue(next),
    clients: {
      ...meta.clients,
      bulk: {
        ...meta.clients.bulk,
        applied: 1,
        outcomes: { 1: { kind: 'bundle_pending', txId: 'tx' } },
      },
    },
  };
  return {
    store,
    ledger,
    budget,
    queue,
    owner,
    client,
    applying,
    prev,
    next,
    request: {
      txId: 'tx',
      site: 'gemini' as const,
      seq: 1,
      clientId: 'bulk',
      at: 1_000_000,
      values: {
        [KEY]: next,
        [PROMPTS]: promptsOf(0.75 * MIB),
        [ownerMetaKey(KEY)]: nextMeta,
      } as Record<string, unknown>,
    },
  };
}

describe('T23a: a Safari bundle and real pending publishers share the hard byte quota', () => {
  it.each([false, true])(
    'refuses the exact reviewer boundary with allowance and envelope overhead (per-key: %s)',
    async (perKey) => {
      const w = await quotaWorld(perKey, 2 * MIB);
      try {
        expect(w.store.used()).toBeGreaterThan(2.5 * MIB);
        expect(await w.ledger.reservedBytes()).toBe(2 * ALLOWANCE_BYTES);
        expect(await writeBundle(w.store.area, w.request, w.budget)).toEqual({
          kind: 'refused',
          reason: 'quota',
        });
        expect(w.store.has(BUNDLE_INTENT_KEY)).toBe(false);
        expect(w.store.read(KEY)).toEqual(w.prev);
        expect(w.store.read(PROMPTS)).toEqual(promptsOf(MIB / 2));
        expect((w.store.read(ownerMetaKey(KEY)) as FolderOwnerMeta).clients.bulk.applied).toBe(0);
        expect(w.store.read(ownerBackupKey(KEY, 'preBulk'))).toMatchObject({ value: w.prev });
      } finally {
        w.client.dispose();
      }
    },
  );

  it.each([false, true])(
    'keeps the 0.75 MiB burst past 16 KiB pending while an admitted bundle commits all-next (per-key: %s)',
    async (perKey) => {
      // The review's 2+.5+1.5+.5+M(.5)=5 leaves no allowance or JSON overhead.
      // Keep its payload sizes, with 128 KiB of explicit headroom for those costs.
      const w = await quotaWorld(perKey, 2 * MIB - 128 * KIB);
      const valuesReached = deferred();
      const sendValues = deferred();
      const peaks: number[] = [w.store.used()];
      const unsubscribe = w.store.subscribe(() => peaks.push(w.store.used()));
      w.store.onBeforeSet((values) => {
        if (KEY in values && PROMPTS in values) {
          valuesReached.resolve();
          return sendValues.promise;
        }
      });
      const bundle = writeBundle(w.store.area, w.request, w.budget);
      try {
        await valuesReached.promise;
        expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
        const name = 'n'.repeat(Math.floor(ALLOWANCE_BYTES / 3));
        const count = Math.ceil((0.75 * MIB) / name.length);
        const outcomes = Array.from({ length: count }, (_, n) =>
          w.client.run({ kind: 'createFolder', folderId: `N${n}`, name, parentId: null }),
        );
        await vi.waitFor(() => expect(w.client.status()).toBe('delayed'));
        const all = await w.store.area.get(null);
        const pending = Object.entries(all).filter(([key]) =>
          key.startsWith('gvFolderOwner:pending:outsider:'),
        );
        const pendingBytes = pending.reduce((sum, [key, value]) => sum + itemBytes(key, value), 0);
        expect(pending.length).toBeGreaterThan(0);
        expect(pendingBytes).toBeLessThanOrEqual(ALLOWANCE_BYTES);
        expect(pending.length).toBeLessThan(count);
        expect(w.client.view().folders).toHaveLength(count);

        sendValues.resolve();
        expect(await bundle).toEqual({ kind: 'saved' });
        expect(w.store.read(KEY)).toEqual(w.next);
        expect(w.store.read(PROMPTS)).toEqual(w.request.values[PROMPTS]);
        expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' });
        expect(
          (w.store.read(ownerMetaKey(KEY)) as FolderOwnerMeta).clients.bulk.outcomes[1],
        ).toEqual({ kind: 'saved' });

        w.applying.resolve();
        expect((await Promise.all(outcomes)).every((outcome) => outcome.kind === 'saved')).toBe(
          true,
        );
        await w.client.flush();
        expect((w.store.read(OTHER) as FolderData).folders).toHaveLength(count);
        expect(
          (w.store.read(ownerMetaKey(OTHER)) as FolderOwnerMeta).clients.outsider.applied,
        ).toBe(count);
        expect(Math.max(...peaks, w.store.used())).toBeLessThanOrEqual(QUOTA);
      } finally {
        sendValues.resolve();
        w.applying.resolve();
        w.client.dispose();
        unsubscribe();
        w.store.onBeforeSet(null);
      }
    },
    60_000,
  );
});

describe('T23d: release and retry an open bundle without deleting protected data', () => {
  it.each([
    { retry: 'storage event', companion: PROMPTS },
    { retry: '60-second fallback', companion: PROMPTS },
    { retry: 'storage event', companion: StorageKeys.TIMELINE_HIERARCHY },
  ])(
    'finishes after real cache cleanup through $retry (companion: $companion)',
    async ({ retry, companion }) => {
      vi.useFakeTimers();
      const w = await quotaWorld(true, 2 * MIB - 128 * KIB);
      if (companion !== PROMPTS) {
        await w.store.area.set({ [companion]: promptsOf(MIB / 2) });
        const filler = w.store.read('filler') as string;
        await w.store.area.set({ filler: filler.slice(itemBytes(companion, promptsOf(MIB / 2))) });
        w.request.values[companion] = w.request.values[PROMPTS];
        delete w.request.values[PROMPTS];
      }
      await w.owner.open({ key: OTHER, clientId: 'independent', ackedThrough: 0 });
      // A core with its own queue must enforce the same footprint without a background prelude.
      const direct = createFolderOwnerCore({
        area: w.store.area,
        authority: ALL_OWNER,
        budget: w.budget,
        allowances: w.ledger,
      });
      const drainKey = `${KEY}:acct:1`;
      await direct.open({ key: drainKey, clientId: 'drainer', ackedThrough: 0 });
      const drainMeta = w.store.read(ownerMetaKey(drainKey)) as FolderOwnerMeta;
      const drainPending = pendingOpKey('drainer', 1);
      await w.store.area.set({
        [drainPending]: {
          v: 1,
          key: drainKey,
          epoch: drainMeta.epoch,
          clientId: 'drainer',
          seq: 1,
          at: 1_000_000,
          op: { kind: 'createFolder', folderId: 'drained', name: 'Drain', parentId: null },
        },
      });
      const otherMeta = w.store.read(ownerMetaKey(OTHER)) as FolderOwnerMeta;
      const copy = dataOf(8 * KIB);
      const copyHash = await hashValue(copy);
      const meta = w.store.read(ownerMetaKey(KEY)) as FolderOwnerMeta;
      const backups: FolderOwnerMeta['backups'] = {
        last: { slot: 'a', hash: copyHash, savedAt: 0 },
        prior: { slot: 'b', hash: copyHash, savedAt: 0 },
      };
      const above = pendingOpKey('outsider', 1);
      const protectedItems = {
        [ownerBackupKey(KEY, 'preBulk')]: w.store.read(ownerBackupKey(KEY, 'preBulk')),
        [ownerBackupKey(KEY, 'foreign')]: { value: copy, reason: 'foreign' },
        [ownerBackupKey(KEY, 'quarantine')]: { value: copy, reason: 'quarantine' },
        [above]: {
          v: 1,
          key: OTHER,
          epoch: otherMeta.epoch,
          clientId: 'outsider',
          seq: 1,
          at: 1_000_000,
          op: { kind: 'createFolder', folderId: 'pending', name: 'Keep', parentId: null },
        },
      };
      const last = ownerBackupKey(KEY, 'a');
      const prior = ownerBackupKey(KEY, 'b');
      await w.store.area.set({
        [ownerMetaKey(KEY)]: { ...meta, backups },
        [last]: { value: copy, reason: 'rotation' },
        [prior]: { value: copy, reason: 'rotation' },
        ...protectedItems,
      });
      w.request.values[ownerMetaKey(KEY)] = {
        ...(w.request.values[ownerMetaKey(KEY)] as FolderOwnerMeta),
        backups,
      };
      const recovery = createBundleRecovery({
        area: w.store.area,
        authority: ALL_OWNER,
        serialize: w.queue,
        setTimer: (run, ms) => {
          const timer = setTimeout(run, ms);
          return () => clearTimeout(timer);
        },
        subscribe: (listener) =>
          w.store.subscribe((changes) => {
            if (retry === 'storage event') listener(changes, 'local');
          }),
      });
      w.queue.setPrelude(recovery.prelude);
      const cache = StorageKeys.GV_GEMS_LIST_CACHE;
      let filled = 0;
      const fillTo = async (target: number) => {
        const old = w.store.read(cache);
        const replaced = old === undefined ? 0 : itemBytes(cache, old);
        const bytes = target - w.store.used() + replaced;
        await w.store.area.set({ [cache]: 'c'.repeat(bytes - itemBytes(cache, '')) });
      };
      w.store.onBeforeSet(async (values) => {
        if (KEY in values && companion in values && filled === 0) {
          filled = 1;
          // An outside-budget writer consumes M: K's +.25 MiB fits, the prompts' does not.
          await fillTo(QUOTA - MIB / 4 - 512);
        } else if (companion in values && !(KEY in values) && filled === 1) {
          filled = 2;
          // It also takes the room from dropping K's landed intent copy.
          // The small last/prior copies cannot free the remaining .25 MiB growth.
          await fillTo(QUOTA - 96 * KIB);
        }
      });
      const peaks: number[] = [w.store.used()];
      const unsubscribe = w.store.subscribe(() => peaks.push(w.store.used()));
      recovery.start();
      try {
        expect(
          await w.queue(
            () => writeBundle(w.store.area, w.request, w.budget),
            Object.keys(w.request.values),
          ),
        ).toEqual({ kind: 'pending' });
        const unrelated = await w.owner.apply({
          key: OTHER,
          clientId: 'independent',
          epoch: otherMeta.epoch,
          ackedThrough: 0,
          ops: [
            {
              seq: 1,
              body: {
                kind: 'createFolder',
                folderId: 'independent',
                name: 'Saved',
                parentId: null,
              },
            },
          ],
        });
        expect(unrelated).toMatchObject({ kind: 'ok', outcomes: { 1: { kind: 'saved' } } });
        expect((w.store.read(OTHER) as FolderData).folders.map((f) => f.id)).toEqual([
          'independent',
        ]);
        await vi.waitFor(() => {
          expect(w.store.has(last)).toBe(false);
          expect(w.store.has(prior)).toBe(false);
        });
        expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
        expect(w.store.read(KEY)).toEqual(w.next);
        expect(w.store.read(companion)).toEqual(promptsOf(MIB / 2));
        expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({
          values: { [companion]: w.request.values[companion] },
        });
        expect(
          (w.store.read(BUNDLE_INTENT_KEY) as { values: Record<string, unknown> }).values[KEY],
        ).toBeUndefined();
        for (const [key, value] of Object.entries(protectedItems))
          expect(w.store.read(key)).toEqual(value);

        await expect(w.owner.snapshot({ key: KEY, clientId: 'bulk' })).rejects.toThrow(
          'Folder bundle resolution: write_failed',
        );
        expect(await direct.snapshot({ key: KEY, clientId: 'bulk' })).toMatchObject({
          kind: 'refused',
          reason: 'write_failed',
        });
        await direct.drain(KEY);
        expect(
          (w.store.read(ownerMetaKey(KEY)) as FolderOwnerMeta).clients.bulk.outcomes[1],
        ).toEqual({ kind: 'bundle_pending', txId: 'tx' });
        await direct.drain(drainKey);
        expect((w.store.read(drainKey) as FolderData).folders.map((f) => f.id)).toEqual([
          'drained',
        ]);
        expect(
          (w.store.read(ownerMetaKey(drainKey)) as FolderOwnerMeta).clients.drainer.applied,
        ).toBe(1);
        expect(w.store.has(drainPending)).toBe(false);
        expect(
          await direct.apply({
            key: drainKey,
            clientId: 'drainer',
            epoch: drainMeta.epoch,
            ackedThrough: 1,
            ops: [{ seq: 2, body: { kind: 'renameFolder', folderId: 'drained', name: 'Updated' } }],
          }),
        ).toMatchObject({ kind: 'ok', outcomes: { 2: { kind: 'saved' } } });
        expect((w.store.read(drainKey) as FolderData).folders[0].name).toBe('Updated');

        const promptOwner = createPromptLibraryOwner({ area: w.store.area, serialize: w.queue });
        const prompt = {
          id: 'during-bundle',
          text: 'Unrelated prompt edit',
          tags: [],
          createdAt: 1,
        };
        if (companion === PROMPTS) {
          await expect(promptOwner.read()).rejects.toThrow(
            'Folder bundle resolution: write_failed',
          );
          await expect(promptOwner.apply({ kind: 'add', items: [prompt] })).rejects.toThrow(
            'Folder bundle resolution: write_failed',
          );
        } else {
          expect(await promptOwner.read()).toEqual(promptsOf(MIB / 2));
          expect(await promptOwner.apply({ kind: 'add', items: [prompt] })).toMatchObject({
            added: 1,
          });
          expect((w.store.read(PROMPTS) as unknown[])[0]).toEqual(prompt);
        }

        const quota = new StorageQuotaService({
          chromeApi: {
            storage: {
              local: {
                get: (keys) => w.store.area.get(keys as string | readonly string[] | null),
                remove: (keys) => w.store.area.remove(keys as string | readonly string[]),
                getBytesInUse: (keys) =>
                  w.store.area.getBytesInUse(keys as string | readonly string[] | null),
                QUOTA_BYTES: QUOTA,
              },
              sync: { get: async () => ({}), getBytesInUse: async () => 0 },
            },
            permissions: { contains: async () => false },
            runtime: { getManifest: () => ({ optional_permissions: ['unlimitedStorage'] }) },
          },
          buildTarget: () => 'safari',
          safariMajorVersion: () => 17,
          legacySafariStorageLimit: () => false,
        });
        expect((await quota.clearCategory('cache')).removedKeys).toEqual([cache]);
        if (retry === '60-second fallback') {
          expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
          await vi.advanceTimersByTimeAsync(BUNDLE_RETRY_MS);
        }
        await vi.waitFor(() =>
          expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' }),
        );
        expect(w.store.read(companion)).toEqual(w.request.values[companion]);
        if (companion !== PROMPTS) expect((w.store.read(PROMPTS) as unknown[])[0]).toEqual(prompt);
        expect(
          (w.store.read(ownerMetaKey(KEY)) as FolderOwnerMeta).clients.bulk.outcomes[1],
        ).toEqual({ kind: 'saved' });
        for (const [key, value] of Object.entries(protectedItems))
          expect(w.store.read(key)).toEqual(value);
        expect(Math.max(...peaks, w.store.used())).toBeLessThanOrEqual(QUOTA);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        recovery.stop();
        w.client.dispose();
        unsubscribe();
        w.store.onBeforeSet(null);
        vi.useRealTimers();
      }
    },
  );
});
