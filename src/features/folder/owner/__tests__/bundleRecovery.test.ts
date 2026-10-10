import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashValue } from '@/core/utils/canonicalHash';
import { createByteStore } from '@/features/storage/__tests__/byteStore';
import { createWriteQueue } from '@/features/storage/writeQueue';

import { BUNDLE_INTENT_KEY, type OpenBundle } from '../bundleIntent';
import { BUNDLE_RETRY_MS, createBundleRecovery } from '../bundleRecovery';
import { createBundleSpaceRelease } from '../bundleRelease';
import { createFolderOwnerCore } from '../folderOwnerCore';
import {
  type FolderOwnerMeta,
  ownerBackupKey,
  ownerIntentKey,
  ownerMetaKey,
  pendingOpKey,
} from '../folderOwnerState';
import { createFaultyStorage } from './faultyStorage';
import { ALL_OWNER, KEY, folder, folderData } from './ownerHarness';

const LEGACY_KEY = 'gvFolderDataAIStudio';
const GEMINI_OWNER = { ...ALL_OWNER, aistudio: 'legacy' as const };
const meta: FolderOwnerMeta = {
  v: 1,
  epoch: 'e',
  rev: 4,
  dataHash: 'absent',
  clients: { c: { applied: 2, acked: 0, outcomes: {}, lastSeenAt: 0 } },
  retired: { retired: { applied: 3, at: 0 } },
  backups: {
    last: { slot: 'b', hash: 'last', savedAt: 0 },
    prior: { slot: 'a', hash: 'prior', savedAt: 0 },
  },
};

const pending = (seq: number, overrides: Record<string, unknown> = {}) => ({
  v: 1,
  key: KEY,
  epoch: 'e',
  clientId: 'c',
  seq,
  at: 0,
  op: {},
  ...overrides,
});

function releaseWorld() {
  const initial = {
    [ownerMetaKey(KEY)]: meta,
    [ownerMetaKey(LEGACY_KEY)]: meta,
    [pendingOpKey('c', 1)]: pending(1),
    [pendingOpKey('c', 2)]: pending(2),
    [pendingOpKey('c', 3)]: pending(3),
    [pendingOpKey('retired', 3)]: pending(3, { clientId: 'retired' }),
    [pendingOpKey('wrong-epoch', 1)]: pending(1, { clientId: 'wrong-epoch', epoch: 'old' }),
    [pendingOpKey('legacy', 1)]: pending(1, { clientId: 'legacy', key: LEGACY_KEY }),
    [ownerBackupKey(KEY, 'b')]: { value: 'last' },
    [ownerBackupKey(KEY, 'a')]: { value: 'prior' },
    [ownerBackupKey(KEY, 'c')]: { value: 'unnamed' },
    [ownerBackupKey(LEGACY_KEY, 'b')]: { value: 'legacy' },
    ...Object.fromEntries(
      ['preBulk', 'foreign', 'quarantine'].map((slot) => [
        ownerBackupKey(KEY, slot as 'preBulk' | 'foreign' | 'quarantine'),
        { value: slot },
      ]),
    ),
  };
  const storage = createFaultyStorage(initial);
  const removals: string[][] = [];
  storage.onCall((_call, op, keys) => {
    if (op === 'remove') removals.push(keys);
  });
  return {
    storage,
    initial,
    removals,
    release: createBundleSpaceRelease(storage.area, GEMINI_OWNER, []),
  };
}

