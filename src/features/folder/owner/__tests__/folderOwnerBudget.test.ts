import { describe, expect, it } from 'vitest';

import { HighlightAnnotationService } from '@/core/services/HighlightAnnotationService';
import { createHighlightSourceTextHash } from '@/core/services/highlightAnnotationData';
import type { FolderData } from '@/core/types/folder';
import {
  type StorageBudget,
  createStorageBudget,
  storedItemBytes,
} from '@/features/storage/storageBudget';

import { ownerBackupKey, ownerIntentKey } from '../folderOwnerState';
import { type FaultyStorage, createFaultyStorage } from './faultyStorage';
import {
  ALL_OWNER,
  KEY,
  TestClient,
  conversation,
  createWorld,
  folder,
  folderData,
  rename,
  storedData,
} from './ownerHarness';

const MIB = 1024 * 1024;
const SOFT_CAP = 25 * MIB;

async function bytesIn(storage: FaultyStorage, keys?: readonly string[]): Promise<number> {
  const all = await storage.area.getAll();
  return Object.entries(all)
    .filter(([key]) => !keys || keys.includes(key))
    .reduce((sum, [key, value]) => sum + storedItemBytes(key, value), 0);
}

function budgetOver(storage: FaultyStorage, quota: number | null): StorageBudget {
  return createStorageBudget({
    measure: async (keys) => ({
      bytesInUse: await bytesIn(storage),
      keyBytes: await bytesIn(storage, keys),
      limitBytes: quota === null ? SOFT_CAP : Math.min(SOFT_CAP, quota),
      quotaBytes: quota,
    }),
    quota: async () => quota,
    barrier: async () => undefined,
  });
}

/** One folder `F` holding about `bytes` of conversation references, and an empty `E`. */
function library(bytes: number): FolderData {
  const title = 't'.repeat(1000);
  const count = Math.ceil(bytes / 1100);
  const refs = Array.from({ length: count }, (_, n) => conversation(`c${n}`, { title }));
  return folderData([folder('F', 'Full'), folder('E', 'Empty')], { F: refs });
}

/** Storage holding `data` in K and filler, `total` bytes in all. */
async function storageWith(data: FolderData, total: number) {
  const storage = createFaultyStorage({ [KEY]: data });
  const filler = 'x'.repeat(total - (await bytesIn(storage)) - storedItemBytes('gvOther', ''));
  storage.write('gvOther', filler);
  return storage;
}

async function owned(storage: FaultyStorage, budget: StorageBudget) {
  const w = createWorld(storage, 1_000_000, ALL_OWNER, { budget });
  const tab = new TestClient(w, 'tab');
  await tab.open(w.process());
  const send = async (body: Parameters<TestClient['accept']>[0]) => {
    const [seq] = tab.accept(body);
    const reply = await tab.send(w.process(), [seq], tab.acked);
    if (reply.kind === 'ok') tab.acked = seq;
    return reply.kind === 'ok' ? reply.outcomes[seq] : reply;
  };
  return { send };
}

const rotationSlots = (storage: FaultyStorage) =>
  (['a', 'b', 'c'] as const).filter(
    (slot) => storage.read(ownerBackupKey(KEY, slot)) !== undefined,
  );

describe('the folder owner inside the storage budget (R6.1)', () => {
  it('skips rotation copies near the cap, commits the edit, and leaves room for highlights (T25b)', async () => {
    const storage = await storageWith(library(4.5 * MIB), 15 * MIB);
    const budget = budgetOver(storage, null);
    const { send } = await owned(storage, budget);

    await expect(send(rename('E', 'Renamed'))).resolves.toMatchObject({ kind: 'saved' });

    expect(storedData(storage).folders[1].name).toBe('Renamed');
    expect(rotationSlots(storage)).toEqual([]);
    expect(await bytesIn(storage)).toBeLessThanOrEqual(18.75 * MIB);
    const highlights = new HighlightAnnotationService({
      budget,
      storage: {
        get: async (keys) =>
          keys === null ? storage.area.getAll() : storage.area.get([keys].flat()),
        set: (items) => storage.area.set(items),
        remove: (keys) => storage.area.remove([keys].flat()),
        getBytesInUse: async () => bytesIn(storage),
      },
    });
    await expect(
      highlights.add(
        { platform: 'gemini', accountKey: 'email:a@b.c', accountId: 1, routeUserId: '0' },
        {
          conversationId: 'gemini:conv:abc',
          conversationUrl: 'https://gemini.google.com/app/abc',
          conversationTitle: 'Notes',
          turnId: 'u-turn-1',
          role: 'assistant',
          anchor: {
            quote: { exact: 'passage', prefix: 'Before ', suffix: ' after' },
            position: { start: 0, end: 7 },
            sourceTextHash: createHighlightSourceTextHash('response source'),
          },
          color: 'yellow',
        },
      ),
    ).resolves.toMatchObject({ duplicate: false });
  });

  it.each([
    { label: 'no quota, room for the copy', quota: null, data: 2 * MIB, total: 12 * MIB, ok: true },
    {
      label: 'no quota, copy past the reserve',
      quota: null,
      data: 4 * MIB,
      total: 15 * MIB,
      ok: false,
    },
    {
      label: 'a hard quota the peak fits',
      quota: 5 * MIB,
      data: 1 * MIB,
      total: 1.5 * MIB,
      ok: true,
    },
    {
      label: 'a hard quota the peak exceeds',
      quota: 5 * MIB,
      data: 1 * MIB,
      total: 2.5 * MIB,
      ok: false,
    },
  ])('removes a large folder only with its preBulk admitted: $label (T25e)', async (c) => {
    const start = library(c.data);
    const storage = await storageWith(start, c.total);
    const { send } = await owned(storage, budgetOver(storage, c.quota));

    const outcome = await send({ kind: 'removeFolder', folderId: 'F' });

    if (c.ok) {
      expect(outcome).toMatchObject({ kind: 'saved' });
      expect(storedData(storage).folders.map((f) => f.id)).toEqual(['E']);
      expect(storage.read(ownerBackupKey(KEY, 'preBulk'))).toMatchObject({ value: start });
    } else {
      expect(outcome).toMatchObject({ kind: 'rejected', reason: 'backup_failed' });
      expect(storedData(storage)).toEqual(start);
      expect(storage.read(ownerBackupKey(KEY, 'preBulk'))).toBeUndefined();
    }
    if (c.quota !== null) expect(await bytesIn(storage)).toBeLessThanOrEqual(c.quota);
  });

  it('refuses a commit whose intent, K and meta would pass a hard quota, writing nothing', async () => {
    const start = library(1 * MIB);
    const storage = await storageWith(start, 4.5 * MIB);
    const { send } = await owned(storage, budgetOver(storage, 5 * MIB));

    // Grows K by about 1 MiB: past the 5 MiB quota once the intent is counted.
    const seeds = Array.from({ length: 950 }, (_, n) => {
      const { conversationId, title, url } = conversation(`g${n}`, { title: 'g'.repeat(1000) });
      return { conversationId, title, url };
    });
    const reply = await send({ kind: 'addConversations', target: 'E', seeds, via: 'outside-drop' });

    expect(reply).toMatchObject({ kind: 'refused', reason: 'write_failed' });
    expect(storedData(storage)).toEqual(start);
    expect(storage.read(ownerIntentKey(KEY))).toBeUndefined();
  });
});
