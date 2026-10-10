import { describe, expect, it } from 'vitest';

import { pendingOpKey } from '../folderOwnerState';
import { CLIENT_IDLE_MS, TOMBSTONE_TTL_MS } from '../ownerCollect';
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

async function setup() {
  const storage = createFaultyStorage({ [KEY]: folderData([folder('F', 'A')]) });
  const world = createWorld(storage);
  const c = new TestClient(world, 'C');
  await c.open(world.process());
  return { storage, world, c };
}

const nameOf = (storage: ReturnType<typeof createFaultyStorage>) =>
  storedData(storage).folders[0].name;

// DESIGN-v2-addendum-P0.md §1: retirement versus a racing publisher.
describe('addendum §1: retirement never orphans an accepted op', () => {
  it('an op published between the GC probe and the retirement commit is applied after restart', async () => {
    const { storage, world, c } = await setup();
    world.advance(CLIENT_IDLE_MS);
    let probed = false;
    storage.onCall((_call, op, keys) => {
      if (probed) {
        c.accept(rename('F', 'C1')); // the tab's pending set lands, then the tab closes
        probed = false;
        storage.onCall(null);
      }
      probed = op === 'get' && keys.length === 1 && keys[0] === pendingOpKey('C', 1);
    });
    await new TestClient(world, 'B').open(world.process());
    expect(storedMeta(storage).retired).toHaveProperty('C');

    await world.process().drain(KEY);

    expect(nameOf(storage)).toBe('C1');
    expect(storedMeta(storage).clients.C).toMatchObject({ applied: 1 });
    expect(pendingKeys(storage)).toEqual([]);
  });

  it('a retired client’s live apply and a startup drain apply its op once', async () => {
    const { storage, world, c } = await setup();
    c.accept(rename('F', 'C1'));
    await c.flush(world.process());
    world.advance(CLIENT_IDLE_MS);
    const b = new TestClient(world, 'B');
    await b.open(world.process());
    expect(storedMeta(storage).retired.C).toMatchObject({ applied: 1 });
    c.accept(rename('F', 'C2'));
    await world.process().drain(KEY);
    b.accept(rename('F', 'B1'));
    await b.flush(world.process());

    const reply = await c.flush(world.process());

    expect(reply).toMatchObject({ kind: 'ok', outcomes: { 2: { kind: 'saved' } } });
    expect(nameOf(storage)).toBe('B1');
  });

  it('a gap left by a partial pending set neither blocks retirement nor leaks keys', async () => {
    const { storage, world } = await setup();
    storage.write(pendingOpKey('C', 2), {
      v: 1,
      key: KEY,
      epoch: '',
      clientId: 'C',
      seq: 2,
      at: 0,
      op: {},
    });
    world.advance(CLIENT_IDLE_MS);
    await new TestClient(world, 'B').open(world.process());
    expect(storedMeta(storage).retired).toHaveProperty('C');
    expect(storedMeta(storage).clients).not.toHaveProperty('C');

    world.advance(TOMBSTONE_TTL_MS);
    await new TestClient(world, 'D').open(world.process());

    expect(storedMeta(storage).retired).not.toHaveProperty('C');
    expect(pendingKeys(storage)).toEqual([]);
    expect(nameOf(storage)).toBe('A');
  });
});

describe('addendum §1: stray cleanup', () => {
  it('keeps an expired tombstone until its strays are actually removed', async () => {
    const { storage, world } = await setup();
    for (const seq of [2, 3]) {
      storage.write(pendingOpKey('C', seq), {
        v: 1,
        key: KEY,
        epoch: '',
        clientId: 'C',
        seq,
        at: 0,
        op: {},
      });
    }
    world.advance(CLIENT_IDLE_MS);
    await new TestClient(world, 'B').open(world.process());
    world.advance(TOMBSTONE_TTL_MS);
    // The stray removal lands only seq 2, then throws.
    storage.failWhen((op) => op === 'remove', [pendingOpKey('C', 2)]);
    await new TestClient(world, 'D').open(world.process());
    expect(storedMeta(storage).retired).toHaveProperty('C');
    expect(pendingKeys(storage)).toEqual([pendingOpKey('C', 3)]);

    storage.failWhen(null);
    await new TestClient(world, 'E').open(world.process());

    expect(storedMeta(storage).retired).not.toHaveProperty('C');
    expect(pendingKeys(storage)).toEqual([]);
  });

  it('clears a key left at the watermark by a crash after commit once the tombstone expires', async () => {
    const { storage, world, c } = await setup();
    c.accept(rename('F', 'C1'));
    // Turn calls: bundle get, state get, intent set, K+meta set, then the pending remove.
    storage.inject({ call: storage.calls() + 5, land: 'none', crash: true });
    await c.flush(world.process()).catch(() => null);
    storage.restart();
    expect(pendingKeys(storage)).toEqual([pendingOpKey('C', 1)]);

    world.advance(CLIENT_IDLE_MS);
    await new TestClient(world, 'B').open(world.process());
    world.advance(TOMBSTONE_TTL_MS);
    await new TestClient(world, 'D').open(world.process());

    expect(nameOf(storage)).toBe('C1');
    expect(pendingKeys(storage)).toEqual([]);
  });
});

// DESIGN-v2-addendum-P0.md §2: a drain does not consume the only delivery of an outcome.
describe('addendum §2: a drained op’s outcome reaches its client', () => {
  it('returns the rejection of an op another turn drained before the client sent it', async () => {
    const { world, c } = await setup();
    c.accept(rename('missing', 'X'));
    await new TestClient(world, 'B').open(world.process()); // drains C.seq1

    const reply = await c.flush(world.process());

    expect(reply).toMatchObject({
      kind: 'ok',
      applied: 1,
      outcomes: { 1: { kind: 'rejected', reason: 'folder_missing' } },
    });
  });
});
