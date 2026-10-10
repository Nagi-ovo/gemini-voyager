import { describe, expect, it, vi } from 'vitest';

import type { EditOutcome } from '@/features/folder/commands/folderCommands';

import { ALLOWANCE_BYTES, granted, isFresh } from '../client/clientAllowance';
import { FolderClient } from '../client/folderClient';
import type { FolderOwnerCore } from '../folderOwnerCore';
import type { FolderOwnerRequest, FolderOwnerResponse } from '../folderOwnerMessages';
import { FOLDER_SITE_POLICIES } from '../folderOwnerPolicy';
import { dispatchFolderOwnerRequest } from '../folderOwnerRequests';
import type { FolderOwnerStorageArea } from '../folderOwnerState';
import { createFaultyStorage } from './faultyStorage';
import {
  KEY,
  TestClient,
  createWorld,
  folder,
  folderData,
  pendingKeys,
  storedData,
  storedMeta,
} from './ownerHarness';

const until = (check: () => void) => vi.waitFor(check, { timeout: 2000, interval: 1 });
const MINUTE = 60_000;

/** A client over a real owner, with both clocks under the test's control and every call logged. */
function allowanceWorld() {
  const storage = createFaultyStorage({ [KEY]: folderData([folder('F', 'A')]) });
  const world = createWorld(storage);
  const owner: FolderOwnerCore = world.process();
  let monotonic = 0;
  const log: string[] = [];
  let held: { type: string; until: Promise<void> } | null = null;
  const area: FolderOwnerStorageArea = {
    ...storage.area,
    set: (items) => {
      log.push('set');
      return storage.area.set(items);
    },
  };
  const client = new FolderClient({
    key: KEY,
    policy: FOLDER_SITE_POLICIES.gemini,
    area,
    send: async (request: FolderOwnerRequest): Promise<FolderOwnerResponse> => {
      log.push(request.type.replace('gv.folderOwner.', ''));
      const reply = await dispatchFolderOwnerRequest(request, owner);
      if (held?.type === request.type) await held.until;
      return reply;
    },
    subscribe: storage.subscribe,
    now: world.now,
    monotonic: () => monotonic,
    newId: () => 'client-1',
    setTimer: () => () => {},
  });
  return {
    storage,
    world,
    owner,
    client,
    log,
    /** Moves the wall clock and the monotonic clock by their own amounts. */
    advance(wallMs: number, monotonicMs = wallMs) {
      world.advance(wallMs);
      monotonic += monotonicMs;
    },
    /** Holds the replies to every request of `type` until the returned release runs. */
    holdReplies(type: 'gv.folderOwner.open' | 'gv.folderOwner.apply') {
      let open!: () => void;
      held = { type, until: new Promise<void>((resolve) => (open = resolve)) };
      return () => {
        held = null;
        open();
      };
    },
  };
}

const create = (id: string, name = id) =>
  ({ kind: 'createFolder', folderId: id, name, parentId: null }) as const;

/** The calls made after the `n`th logged call. */
const after = (log: string[], n: number) => log.slice(n);

