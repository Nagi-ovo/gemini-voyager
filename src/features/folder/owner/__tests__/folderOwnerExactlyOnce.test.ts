import { describe, expect, it } from 'vitest';

import { CLIENT_IDLE_MS } from '../ownerCollect';
import { DRAIN_CHUNK } from '../ownerDrain';
import { createFaultyStorage } from './faultyStorage';
import {
  KEY,
  TestClient,
  createWorld,
  folder,
  folderData,
  pendingKeys,
  range,
  rename,
  storedData,
  storedMeta,
} from './ownerHarness';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function setup(names: Record<string, string> = { F: 'A' }) {
  const storage = createFaultyStorage({
    [KEY]: folderData(Object.entries(names).map(([id, name]) => folder(id, name))),
  });
  const world = createWorld(storage);
  const owner = world.process();
  const a = new TestClient(world, 'A');
  await a.open(owner);
  return { storage, world, owner, a };
}

const nameOf = (storage: ReturnType<typeof createFaultyStorage>, id = 'F') =>
  storedData(storage).folders.find((f) => f.id === id)?.name;

describe('exactly once (§6.3)', () => {
  it('T2a: a retried no-op whose reply was lost stays a duplicate after a later op', async () => {
    const { storage, owner, a } = await setup();
    a.accept(rename('F', 'A'), rename('F', 'B'));
    await a.send(owner, [1]); // reply lost
    await a.send(owner, [2]);

    const retry = await a.send(owner, [1]);

    expect(retry).toMatchObject({
      kind: 'ok',
      outcomes: { 1: { kind: 'unchanged', reason: 'noop' } },
    });
    expect(nameOf(storage)).toBe('B');
  });

  it('T2b: a retry of seq 1 after 600 ops is a duplicate, however old', async () => {
    const { storage, owner, a } = await setup();
    a.accept(...range(1, 600).map((n) => rename('F', `n${n}`)));
    while (a.acked < 600) await a.flush(owner);

    const retry = await a.send(owner, [1], 600);

    expect(retry).toMatchObject({ kind: 'ok', applied: 600, outcomes: { 1: { kind: 'expired' } } });
    expect(nameOf(storage)).toBe('n600');
  });

  it('T2c: after 13 h the lost reply of seq 4 is expired and seq 4 is not re-applied', async () => {
    const { storage, world, owner, a } = await setup();
    a.accept(...range(1, 4).map((n) => rename('F', `a${n}`)));
    await a.send(owner, [1, 2, 3, 4], 0); // reply lost
    world.advance(13 * HOUR);
    const b = new TestClient(world, 'B');
    await b.open(world.process());
    expect(storedMeta(storage).retired.A).toEqual({ applied: 4, at: world.now() });
    b.accept(rename('F', 'b1'));
    await b.flush(world.process());

    const retry = await a.send(world.process(), [4], 3);

    expect(retry).toMatchObject({ kind: 'ok', applied: 4, outcomes: { 4: { kind: 'expired' } } });
    expect(nameOf(storage)).toBe('b1');
  });

  it('T2c: after 8 days the tombstone is gone and a retry is an unknown client', async () => {
    const { storage, world, owner, a } = await setup();
    a.accept(...range(1, 4).map((n) => rename('F', `a${n}`)));
    await a.send(owner, [1, 2, 3, 4], 0);
    world.advance(13 * HOUR);
    await new TestClient(world, 'B').open(world.process());
    world.advance(8 * DAY);
    await new TestClient(world, 'C').open(world.process());

    const retry = await a.send(world.process(), [4], 3);

    expect(retry).toEqual({ kind: 'unknown_client', epoch: a.epoch });
    expect(storedMeta(storage).retired).not.toHaveProperty('A');
    expect(nameOf(storage)).toBe('a4');
  });

  it.each([[[7, 7]], [[7, 9]]])('T2d: batch %j is refused whole', async (seqs) => {
    const { storage, owner, a } = await setup();
    a.accept(...range(1, 9).map((n) => rename('F', `n${n}`)));
    await a.send(owner, range(1, 6));

    const reply = await a.send(owner, seqs);

    expect(reply).toEqual({ kind: 'bad_batch' });
    expect(storedMeta(storage).clients.A.applied).toBe(6);
    expect(nameOf(storage)).toBe('n6');
  });

  it('T2f: a retired client that wakes gets 3–4 expired and 5–6 applied once', async () => {
    const { storage, world, owner, a } = await setup({ F: 'A', G: 'G' });
    a.accept(...range(1, 4).map((n) => rename('F', `a${n}`)));
    await a.send(owner, [1, 2, 3, 4], 2);
    world.advance(CLIENT_IDLE_MS);
    const b = new TestClient(world, 'B');
    await b.open(world.process());
    b.accept(rename('F', 'b1'));
    await b.flush(world.process());
    a.accept(rename('G', 'a5'), rename('G', 'a6'));

    const reply = await a.send(world.process(), [3, 4, 5, 6], 2);

    expect(reply).toMatchObject({
      kind: 'ok',
      applied: 6,
      outcomes: {
        3: { kind: 'expired' },
        4: { kind: 'expired' },
        5: { kind: 'saved' },
        6: { kind: 'saved' },
      },
    });
    expect([nameOf(storage), nameOf(storage, 'G')]).toEqual(['b1', 'a6']);
    expect(storedMeta(storage).clients.A).toMatchObject({ applied: 6 });
  });
});

