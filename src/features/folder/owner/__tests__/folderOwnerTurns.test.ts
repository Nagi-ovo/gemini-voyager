import { describe, expect, it } from 'vitest';

import type { FolderAuthority } from '../authority';
import type { FolderSite } from '../folderOwnerPolicy';
import { OWNER_INDEX_KEY, ownerMetaKey } from '../folderOwnerState';
import { drainOwnedKeys } from '../ownerStartup';
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

const AI_STUDIO = 'gvFolderDataAIStudio';
const authority = (gemini: FolderAuthority): Record<FolderSite, FolderAuthority> => ({
  gemini,
  aistudio: 'legacy',
  chatgpt: 'legacy',
});

/** Gemini and AI Studio keys, each with one registered client and one accepted, undrained op. */
async function twoSites() {
  const storage = createFaultyStorage({
    [KEY]: folderData([folder('F', 'A')]),
    [AI_STUDIO]: folderData([folder('F', 'A')]),
  });
  const world = createWorld(storage);
  const owner = world.process();
  const gemini = new TestClient(world, 'G', KEY);
  const aistudio = new TestClient(world, 'S', AI_STUDIO);
  await gemini.open(owner);
  await aistudio.open(owner);
  gemini.accept(rename('F', 'B'));
  aistudio.accept(rename('F', 'B'));
  return { storage, world };
}

describe('startup authority gate', () => {
  it('with every site legacy, touches no storage even with indexed keys and pending ops', async () => {
    const { storage, world } = await twoSites();
    const calls = storage.calls();

    await drainOwnedKeys(storage.area, world.process(), authority('legacy'));

    expect(storage.calls()).toBe(calls);
    expect(pendingKeys(storage)).toHaveLength(2);
  });

  it('drains only the keys of owner sites and leaves a legacy site’s sidecars frozen', async () => {
    const { storage, world } = await twoSites();
    expect(storage.read(OWNER_INDEX_KEY)).toEqual([KEY, AI_STUDIO]);
    const aiStudioMeta = storage.read(ownerMetaKey(AI_STUDIO));

    await drainOwnedKeys(storage.area, world.process(), authority('owner'));

    expect(storedData(storage).folders[0].name).toBe('B');
    expect(storedData(storage, AI_STUDIO).folders[0].name).toBe('A');
    expect(storage.read(ownerMetaKey(AI_STUDIO))).toEqual(aiStudioMeta);
    expect(pendingKeys(storage)).toEqual(['gvFolderOwner:pending:S:1']);
  });
});

describe('ack and snapshot (§6.2)', () => {
  async function savedOnce() {
    const storage = createFaultyStorage({ [KEY]: folderData([folder('F', 'A')]) });
    const world = createWorld(storage);
    const owner = world.process();
    const a = new TestClient(world, 'A');
    await a.open(owner);
    a.accept(rename('F', 'B'));
    await a.send(owner, [1]);
    return { storage, world, owner, a };
  }

  it('an ack writes nothing itself and drops the outcome on the next commit of its key', async () => {
    const { storage, world, owner } = await savedOnce();
    const calls = storage.calls();

    owner.ack({ key: KEY, clientId: 'A', ackedThrough: 1 });
    expect(storage.calls()).toBe(calls);
    expect(storedMeta(storage).clients.A.outcomes[1]).toBeDefined();

    await new TestClient(world, 'B').open(owner);
    expect(storedMeta(storage).clients.A).toMatchObject({ acked: 1, outcomes: {} });
  });

  it('keeps an ack that arrives while a commit is in flight for the following commit', async () => {
    const { storage, world, owner } = await savedOnce();
    let armed = true;
    storage.onCall((_call, op, keys) => {
      if (!armed || op !== 'set' || !keys.includes(ownerMetaKey(KEY))) return;
      armed = false;
      owner.ack({ key: KEY, clientId: 'A', ackedThrough: 1 });
    });
    await new TestClient(world, 'B').open(owner);
    expect(storedMeta(storage).clients.A.acked).toBe(0);

    await new TestClient(world, 'C').open(owner);

    expect(storedMeta(storage).clients.A).toMatchObject({ acked: 1, outcomes: {} });
  });

  it('a snapshot shows a client the watermark and value a drain reached without it', async () => {
    const storage = createFaultyStorage({ [KEY]: folderData([folder('F', 'A')]) });
    const world = createWorld(storage);
    const a = new TestClient(world, 'A');
    await a.open(world.process());
    a.accept(rename('F', 'B'));
    const other = world.process();
    await new TestClient(world, 'B').open(other); // drains A's seq 1

    const snapshot = await other.snapshot({ key: KEY, clientId: 'A' });

    expect(snapshot).toMatchObject({ kind: 'ready', applied: 1, epoch: a.epoch });
    expect(snapshot.kind === 'ready' && snapshot.data.folders[0].name).toBe('B');
  });
});