describe('FolderClient pending allowance (addendum P3P4 R3.2)', () => {
  it('writes pending keys without re-opening while the allowance is fresh', async () => {
    const { client, log, advance } = allowanceWorld();
    await client.open();
    advance(5 * MINUTE);
    const mark = log.length;

    await expect(client.run(create('X'))).resolves.toMatchObject({ kind: 'saved' });
    expect(after(log, mark)[0]).toBe('set');
  });

  it('dates the allowance from the send, so an apply reply held past the TTL grants nothing', async () => {
    const { storage, client, log, advance, holdReplies } = allowanceWorld();
    await client.open();
    const release = holdReplies('gv.folderOwner.apply');
    const first = client.run(create('X'));
    await until(() => expect(storedMeta(storage).clients['client-1'].applied).toBe(1));
    advance(31 * MINUTE);
    release();
    await expect(first).resolves.toMatchObject({ kind: 'saved' });
    const mark = log.length;

    await expect(client.run(create('Y'))).resolves.toMatchObject({ kind: 'saved' });
    expect(after(log, mark).slice(0, 2)).toEqual(['open', 'set']);
  });

  it('T26g: a ready held past the retirement of its client grants nothing', async () => {
    const { storage, world, owner, client, log, advance, holdReplies } = allowanceWorld();
    const release = holdReplies('gv.folderOwner.open');
    const opening = client.open();
    // The owner registers C at t0; only its reply is held.
    await until(() => expect(storedMeta(storage).clients['client-1']).toBeDefined());
    advance(61 * MINUTE);
    // Another tab's turn runs GC, which retires the silent client and releases its allowance.
    await new TestClient(world, 'other').open(owner);
    expect(storedMeta(storage).retired['client-1']).toBeDefined();
    advance(4 * MINUTE);
    release();
    await opening;
    const mark = log.length;

    await expect(client.run(create('X'))).resolves.toMatchObject({ kind: 'saved' });
    expect(after(log, mark).slice(0, 2)).toEqual(['open', 'set']);
    expect(storedMeta(storage).clients['client-1']).toBeDefined();
  });

  it.each([
    ['the wall clock passes the TTL while the monotonic clock slept (T26g)', 40 * MINUTE, 1000],
    ['the two clocks disagree by more than a minute', 5 * MINUTE, 1000],
    ['the wall clock went back', -10_000, 1000],
    ['only the monotonic clock passes the TTL', 29.5 * MINUTE, 30.5 * MINUTE],
  ])('re-opens before the next pending key when %s', async (_, wallMs, monotonicMs) => {
    const { client, log, advance } = allowanceWorld();
    await client.open();
    advance(wallMs, monotonicMs);
    const mark = log.length;

    await expect(client.run(create('X'))).resolves.toMatchObject({ kind: 'saved' });
    expect(after(log, mark).slice(0, 2)).toEqual(['open', 'set']);
  });

  it('treats a reply without a usable TTL as granting no allowance, and keeps the later grant', () => {
    const clocks = { wall: () => 1000, monotonic: () => 1000 };
    const sent = { wall: 1000, monotonic: 1000 };
    for (const ttl of [undefined, Number.NaN, -1, Infinity]) {
      expect(isFresh(granted(sent, ttl, null), clocks)).toBe(false);
    }
    const later = granted({ wall: 990, monotonic: 990 }, 30 * MINUTE, null);
    expect(granted({ wall: 0, monotonic: 0 }, 30 * MINUTE, later)).toBe(later);
  });

  it('keeps an op pending past 16 KiB of unapplied pending keys, then saves it once room frees', async () => {
    const { storage, client, log, holdReplies } = allowanceWorld();
    await client.open();
    const release = holdReplies('gv.folderOwner.apply');
    const name = 'n'.repeat(Math.floor(ALLOWANCE_BYTES / 3));
    const runs: Array<Promise<EditOutcome>> = [];
    for (const id of ['A1', 'A2', 'A3']) runs.push(client.run(create(id, name)));
    await until(() => expect(client.status()).toBe('delayed'));

    expect(log.filter((call) => call === 'set')).toHaveLength(2);
    expect(pendingKeys(storage).length).toBeLessThanOrEqual(2);
    release();

    const outcomes = await Promise.all(runs);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['saved', 'saved', 'saved']);
    await until(() => expect(client.status()).toBe('ready'));
  });

  it.each([false, true])(
    'rejects an oversized ordinary envelope without a seq gap (opened: %s)',
    async (opened) => {
      const { storage, client, log } = allowanceWorld();
      if (opened) await client.open();
      let outcome: EditOutcome | null = null;
      void client
        .run({ kind: 'setFolderInstructions', folderId: 'F', instructions: '中'.repeat(6000) })
        .then((result) => (outcome = result));
      await until(() =>
        expect(outcome).toMatchObject({ kind: 'rejected', reason: 'payload_too_large' }),
      );
      expect(log.filter((call) => call === 'set')).toEqual([]);

      const next = client.run({ kind: 'renameFolder', folderId: 'F', name: 'B' });
      if (!opened) await client.open();
      await expect(next).resolves.toEqual({ kind: 'saved' });
      await client.flush();
      expect(storedMeta(storage).clients['client-1'].applied).toBe(1);
      expect(storedData(storage).folders.find((entry) => entry.id === 'F')?.name).toBe('B');
      expect(
        storedData(storage).folders.find((entry) => entry.id === 'F')?.instructions,
      ).toBeUndefined();
      expect(pendingKeys(storage)).toEqual([]);
      expect(client.status()).toBe('ready');
    },
  );

  it('counts envelope overhead even when the ordinary body alone fits the allowance', async () => {
    const { client } = allowanceWorld();
    await client.open();
    const body = {
      kind: 'setFolderInstructions',
      folderId: 'F',
      instructions: 'a'.repeat(ALLOWANCE_BYTES - 100),
    } as const;
    expect(new TextEncoder().encode(JSON.stringify(body)).byteLength).toBeLessThan(ALLOWANCE_BYTES);

    await expect(client.run(body)).resolves.toMatchObject({
      kind: 'rejected',
      reason: 'payload_too_large',
    });
  });
});
