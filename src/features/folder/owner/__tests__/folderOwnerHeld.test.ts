import { describe, expect, it } from 'vitest';

import { ownerIntentKey, ownerMetaKey } from '../folderOwnerState';
import { createFaultyStorage } from './faultyStorage';
import {
  KEY,
  TestClient,
  conversation,
  createWorld,
  folder,
  folderData,
  pendingKeys,
  rename,
  storedData,
  storedMeta,
} from './ownerHarness';

const DAY = 24 * 60 * 60 * 1000;
const START = folderData([folder('F', 'A'), folder('W', 'Work')], { W: [conversation('c1')] });
const names = (data: { folders: Array<{ id: string; name: string }> }) =>
  data.folders.map((f) => `${f.id}:${f.name}`);

/** Tab A accepted a rename and a removal, then a foreign write landed and a drain held them. */
async function heldAfterForeignWrite() {
  const storage = createFaultyStorage({ [KEY]: START });
  const world = createWorld(storage);
  const tab = new TestClient(world, 'A');
  await tab.open(world.process());
  tab.accept(rename('F', 'B'), { kind: 'removeFolder', folderId: 'W' });
  world.advance(1000);
  storage.write(KEY, folderData([...START.folders, folder('X', 'Foreign')], START.folderContents));
  await world.process().drain(KEY);
  expect(storedMeta(storage).clients.A.held).toEqual({ from: 1, reason: 'foreign_write' });
  return { storage, world, tab };
}

describe('held ops (§6.5, §7.8)', () => {
  it('applying runs the non-destructive ops once on the current value and never the removal', async () => {
    const { storage, world, tab } = await heldAfterForeignWrite();

    const reply = await world.process().held({
      key: KEY,
      clientId: 'panel',
      heldClientId: 'A',
      decision: 'apply',
    });

    expect(reply).toMatchObject({
      kind: 'resolved',
      applied: 2,
      outcomes: { 1: { kind: 'saved' }, 2: { kind: 'rejected', reason: 'not_reapplied' } },
    });
    expect(names(storedData(storage))).toEqual(['F:B', 'W:Work', 'X:Foreign']);
    expect(storedMeta(storage).clients.A.held).toBeUndefined();
    expect(pendingKeys(storage)).toEqual([]);
    // The tab's own resend is a duplicate under the same watermark.
    const resend = await tab.send(world.process(), [1, 2]);
    expect(resend).toMatchObject({ kind: 'ok', applied: 2 });
    expect(names(storedData(storage))).toEqual(['F:B', 'W:Work', 'X:Foreign']);
  });

  it('discarding advances the watermark past the ops and changes no data', async () => {
    const { storage, world } = await heldAfterForeignWrite();
    const before = storedData(storage);

    const reply = await world.process().held({
      key: KEY,
      clientId: 'panel',
      heldClientId: 'A',
      decision: 'discard',
    });

    expect(reply).toMatchObject({
      kind: 'resolved',
      applied: 2,
      outcomes: { 1: { reason: 'discarded_by_user' }, 2: { reason: 'discarded_by_user' } },
    });
    expect(storedData(storage)).toEqual(before);
    expect(pendingKeys(storage)).toEqual([]);
  });

  it('T1e: a live tab’s own apply after a foreign write is never held', async () => {
    const { storage, world, tab } = await heldAfterForeignWrite();

    await tab.send(world.process(), [1]);

    expect(names(storedData(storage))).toEqual(['F:B', 'W:Work', 'X:Foreign']);
    expect(storedMeta(storage).clients.A).toMatchObject({ applied: 1 });
    expect(storedMeta(storage).clients.A.held).toBeUndefined();
  });

  it.each([
    ['one held op', 1],
    ['a full chunk of held ops', 40],
  ])(
    'refuses with write_failed, never a saved outcome, when the commit of %s fails',
    async (_name, count) => {
      const storage = createFaultyStorage({ [KEY]: START });
      const world = createWorld(storage);
      const tab = new TestClient(world, 'A');
      await tab.open(world.process());
      tab.accept(...Array.from({ length: count }, (_, n) => rename('F', `n${n}`)));
      world.advance(1000);
      storage.write(
        KEY,
        folderData([...START.folders, folder('X', 'Foreign')], START.folderContents),
      );
      await world.process().drain(KEY);
      // Every K + meta write fails after its intent landed.
      storage.failWhen((op, keys) => op === 'set' && keys.includes(ownerMetaKey(KEY)));

      const reply = await world.process().held({
        key: KEY,
        clientId: 'panel',
        heldClientId: 'A',
        decision: 'apply',
      });

      expect(reply).toEqual({ kind: 'refused', reason: 'write_failed' });
      storage.failWhen(null);
      expect(storedData(storage).folders[0].name).toBe('A');
      expect(storedMeta(storage).clients.A).toMatchObject({ applied: 0 });
      expect(pendingKeys(storage)).toHaveLength(count);
    },
  );

  it('T9: an accepted op 40 days old with no foreign write since is drained and applied', async () => {
    const storage = createFaultyStorage({ [KEY]: START });
    const world = createWorld(storage);
    const tab = new TestClient(world, 'A');
    await tab.open(world.process());
    tab.accept(rename('F', 'Old'));
    world.advance(40 * DAY);

    await world.process().drain(KEY);

    expect(storedData(storage).folders[0].name).toBe('Old');
    expect(pendingKeys(storage)).toEqual([]);
  });
});

