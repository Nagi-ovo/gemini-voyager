import { describe, expect, it } from 'vitest';

import { hashValue } from '@/core/utils/canonicalHash';

import { ownerBackupKey, resolveOwnerState } from '../folderOwnerState';
import { type Fault, type StorageOp, createFaultyStorage } from './faultyStorage';
import {
  ALL_OWNER,
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

async function setup(accepted = true) {
  const storage = createFaultyStorage({ [KEY]: folderData([folder('F', 'A')]) });
  const world = createWorld(storage);
  const a = new TestClient(world, 'A');
  await a.open(world.process());
  if (accepted) a.accept(rename('F', 'B'));
  return { storage, world, a };
}

/** Every storage call of one clean data turn, with each way it can fail. */
async function faultPlan(): Promise<Array<Omit<Fault, 'call'> & { offset: number }>> {
  const { storage, world, a } = await setup();
  const turn: Array<{ op: StorageOp; keys: string[] }> = [];
  storage.onCall((_call, op, keys) => void turn.push({ op, keys }));
  await a.send(world.process(), [1]);
  return turn.flatMap(({ op, keys }, index) => {
    const lands: Fault['land'][] =
      op === 'get'
        ? ['none']
        : keys.length > 1
          ? ['none', 'all', ...keys.map((k) => [k])]
          : ['none', 'all'];
    return lands.flatMap((land) =>
      [true, false].map((crash) => ({ offset: index + 1, land, crash })),
    );
  });
}

describe('commit under partial writes (§6.4)', () => {
  it('T4e/T11: every crash point and partial pattern resolves to prev or next and resends end serially', async () => {
    const plan = await faultPlan();
    expect(plan.length).toBeGreaterThan(10);

    for (const { offset, land, crash } of plan) {
      const label = JSON.stringify({ offset, land, crash });
      const { storage, world, a } = await setup();
      storage.inject({ call: storage.calls() + offset, land, crash });
      const reply = await a.send(world.process(), [1]).catch(() => null);
      storage.restart();

      const state = await resolveOwnerState(
        storage.area,
        KEY,
        world.now(),
        () => 'new-epoch',
        ALL_OWNER,
      );
      expect(state.kind, label).toBe('ready');
      if (state.kind !== 'ready') continue;
      const name = storedData(storage).folders[0].name;
      expect(['A', 'B'], label).toContain(name);
      expect(state.meta.dataHash, label).toBe(await hashValue(storage.read(KEY)));
      expect(state.meta.clients.A.applied === 1, label).toBe(name === 'B');
      if (reply?.kind === 'ok') expect(state.meta.clients.A.applied, label).toBe(1);

      // Another tab renames after recovery; A then resends. Serial result: B's name wins.
      const owner = world.process();
      const b = new TestClient(world, 'B');
      await b.open(owner);
      b.accept(rename('F', 'C'));
      await b.flush(owner);
      const resend = await a.send(owner, [1]);
      expect(resend.kind, label).toBe('ok');
      expect(storedData(storage).folders[0].name, label).toBe('C');
      expect(storedMeta(storage).clients.A.applied, label).toBe(1);
      expect(pendingKeys(storage), label).toEqual([]);
    }
  });
});

describe('an abandoned data intent', () => {
  it('does not roll back another client’s later meta-only commit', async () => {
    const { storage, world, a } = await setup(false);
    const owner = world.process();
    const b = new TestClient(world, 'B');
    await b.open(owner); // registered before A accepts, so this open drains nothing
    a.accept(rename('F', 'B'));
    // A's intent lands; its K+meta set lands neither key.
    storage.failWhen((op, keys) => op === 'set' && keys.includes(KEY));
    expect(await a.send(owner, [1])).toEqual({ kind: 'refused', reason: 'write_failed' });
    storage.failWhen(null);
    b.accept(rename('F', 'A'), rename('F', 'B2'));
    const first = await b.send(owner, [1]); // a no-op: meta-only commit at the intent's nextRev

    const next = await b.send(world.process(), [2]);
    const retry = await b.send(world.process(), [1]);

    expect(first).toMatchObject({ kind: 'ok', outcomes: { 1: { kind: 'unchanged' } } });
    expect(next).toMatchObject({ kind: 'ok', applied: 2, outcomes: { 2: { kind: 'saved' } } });
    expect(retry).toMatchObject({ kind: 'ok', outcomes: { 1: { kind: 'unchanged' } } });
    expect(storedData(storage).folders[0].name).toBe('B2');
  });
});

describe('foreign writes (§6.4)', () => {
  it('adopts a foreign value only after a verified copy of it exists', async () => {
    const { storage, world, a } = await setup(false);
    const foreign = folderData([folder('F', 'Foreign')]);
    storage.write(KEY, foreign);
    const rev = storedMeta(storage).rev;

    const reply = await a.open(world.process());

    expect(reply).toMatchObject({ kind: 'ready', data: foreign });
    expect(storage.read(ownerBackupKey(KEY, 'foreign'))).toMatchObject({ value: foreign, rev });
    expect(storedMeta(storage)).toMatchObject({
      dataHash: await hashValue(foreign),
      foreignAt: world.now(),
    });
  });

  it('holds a drained op accepted before the foreign write instead of applying it', async () => {
    const { storage, world } = await setup();
    world.advance(1000);
    storage.write(KEY, folderData([folder('F', 'Foreign')]));

    const reply = await new TestClient(world, 'B').open(world.process());

    expect(reply).toMatchObject({ held: [{ clientId: 'A', from: 1, reason: 'foreign_write' }] });
    expect(storedData(storage).folders[0].name).toBe('Foreign');
    expect(pendingKeys(storage)).toEqual(['gvFolderOwner:pending:A:1']);
  });

  it('treats a removed K as invalid, never as empty', async () => {
    const { storage, world, a } = await setup();
    await storage.area.remove([KEY]);

    expect(await a.open(world.process())).toMatchObject({ kind: 'invalid' });
    expect(await a.send(world.process(), [1])).toEqual({
      kind: 'refused',
      reason: 'invalid_state',
    });
    expect(storage.read(KEY)).toBeUndefined();
  });
});
