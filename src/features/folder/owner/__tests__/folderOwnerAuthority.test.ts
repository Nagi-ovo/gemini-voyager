import { describe, expect, it } from 'vitest';

import { hashValue } from '@/core/utils/canonicalHash';

import type { FolderAuthority } from '../authority';
import { BUNDLE_INTENT_KEY, resolveBundleIntent } from '../bundleIntent';
import { createFolderOwnerCore } from '../folderOwnerCore';
import type { FolderSite } from '../folderOwnerPolicy';
import { ownerBackupKey, ownerMetaKey } from '../folderOwnerState';
import { createFaultyStorage } from './faultyStorage';
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
} from './ownerHarness';

const AI_STUDIO = 'gvFolderDataAIStudio';
const AI_STUDIO_LEGACY: Record<FolderSite, FolderAuthority> = { ...ALL_OWNER, aistudio: 'legacy' };

/** AI Studio under an owner build (P4b): a registered client with 3 accepted, undrained ops. */
async function ownedThenRolledBack() {
  const storage = createFaultyStorage({ [AI_STUDIO]: folderData([folder('F', 'A')]) });
  const world = createWorld(storage);
  const tab = new TestClient(world, 'S', AI_STUDIO);
  await tab.open(world.process());
  tab.accept(rename('F', 'B'), rename('F', 'C'), rename('F', 'D'));
  const rolledBack = createFolderOwnerCore({
    area: storage.area,
    authority: AI_STUDIO_LEGACY,
    now: world.now,
  });
  return { storage, world, tab, rolledBack };
}

// T24a, the AI Studio half (addendum P3P4 R5.1, R5.3). Bundles wait for the reviewed contract.
describe('running-build authority (R5.1)', () => {
  it('leaves a legacy site’s K and sidecars untouched through every owner entry point', async () => {
    const { storage, tab, rolledBack } = await ownedThenRolledBack();
    const meta = storage.read(ownerMetaKey(AI_STUDIO));
    const calls = storage.calls();

    await expect(
      rolledBack.open({ key: AI_STUDIO, clientId: 'S', ackedThrough: 0 }),
    ).resolves.toEqual({ kind: 'refused', reason: 'not_owner' });
    await expect(tab.send(rolledBack, [1, 2, 3])).resolves.toEqual({
      kind: 'refused',
      reason: 'not_owner',
    });
    await expect(rolledBack.snapshot({ key: AI_STUDIO, clientId: 'S' })).resolves.toEqual({
      kind: 'refused',
      reason: 'not_owner',
    });
    await rolledBack.drain(AI_STUDIO);
    const held = { key: AI_STUDIO, clientId: 'S', heldClientId: 'S', decision: 'apply' as const };
    await expect(rolledBack.held(held)).resolves.toEqual({ kind: 'refused', reason: 'not_owner' });
    const journal = { key: AI_STUDIO, clientId: 'S', journalClientId: 'S', ops: [] };
    await expect(rolledBack.adoptJournal(journal)).resolves.toEqual({
      kind: 'refused',
      reason: 'not_owner',
    });

    expect(storage.calls()).toBe(calls);
    expect(storage.read(ownerMetaKey(AI_STUDIO))).toEqual(meta);
    expect(pendingKeys(storage)).toHaveLength(3);
  });

  it('holds the ops accepted before a legacy write once the site is owned again', async () => {
    const { storage, world, rolledBack } = await ownedThenRolledBack();
    // Legacy AI Studio tabs write K directly while the owner build leaves it alone.
    world.advance(60_000);
    storage.write(AI_STUDIO, folderData([folder('F', 'A'), folder('L', 'Legacy edit')]));
    await rolledBack.drain(AI_STUDIO);
    expect(storage.read(ownerBackupKey(AI_STUDIO, 'foreign'))).toBeUndefined();

    world.advance(60_000);
    await world.process().drain(AI_STUDIO);

    expect(storedData(storage, AI_STUDIO).folders.map((f) => f.name)).toEqual(['A', 'Legacy edit']);
    const meta = storage.read(ownerMetaKey(AI_STUDIO)) as {
      clients: Record<string, { applied: number; held?: { from: number; reason: string } }>;
    };
    expect(meta.clients.S).toMatchObject({
      applied: 0,
      held: { from: 1, reason: 'foreign_write' },
    });
    expect(pendingKeys(storage)).toHaveLength(3);
  });

  it('abandons an open bundle of a legacy site with a status-only write (R5.2)', async () => {
    const legacyK = folderData([folder('S', 'legacy value')]);
    const next = {
      [AI_STUDIO]: folderData([folder('S', 'bundle value')]),
      [ownerMetaKey(AI_STUDIO)]: { stale: true },
      gvPromptItems: ['bundle prompt'],
    };
    const prev: Record<string, unknown> = { [AI_STUDIO]: legacyK, gvPromptItems: ['user prompt'] };
    const keys: Record<string, { prevHash: string; nextHash: string }> = {};
    for (const [key, value] of Object.entries(next)) {
      keys[key] = { prevHash: await hashValue(prev[key]), nextHash: await hashValue(value) };
    }
    // A well-formed intent this build could roll forward if it owned AI Studio.
    const open = {
      v: 1,
      txId: 'tx',
      status: 'open',
      site: 'aistudio',
      seq: 4,
      clientId: 'S',
      keys,
      values: next,
      at: 0,
    };
    const storage = createFaultyStorage({
      [KEY]: folderData([folder('F', 'A')]),
      [AI_STUDIO]: legacyK,
      gvPromptItems: ['user prompt'],
      [BUNDLE_INTENT_KEY]: open,
    });
    const world = createWorld(storage, undefined, AI_STUDIO_LEGACY);
    const tab = new TestClient(world, 'G');
    const before = storage.snapshot();
    const writes: string[][] = [];
    storage.onCall((_, op, keys) => {
      if (op !== 'get') writes.push(keys);
    });

    // What the shared queue's prelude runs before a prompt-owner turn.
    await expect(resolveBundleIntent(storage.area, AI_STUDIO_LEGACY, world.now)).resolves.toBe(
      'ok',
    );

    expect(writes).toEqual([[BUNDLE_INTENT_KEY]]);
    expect(storage.read(BUNDLE_INTENT_KEY)).toEqual({
      v: 1,
      txId: 'tx',
      status: 'abandoned',
      at: world.now(),
    });
    expect({ ...storage.snapshot(), [BUNDLE_INTENT_KEY]: open }).toEqual(before);

    storage.onCall(null);
    await tab.open(world.process());
    await tab.send(world.process(), tab.accept(rename('F', 'B')));
    expect(storedData(storage).folders[0].name).toBe('B');
    expect(storage.read(AI_STUDIO)).toEqual(legacyK);
    expect(storage.read('gvPromptItems')).toEqual(['user prompt']);
  });
});