describe('accepted ops in pending keys (§6.5)', () => {
  it('T3a: two tabs, restarts and mid-flight drains apply every accepted op exactly once', async () => {
    const { storage, world, a } = await setup({ FA: 'A0', FB: 'B0' });
    let owner = world.process();
    const b = new TestClient(world, 'B');
    await b.open(owner);
    const removedAbove: string[] = [];
    storage.onCall((_call, op, keys) => {
      if (op !== 'remove') return;
      const clients = storedMeta(storage).clients;
      for (const key of keys) {
        const [clientId, seq] = key.split(':').slice(-2);
        if (Number(seq) > (clients[clientId]?.applied ?? 0)) removedAbove.push(key);
      }
    });
    let seed = 7;
    const roll = () => (seed = (seed * 48271) % 2147483647) % 6;

    for (let step = 0; a.nextSeq <= 50 || b.nextSeq <= 50; step++) {
      if (a.nextSeq <= 50) a.accept(rename('FA', `A${a.nextSeq}`));
      if (b.nextSeq <= 50) b.accept(rename('FB', `B${b.nextSeq}`));
      const action = roll();
      if (action === 0) owner = world.process();
      if (action === 1) await owner.drain(KEY);
      if (action === 2) await Promise.all([owner.drain(KEY), a.flush(owner), b.flush(owner)]);
      if (action === 3) await a.flush(owner);
      if (action === 4) await Promise.all([b.flush(owner), owner.drain(KEY)]);
    }
    owner = world.process();
    await owner.drain(KEY);
    await a.flush(owner);
    await b.flush(owner);

    expect([nameOf(storage, 'FA'), nameOf(storage, 'FB')]).toEqual(['A50', 'B50']);
    expect([...a.outcomes.values(), ...b.outcomes.values()]).toHaveLength(100);
    expect([...a.outcomes.values(), ...b.outcomes.values()].every((o) => o.kind === 'saved')).toBe(
      true,
    );
    expect(removedAbove).toEqual([]);
    expect(pendingKeys(storage)).toEqual([]);
  });

  it('T3c: 600 ops left by a dead tab drain in order on the next start', async () => {
    const { storage, world, a } = await setup();
    a.accept(...range(1, 600).map((n) => rename('F', `n${n}`)));

    await world.process().drain(KEY);

    expect(nameOf(storage)).toBe('n600');
    expect(storedMeta(storage).clients.A.applied).toBe(600);
    expect(pendingKeys(storage)).toEqual([]);
  });

  it('a full drain chunk whose commit keeps failing stops and keeps its pending keys', async () => {
    const { storage, world, a } = await setup();
    a.accept(...range(1, DRAIN_CHUNK).map((n) => rename('F', `n${n}`)));
    storage.failWhen((op, keys) => op === 'set' && keys.includes(KEY));

    await world.process().drain(KEY);

    expect(storedMeta(storage).clients.A.applied).toBe(0);
    expect(pendingKeys(storage)).toHaveLength(DRAIN_CHUNK);
    storage.failWhen(null);
    await world.process().drain(KEY);
    expect(nameOf(storage)).toBe(`n${DRAIN_CHUNK}`);
  });

  it('T3e: a forged body or another site’s key is rejected and still advances the watermark', async () => {
    const { storage, world, a } = await setup();
    const entry = (seq: number, key: string, op: unknown) => ({
      v: 1,
      key,
      epoch: a.epoch,
      clientId: 'A',
      seq,
      at: world.now(),
      op,
    });
    storage.write('gvFolderOwner:pending:A:1', entry(1, KEY, { kind: 'removeFolder' }));
    storage.write('gvFolderOwner:pending:A:2', entry(2, 'gvFolderDataChatGPT', rename('F', 'X')));

    await world.process().drain(KEY);

    expect(storedMeta(storage).clients.A).toMatchObject({
      applied: 2,
      outcomes: {
        1: { kind: 'rejected', reason: 'invalid_payload' },
        2: { kind: 'rejected', reason: 'invalid_payload' },
      },
    });
    expect(nameOf(storage)).toBe('A');
  });

  it('T4d: while owner reads fail nothing is written, and the op applies once afterwards', async () => {
    const { storage, world, a } = await setup();
    a.accept(rename('F', 'B'));
    const before = storage.snapshot();

    for (let turn = 0; turn < 3; turn++) {
      storage.inject({ call: storage.calls() + 1, land: 'none', crash: false });
      expect(await a.send(world.process(), [1])).toEqual({
        kind: 'refused',
        reason: 'read_failed',
      });
    }
    expect(storage.snapshot()).toEqual(before);
    const reply = await a.send(world.process(), [1]);

    expect(reply).toMatchObject({ kind: 'ok', applied: 1, outcomes: { 1: { kind: 'saved' } } });
    expect(nameOf(storage)).toBe('B');
  });
});