describe('epoch creation scan (§7.8)', () => {
  it('registers a client whose accepted ops outlived the meta as held, then applies them once', async () => {
    const storage = createFaultyStorage({ [KEY]: START });
    const world = createWorld(storage);
    const tab = new TestClient(world, 'A');
    await tab.open(world.process());
    await tab.send(world.process(), tab.accept(rename('F', 'one')));
    tab.accept(rename('F', 'two'), rename('F', 'three'));
    // Meta and its intent are both gone (cleared or destroyed), so nothing rolls meta forward.
    await storage.area.remove([ownerMetaKey(KEY), ownerIntentKey(KEY)]);

    const reply = await new TestClient(world, 'B').open(world.process());

    expect(reply).toMatchObject({ held: [{ clientId: 'A', from: 2, reason: 'epoch_changed' }] });
    expect(storedData(storage).folders[0].name).toBe('one');
    await world.process().held({ key: KEY, clientId: 'B', heldClientId: 'A', decision: 'apply' });
    expect(storedData(storage).folders[0].name).toBe('three');
    expect(pendingKeys(storage)).toEqual([]);
  });
});

describe('adoptJournal (§6.5)', () => {
  it('T3f: a journaled op that was drained since is a duplicate; the rest apply, never a removal', async () => {
    const storage = createFaultyStorage({ [KEY]: START });
    const world = createWorld(storage);
    const tab = new TestClient(world, 'A');
    await tab.open(world.process());
    tab.accept(rename('F', 'B'));
    await world.process().drain(KEY);

    const reply = await world.process().adoptJournal({
      key: KEY,
      clientId: 'C',
      journalClientId: 'A',
      ops: [
        { seq: 1, body: rename('F', 'B') },
        { seq: 2, body: { kind: 'createFolder', folderId: 'J', name: 'Journal', parentId: null } },
        { seq: 3, body: { kind: 'removeFolder', folderId: 'W' } },
      ],
    });

    expect(reply).toMatchObject({
      kind: 'adopted',
      clientId: 'A',
      outcomes: {
        1: { kind: 'saved' },
        2: { kind: 'saved' },
        3: { kind: 'rejected', reason: 'not_reapplied' },
      },
    });
    expect(names(storedData(storage))).toEqual(['F:B', 'W:Work', 'J:Journal']);
    expect(storedMeta(storage).clients.A.applied).toBe(3);
  });

  it('drains the journal client’s accepted lower seqs first, so none is skipped', async () => {
    const storage = createFaultyStorage({ [KEY]: START });
    const world = createWorld(storage);
    const tab = new TestClient(world, 'A');
    await tab.open(world.process());
    tab.accept(rename('F', 'accepted'));

    const reply = await world.process().adoptJournal({
      key: KEY,
      clientId: 'C',
      journalClientId: 'A',
      ops: [{ seq: 2, body: { kind: 'createFolder', folderId: 'J', name: 'J', parentId: null } }],
    });

    expect(reply).toMatchObject({ kind: 'adopted', outcomes: { 2: { kind: 'saved' } } });
    expect(names(storedData(storage))).toEqual(['F:accepted', 'W:Work', 'J:J']);
  });

  it('applies a journal of an unknown page under a fresh client', async () => {
    const storage = createFaultyStorage({ [KEY]: START });
    const world = createWorld(storage);
    await new TestClient(world, 'B').open(world.process());

    const reply = await world.process().adoptJournal({
      key: KEY,
      clientId: 'B',
      journalClientId: 'gone',
      ops: [{ seq: 7, body: rename('F', 'Journal') }],
    });

    expect(reply).toMatchObject({ kind: 'adopted', outcomes: { 1: { kind: 'saved' } } });
    expect(reply).not.toMatchObject({ clientId: 'gone' });
    expect(storedData(storage).folders[0].name).toBe('Journal');
  });
});