describe('open-bundle space release (R3.6)', () => {
  it.each([2.5, '2'])(
    'keeps pending ops when the stored watermark is not a usable integer (%s)',
    async (applied) => {
      const { storage, release } = releaseWorld();
      storage.write(ownerMetaKey(KEY), {
        ...meta,
        clients: { ...meta.clients, c: { ...meta.clients.c, applied } },
      });
      const before = storage.read(ownerMetaKey(KEY));

      await release();

      expect(storage.read(pendingOpKey('c', 1))).toEqual(pending(1));
      expect(storage.read(pendingOpKey('c', 2))).toEqual(pending(2));
      expect(storage.read(ownerMetaKey(KEY))).toEqual(before);
    },
  );

  it('removes only proven applied pending entries, then last, then prior, without changing meta', async () => {
    const { storage, initial, removals, release } = releaseWorld();
    // Add matching durable clients for the epoch and legacy exclusions to be meaningful.
    storage.write(ownerMetaKey(KEY), {
      ...meta,
      clients: { ...meta.clients, 'wrong-epoch': meta.clients.c, legacy: meta.clients.c },
    });
    const beforeMeta = storage.read(ownerMetaKey(KEY));
    expect(await release()).toBe(true);
    expect(removals[0]).toEqual([
      pendingOpKey('c', 1),
      pendingOpKey('c', 2),
      pendingOpKey('retired', 3),
    ]);
    expect(await release()).toBe(true);
    expect(removals[1]).toEqual([ownerBackupKey(KEY, 'b')]);
    expect(await release()).toBe(true);
    expect(removals[2]).toEqual([ownerBackupKey(KEY, 'a')]);
    expect(await release()).toBe(false);
    expect(storage.read(ownerMetaKey(KEY))).toEqual(beforeMeta);
    const removed = new Set(removals.flat());
    for (const [key, value] of Object.entries(initial)) {
      if (!removed.has(key) && key !== ownerMetaKey(KEY))
        expect(storage.read(key), key).toEqual(value);
    }
  });

  it('skips empty stages and never follows a forged rotation reference into preBulk', async () => {
    const { storage } = releaseWorld();
    await storage.area.remove([
      pendingOpKey('c', 1),
      pendingOpKey('c', 2),
      pendingOpKey('retired', 3),
    ]);
    storage.write(ownerMetaKey(KEY), {
      ...meta,
      backups: { ...meta.backups, last: { slot: 'preBulk' } },
    });
    const release = createBundleSpaceRelease(storage.area, GEMINI_OWNER, []);
    expect(await release()).toBe(true);
    expect(storage.read(ownerBackupKey(KEY, 'a'))).toBeUndefined();
    expect(storage.read(ownerBackupKey(KEY, 'preBulk'))).toEqual({ value: 'preBulk' });
    expect(await release()).toBe(false);
  });

  it('does no deletion on read failure, and the next call retries a partially failed removal', async () => {
    const { storage, removals, release } = releaseWorld();
    storage.failWhen((op) => op === 'get');
    await expect(release()).rejects.toThrow();
    expect(removals).toEqual([]);
    storage.failWhen((op) => op === 'remove', [pendingOpKey('c', 1)]);
    await expect(release()).rejects.toThrow();
    expect(storage.read(ownerBackupKey(KEY, 'b'))).toEqual({ value: 'last' });
    storage.failWhen(null);
    expect(await release()).toBe(true);
    expect(storage.read(pendingOpKey('c', 2))).toBeUndefined();
    expect(storage.read(pendingOpKey('c', 3))).toEqual(pending(3));
  });

  it('preserves a named slot that participates in the bundle and ignores malformed pending envelopes', async () => {
    const { storage } = releaseWorld();
    storage.write(pendingOpKey('c', 1), pending(2));
    storage.write(pendingOpKey('c', 2), pending(2, { v: 2 }));
    const release = createBundleSpaceRelease(storage.area, GEMINI_OWNER, [
      ownerBackupKey(KEY, 'b'),
    ]);
    await release();
    await release();
    expect(storage.read(ownerBackupKey(KEY, 'b'))).toEqual({ value: 'last' });
    expect(storage.read(pendingOpKey('c', 1))).toEqual(pending(2));
    expect(storage.read(pendingOpKey('c', 2))).toEqual(pending(2, { v: 2 }));
  });
});

describe('pending release after partial ordinary commits', () => {
  it('retains pending ops when a meta-only landing can still roll the watermark back', async () => {
    const { storage } = releaseWorld();
    const prev = folderData([folder('F', 'before')]);
    const next = folderData([folder('F', 'after')]);
    const prevHash = await hashValue(prev);
    const nextHash = await hashValue(next);
    const prevMeta = {
      ...meta,
      dataHash: prevHash,
      clients: { c: { ...meta.clients.c, applied: 0 } },
    };
    const nextMeta = {
      ...prevMeta,
      rev: prevMeta.rev + 1,
      dataHash: nextHash,
      clients: meta.clients,
    };
    storage.write(KEY, prev);
    storage.write(ownerMetaKey(KEY), nextMeta);
    storage.write(ownerIntentKey(KEY), {
      v: 1,
      txId: 'ordinary',
      epoch: 'e',
      prevRev: prevMeta.rev,
      nextRev: nextMeta.rev,
      prevHash,
      nextHash,
      prevMeta,
      nextMeta,
    });
    const release = createBundleSpaceRelease(storage.area, GEMINI_OWNER, []);
    expect(await release()).toBe(true);
    expect(storage.read(pendingOpKey('c', 1))).toEqual(pending(1));
    expect(storage.read(pendingOpKey('c', 2))).toEqual(pending(2));
    expect(storage.read(ownerMetaKey(KEY))).toEqual(nextMeta);
    const body = { kind: 'renameFolder', folderId: 'F', name: 'after' };
    storage.write(pendingOpKey('c', 1), pending(1, { op: body }));
    const core = createFolderOwnerCore({
      area: storage.area,
      authority: GEMINI_OWNER,
      now: () => 1,
    });
    await core.drain(KEY);
    expect(storage.read(KEY)).toEqual(next);
    await expect(
      core.apply({ key: KEY, clientId: 'c', epoch: 'e', ackedThrough: 0, ops: [{ seq: 1, body }] }),
    ).resolves.toMatchObject({ kind: 'ok', outcomes: { 1: { kind: 'saved' } } });
    expect(storage.read(KEY)).toEqual(next);
  });
});

