import { describe, expect, it, vi } from 'vitest';

import type { EditOutcome } from '@/features/folder/commands/folderCommands';

import { FolderClient } from '../client/folderClient';
import type { FolderOwnerCore } from '../folderOwnerCore';
import type { FolderOwnerRequest, FolderOwnerResponse } from '../folderOwnerMessages';
import { FOLDER_SITE_POLICIES } from '../folderOwnerPolicy';
import { dispatchFolderOwnerRequest } from '../folderOwnerRequests';
import { ownerMetaKey } from '../folderOwnerState';
import { createFaultyStorage } from './faultyStorage';
import {
  KEY,
  TestClient,
  createWorld,
  folder,
  folderData,
  pendingKeys,
  rename,
  storedData,
  storedMeta,
} from './ownerHarness';

/** Waits for an async condition: owner turns hash with WebCrypto, so they span macrotasks. */
const until = (check: () => void) => vi.waitFor(check, { timeout: 2000, interval: 1 });

function clientWorld() {
  const storage = createFaultyStorage({ [KEY]: folderData([folder('F', 'A')]) });
  const world = createWorld(storage);
  const owner: FolderOwnerCore = world.process();
  const timers = new Set<{ ms: number; run: () => void }>();
  const sent: string[] = [];
  /** A held request waits for its gate before the owner sees it, or after (its reply is late). */
  let hold: { type: string; until: Promise<void>; when: 'request' | 'reply' } | null = null;
  const wait = async (type: string, when: 'request' | 'reply') => {
    if (hold?.type === type && hold.when === when) await hold.until;
  };
  let ids = 0;
  const client = new FolderClient({
    key: KEY,
    policy: FOLDER_SITE_POLICIES.gemini,
    area: storage.area,
    send: async (request: FolderOwnerRequest): Promise<FolderOwnerResponse> => {
      sent.push(request.type);
      await wait(request.type, 'request');
      const reply = await dispatchFolderOwnerRequest(request, owner);
      await wait(request.type, 'reply');
      return reply;
    },
    subscribe: storage.subscribe,
    now: world.now,
    newId: () => `client-${++ids}`,
    setTimer: (run, ms) => {
      const timer = { ms, run };
      timers.add(timer);
      return () => void timers.delete(timer);
    },
  });
  return {
    storage,
    world,
    owner,
    client,
    sent,
    hold(type: FolderOwnerRequest['type'], when: 'request' | 'reply') {
      let open!: () => void;
      hold = { type, when, until: new Promise<void>((resolve) => (open = resolve)) };
      return () => open();
    },
    timerCount: () => timers.size,
    /** Runs every timer scheduled so far; returns their delays. */
    fireTimers(): number[] {
      const due = [...timers];
      timers.clear();
      due.forEach((timer) => timer.run());
      return due.map((timer) => timer.ms);
    },
  };
}

const names = (data: { folders: Array<{ id: string; name: string }> }) =>
  Object.fromEntries(data.folders.map((f) => [f.id, f.name]));

describe('FolderClient', () => {
  it('ends with the view equal to stored data and every op saved once', async () => {
    const { storage, client } = clientWorld();
    await client.open();

    const outcomes = await Promise.all([
      client.run({ kind: 'createFolder', folderId: 'X', name: 'New', parentId: null }),
      client.run({ kind: 'renameFolder', folderId: 'F', name: 'B' }),
      client.run({ kind: 'setFolderPinned', folderId: 'X', pinned: true }),
    ]);

    expect(outcomes.map((o) => o.kind)).toEqual(['saved', 'saved', 'saved']);
    await until(() => expect(client.view()).toEqual(storedData(storage)));
    expect(names(storedData(storage))).toEqual({ F: 'B', X: 'New' });
    expect(pendingKeys(storage)).toEqual([]);
  });

  it('T3d: keeps an op pending and visible while its pending key cannot be written', async () => {
    const { storage, client, fireTimers, timerCount } = clientWorld();
    await client.open();
    let failures = 0;
    storage.failWhen(
      (op, keys) => op === 'set' && keys[0].startsWith('gvFolderOwner:pending:') && failures++ < 3,
    );
    let outcome: EditOutcome | null = null;
    void client.run(rename('F', 'B') as never).then((o) => (outcome = o));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await until(() => expect(timerCount()).toBe(1));
      expect(client.status()).toBe('delayed');
      expect(names(client.view()).F).toBe('B');
      expect(names(storedData(storage)).F).toBe('A');
      expect(outcome).toBeNull();
      fireTimers();
    }
    await until(() => expect(outcome).toEqual({ kind: 'saved' }));
    expect(client.status()).toBe('ready');
    expect(names(storedData(storage)).F).toBe('B');
  });

  it('T3d: a reconcile while the pending-key write fails keeps showing not saved', async () => {
    const { storage, client, sent, timerCount } = clientWorld();
    await client.open();
    storage.failWhen((op, keys) => op === 'set' && keys[0].startsWith('gvFolderOwner:pending:'));
    void client.run(rename('F', 'B') as never);
    await until(() => expect(timerCount()).toBe(1));

    // The status shown whenever the client retries the failing write.
    const shown: string[] = [];
    storage.onCall((_call, op, keys) => {
      if (op === 'set' && keys[0].startsWith('gvFolderOwner:pending:')) shown.push(client.status());
    });
    // A K-only change (for example another writer) makes the client reconcile.
    await storage.area.set({ [KEY]: folderData([folder('F', 'A')]) });
    await until(() => expect(sent).toContain('gv.folderOwner.snapshot'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(shown.every((status) => status === 'delayed')).toBe(true);
    expect(client.status()).toBe('delayed');
    expect(names(client.view()).F).toBe('B');
  });

  it('after a stop, a scheduled retry never publishes the edit the user was told failed', async () => {
    const { storage, client, fireTimers, timerCount } = clientWorld();
    await client.open();
    storage.failWhen((op, keys) => op === 'set' && keys[0].startsWith('gvFolderOwner:pending:'));
    const edit = client.run(rename('F', 'B') as never);
    await until(() => expect(timerCount()).toBe(1));
    storage.failWhen(null);

    // The meta is recreated under a new epoch: this client must reload.
    const meta = storedMeta(storage);
    await storage.area.set({ [ownerMetaKey(KEY)]: { ...meta, epoch: 'other', rev: meta.rev + 1 } });
    await expect(edit).resolves.toMatchObject({ kind: 'failed', reason: 'reload_required' });
    fireTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(pendingKeys(storage)).toEqual([]);
    expect(client.status()).toBe('reload_required');
  });

  it('T4d: rides out owner read failures and keeps accepting edits afterwards', async () => {
    const { storage, client, fireTimers, timerCount } = clientWorld();
    await client.open();
    let failures = 0;
    storage.failWhen((op) => op === 'get' && failures++ < 3);
    let first: EditOutcome | null = null;
    void client.run(rename('F', 'B') as never).then((o) => (first = o));

    for (let turn = 0; turn < 3; turn += 1) {
      await until(() => expect(timerCount()).toBe(1));
      expect(first).toBeNull();
      expect(names(storedData(storage)).F).toBe('A');
      fireTimers();
    }
    await until(() => expect(first).toEqual({ kind: 'saved' }));

    await expect(client.run(rename('F', 'C') as never)).resolves.toEqual({ kind: 'saved' });
    expect(names(storedData(storage)).F).toBe('C');
    await until(() => expect(client.view()).toEqual(storedData(storage)));
    expect(client.status()).toBe('ready');
  });

  it('T4f: never replays an op the base already includes, even before its reply', async () => {
    const { storage, world, owner, client, hold } = clientWorld();
    await client.open();
    const releaseReply = hold('gv.folderOwner.apply', 'reply');

    const created = client.run({ kind: 'createFolder', folderId: 'X', name: 'X', parentId: null });
    await until(() => expect(names(storedData(storage)).X).toBe('X'));
    // Another tab deletes X after A's commit, before A hears its reply.
    const other = new TestClient(world, 'B');
    await other.open(owner);
    other.accept({ kind: 'removeFolder', folderId: 'X' });
    await other.flush(owner);

    await until(() => expect(names(client.view())).toEqual({ F: 'A' }));
    releaseReply();
    await expect(created).resolves.toEqual({ kind: 'saved' });
    expect(client.view()).toEqual(storedData(storage));
  });

  it('T4b: a reply whose echo is late keeps the op in view and asks for a snapshot at 2 s', async () => {
    const { storage, client, sent, fireTimers } = clientWorld();
    await client.open();
    storage.holdEvents();

    await expect(client.run(rename('F', 'B') as never)).resolves.toEqual({ kind: 'saved' });
    expect(names(client.view()).F).toBe('B');
    expect(fireTimers()).toEqual([2000]);

    await until(() => expect(sent).toContain('gv.folderOwner.snapshot'));
    expect(names(client.view()).F).toBe('B');
    storage.releaseEvents();
    await until(() => expect(client.view()).toEqual(storedData(storage)));
  });

  it('T4c: a K-only write is reconciled through a snapshot without dropping a queued op', async () => {
    const { storage, client, hold, sent } = clientWorld();
    await client.open();
    const releaseRequest = hold('gv.folderOwner.apply', 'request');
    const renamed = client.run(rename('F', 'B') as never);
    await until(() => expect(sent).toContain('gv.folderOwner.apply'));

    // A foreign writer replaces K while the rename is on its way to the owner.
    await storage.area.set({ [KEY]: folderData([folder('F', 'A'), folder('Y', 'Foreign')]) });
    await until(() => expect(names(client.view())).toEqual({ F: 'B', Y: 'Foreign' }));
    expect(sent).toContain('gv.folderOwner.snapshot');
    releaseRequest();

    await expect(renamed).resolves.toEqual({ kind: 'saved' });
    expect(names(storedData(storage))).toEqual({ F: 'B', Y: 'Foreign' });
    await until(() => expect(client.view()).toEqual(storedData(storage)));
  });

  it('delivers the rejection of an op another turn drained before the client sent it', async () => {
    const { storage, world, client, hold, sent } = clientWorld();
    await client.open();
    const releaseRequest = hold('gv.folderOwner.apply', 'request');
    let outcome: EditOutcome | null = null;
    // seq 1 is in flight; seq 2 is accepted behind it and not yet sent.
    const first = client.run(rename('F', 'B') as never);
    await until(() => expect(sent).toContain('gv.folderOwner.apply'));
    void client.run(rename('Gone', 'B') as never).then((o) => (outcome = o));
    await until(() => expect(pendingKeys(storage)).toHaveLength(2));

    // A restarted owner drains both accepted ops before A's apply arrives; A sees the echo first.
    await new TestClient(world, 'B').open(world.process());
    expect(storedMeta(storage).clients['client-1'].applied).toBe(2);
    expect(outcome).toBeNull();
    releaseRequest();
    await expect(first).resolves.toEqual({ kind: 'saved' });

    await until(() =>
      expect(outcome).toMatchObject({ kind: 'rejected', reason: 'folder_missing' }),
    );
    await until(() => expect(client.view()).toEqual(storedData(storage)));
  });

  it('T5: an account switch keeps every op for the old key and leaves no listener or timer', async () => {
    const { storage, world, client, hold, fireTimers, timerCount } = clientWorld();
    await client.open();
    hold('gv.folderOwner.apply', 'request'); // the owner never answers before the switch
    const create = (id: string) =>
      void client.run({ kind: 'createFolder', folderId: id, name: id, parentId: null });
    ['X1', 'X2', 'X3'].forEach(create);
    await until(() => expect(pendingKeys(storage)).toHaveLength(3));
    let failures = 0;
    storage.failWhen(
      (op, keys) => op === 'set' && keys[0].startsWith('gvFolderOwner:pending:') && failures++ < 2,
    );
    ['X4', 'X5'].forEach(create);
    await until(() => expect(timerCount()).toBe(1));

    let detached = false;
    void client.detach().then(() => (detached = true));
    while (!detached) {
      fireTimers();
      await until(() => expect(detached || timerCount() > 0).toBe(true));
    }

    expect(storage.listenerCount()).toBe(0);
    expect(timerCount()).toBe(0);
    expect(pendingKeys(storage)).toHaveLength(5);
    // The tab unloads; the next background start drains the old key.
    await world.process().drain(KEY);
    expect(storedData(storage).folders.map((f) => f.id)).toEqual([
      'F',
      'X1',
      'X2',
      'X3',
      'X4',
      'X5',
    ]);
    expect(storage.read('gvFolderData:acct:b')).toBeUndefined();
  });

  it('stops with reload_required when the owner says this build does not own the site', async () => {
    const notOwner = new FolderClient({
      key: KEY,
      policy: FOLDER_SITE_POLICIES.gemini,
      area: createFaultyStorage().area,
      send: async () => ({ kind: 'refused', reason: 'not_owner' }),
      subscribe: () => () => undefined,
    });
    await notOwner.open();

    expect(notOwner.status()).toBe('reload_required');
    await expect(notOwner.run(rename('F', 'B') as never)).resolves.toMatchObject({
      kind: 'failed',
      reason: 'reload_required',
    });
  });
});