async function recoveryWorld(open = true, realEvents = false, quota = 11_000) {
  const next = 'n'.repeat(4000);
  const intent: OpenBundle = {
    v: 1,
    status: 'open',
    txId: 'tx',
    site: 'gemini',
    seq: 1,
    clientId: 'c',
    at: 0,
    keys: { [KEY]: { prevHash: await hashValue('prev'), nextHash: await hashValue(next) } },
    values: { [KEY]: next },
  };
  const store = createByteStore(
    {
      [KEY]: 'prev',
      cache: 'x'.repeat(6000),
      ...(open ? { [BUNDLE_INTENT_KEY]: intent } : {}),
    },
    { quota, perKey: true },
  );
  const queue = createWriteQueue();
  type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
  let listener: ((changes: Changes, areaName: string) => void) | null = null;
  const timers: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];
  const recovery = createBundleRecovery({
    area: store.area,
    authority: ALL_OWNER,
    serialize: queue,
    subscribe: (callback) => {
      listener = callback;
      const unsubscribe = realEvents
        ? store.subscribe((changes) => callback(changes, 'local'))
        : () => {};
      return () => {
        unsubscribe();
        listener = null;
      };
    },
    setTimer: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  queue.setPrelude(recovery.prelude);
  const idle = async () => {
    await queue(async () => undefined, []);
    await Promise.resolve();
  };
  return {
    store,
    queue,
    intent,
    next,
    timers,
    recovery,
    idle,
    emit: (changes: Changes, areaName = 'local') => listener?.(changes, areaName),
    subscribed: () => listener !== null,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('bundle recovery scheduling (R3.6)', () => {
  it('bounds immediate retries from its own shrink and removal events while quota stays blocked', async () => {
    const w = await recoveryWorld(true, true, 12_000);
    const landed = 'l'.repeat(50);
    w.intent.keys.landed = {
      prevHash: await hashValue(undefined),
      nextHash: await hashValue(landed),
    };
    w.intent.values.landed = landed;
    await w.store.area.set({
      landed,
      [BUNDLE_INTENT_KEY]: w.intent,
      [ownerMetaKey(KEY)]: { ...meta, dataHash: await hashValue('prev') },
      [pendingOpKey('c', 1)]: pending(1),
      [ownerBackupKey(KEY, 'b')]: { value: 'last' },
      [ownerBackupKey(KEY, 'a')]: { value: 'prior' },
    });
    w.recovery.start();
    for (let i = 0; i < 5; i += 1) await w.idle();
    expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
    expect((w.store.read(BUNDLE_INTENT_KEY) as OpenBundle).values).not.toHaveProperty('landed');
    expect(w.store.has(pendingOpKey('c', 1))).toBe(false);
    expect(w.store.has(ownerBackupKey(KEY, 'b'))).toBe(false);
    expect(w.store.has(ownerBackupKey(KEY, 'a'))).toBe(false);
    const calls = w.store.log.length;
    for (let i = 0; i < 5; i += 1) await w.idle();
    expect(w.store.log).toHaveLength(calls);
    expect(calls).toBeLessThan(40);
    expect(w.timers.filter((timer) => !timer.cancelled)).toHaveLength(1);
    expect(w.timers.find((timer) => !timer.cancelled)?.ms).toBe(BUNDLE_RETRY_MS);
    w.recovery.stop();
  });

  it('releases space once for a stuck bundle, not again for each turn that waits on it', async () => {
    const w = await recoveryWorld();
    w.recovery.start();
    await w.idle();
    expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
    const gets = vi.spyOn(w.store.area, 'get');

    for (let turn = 0; turn < 3; turn += 1) {
      await w.queue(async () => undefined, ['other']);
      await expect(w.queue(async () => undefined, [KEY])).rejects.toThrow('write_failed');
    }

    expect(gets.mock.calls.filter(([keys]) => keys === null)).toEqual([]);
    w.recovery.stop();
  });

  it.each(['intent', 'participant'])(
    'retries a transient non-quota %s read failure on its timer',
    async (failure) => {
      const w = await recoveryWorld();
      await w.store.area.remove('cache');
      const get = w.store.area.get.bind(w.store.area);
      let fail = true;
      const spy = vi.spyOn(w.store.area, 'get').mockImplementation(async (keys) => {
        if (
          fail &&
          Array.isArray(keys) &&
          keys.includes(failure === 'intent' ? BUNDLE_INTENT_KEY : KEY)
        ) {
          fail = false;
          throw new Error('storage offline');
        }
        return get(keys);
      });
      w.recovery.start();
      await w.idle();
      expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
      const timer = w.timers.find((item) => !item.cancelled)!;
      expect(timer.ms).toBe(BUNDLE_RETRY_MS);
      spy.mockRestore();
      timer.run();
      await w.idle();
      expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' });
      w.recovery.stop();
    },
  );

  it('leaves unrelated turns available and completes after external cache cleanup lowers usage', async () => {
    const w = await recoveryWorld();
    w.recovery.start();
    await w.idle();
    expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
    expect(w.timers.find((timer) => !timer.cancelled)?.ms).toBe(BUNDLE_RETRY_MS);
    const read = vi.fn(async () => 'unrelated');
    await expect(w.queue(read, ['other'])).resolves.toBe('unrelated');
    const affected = vi.fn(async () => w.store.read(KEY));
    await expect(w.queue(affected, [KEY])).rejects.toThrow('write_failed');
    expect(affected).not.toHaveBeenCalled();
    const oldValue = w.store.read('cache');
    await w.store.area.remove('cache');
    w.emit({ cache: { oldValue } });
    await w.idle();
    expect(w.store.read(KEY)).toEqual(w.next);
    expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' });
    expect(w.timers.every((timer) => timer.cancelled)).toBe(true);
    expect(w.store.used()).toBeLessThanOrEqual(11_000);
    w.recovery.stop();
  });

  it('retries after 60 seconds without an event, and stop cancels timer and subscription', async () => {
    const w = await recoveryWorld();
    w.recovery.start();
    await w.idle();
    await w.store.area.remove('cache');
    const timer = w.timers.find((item) => !item.cancelled)!;
    timer.run();
    await w.idle();
    expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' });
    w.recovery.stop();
    expect(w.subscribed()).toBe(false);
  });

  it('detects a newly open intent while idle and queues recovery after the current turn', async () => {
    const w = await recoveryWorld(false);
    w.recovery.start();
    await w.idle();
    expect(w.timers).toEqual([]);
    await w.queue(async () => {
      await w.store.area.set({ [BUNDLE_INTENT_KEY]: w.intent });
      w.emit({ [BUNDLE_INTENT_KEY]: { newValue: w.intent } });
    }, []);
    await w.idle();
    expect(w.store.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
    expect(w.timers.find((timer) => !timer.cancelled)?.ms).toBe(BUNDLE_RETRY_MS);
    w.recovery.stop();
  });

  it('coalesces reduction events, ignores other areas and net growth, and cancels a queued retry on stop', async () => {
    const w = await recoveryWorld();
    w.recovery.start();
    await w.idle();
    const gets = vi.spyOn(w.store.area, 'get');
    w.emit({ cache: { oldValue: 'long', newValue: 's' } }, 'sync');
    w.emit({ a: { oldValue: 'large', newValue: 's' }, b: { newValue: 'much larger' } });
    await w.idle();
    expect(gets).not.toHaveBeenCalled();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const turn = w.queue(() => held, []);
    w.emit({ cache: { oldValue: 'long', newValue: 's' } });
    w.emit({ cache: { oldValue: 'long', newValue: 's' } });
    w.recovery.stop();
    release();
    await turn;
    await w.idle();
    expect(gets).not.toHaveBeenCalled();
    expect(w.timers.every((timer) => timer.cancelled)).toBe(true);
  });

  it('does no I/O, timer setup or subscription when every site stays legacy', async () => {
    const storage = createFaultyStorage();
    const subscribe = vi.fn(() => () => {});
    const setTimer = vi.fn(() => () => {});
    const recovery = createBundleRecovery({
      area: storage.area,
      authority: { gemini: 'legacy', aistudio: 'legacy', chatgpt: 'legacy' },
      serialize: createWriteQueue(),
      subscribe,
      setTimer,
    });
    recovery.start();
    await recovery.prelude([KEY]);
    recovery.stop();
    expect(storage.calls()).toBe(0);
    expect(subscribe).not.toHaveBeenCalled();
    expect(setTimer).not.toHaveBeenCalled();
  });
});
