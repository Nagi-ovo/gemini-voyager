import { describe, expect, it } from 'vitest';

import { hashValue } from '@/core/utils/canonicalHash';
import {
  PROMPT_LIBRARY_KEY,
  createPromptLibraryOwner,
} from '@/features/prompt/library/promptLibraryOwner';
import { createWriteQueue } from '@/features/storage/writeQueue';

import { FOLDER_WRITE_AUTHORITY } from '../authority';
import { AUTHORITY_FENCE_KEY, writeAuthorityFence } from '../authorityFence';
import { BUNDLE_INTENT_KEY, resolveBundleIntent, writeBundle } from '../bundleIntent';
import { createBundleRecovery } from '../bundleRecovery';
import { INTERRUPTED } from '../folderOps';
import { createFolderOwnerCore } from '../folderOwnerCore';
import { ownerBackupKey, ownerMetaKey } from '../folderOwnerState';
import { drainOwnedKeys } from '../ownerStartup';
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
  storedMeta,
} from './ownerHarness';

const AI_STUDIO = 'gvFolderDataAIStudio';
const AI_LEGACY = { ...ALL_OWNER, aistudio: 'legacy' as const };
const PROMPT = { id: 'p', name: 'Prompt', text: 'original' };

/** A worker dies after the bundle's meta lands, leaving a durable pending receipt. */
async function openBundle(key: string) {
  const storage = createFaultyStorage({
    [key]: folderData([folder('F', 'Original')]),
    [PROMPT_LIBRARY_KEY]: [PROMPT],
  });
  const world = createWorld(storage);
  const cloud = new TestClient(world, 'cloud', key);
  const ordinary = new TestClient(world, 'ordinary', key);
  const owner = world.process();
  await cloud.open(owner);
  await ordinary.open(owner);
  const nextK = folderData([folder('F', 'Merged')]);
  const meta = storedMeta(storage, key);
  const nextMeta = {
    ...meta,
    rev: meta.rev + 1,
    dataHash: await hashValue(nextK),
    clients: {
      ...meta.clients,
      cloud: {
        ...meta.clients.cloud,
        applied: 1,
        outcomes: { 1: { kind: 'bundle_pending' as const, txId: 'tx' } },
      },
    },
  };
  ordinary.accept(rename('F', 'B'), rename('F', 'C'), rename('F', 'D'));
  cloud.bodies.set(1, { kind: 'cloudMerge', mode: 'merge', payload: {} });
  cloud.nextSeq = 2;
  storage.inject({ call: storage.calls() + 3, land: [ownerMetaKey(key)], crash: true });
  await writeBundle(storage.area, {
    txId: 'tx',
    site: key === AI_STUDIO ? 'aistudio' : 'gemini',
    seq: 1,
    clientId: 'cloud',
    at: world.now(),
    values: {
      [key]: nextK,
      [ownerMetaKey(key)]: nextMeta,
      [PROMPT_LIBRARY_KEY]: [{ ...PROMPT, text: 'merged' }],
    },
  }).catch(() => undefined);
  storage.restart();
  expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open', txId: 'tx' });
  expect(storedMeta(storage, key).clients.cloud.outcomes[1]).toEqual({
    kind: 'bundle_pending',
    txId: 'tx',
  });
  return { storage, world, cloud };
}

describe('intermediate rollback and re-upgrade (R5.1–R5.3)', () => {
  it('R5.2: abandons an unknown bundle version without reading or changing its participant keys', async () => {
    const { storage, world } = await openBundle(AI_STUDIO);
    const open = storage.read(BUNDLE_INTENT_KEY) as Record<string, unknown>;
    storage.write(BUNDLE_INTENT_KEY, { ...open, v: 2 });
    const before = storage.snapshot();
    const reads: string[][] = [];
    const writes: string[][] = [];
    storage.onCall((_call, op, keys) => {
      if (op === 'get') reads.push(keys);
      else writes.push(keys);
    });

    expect(await resolveBundleIntent(storage.area, ALL_OWNER, world.now)).toBe('ok');

    expect(reads).toEqual([[BUNDLE_INTENT_KEY]]);
    expect(writes).toEqual([[BUNDLE_INTENT_KEY]]);
    expect(storage.snapshot()).toEqual({
      ...before,
      [BUNDLE_INTENT_KEY]: { v: 1, txId: 'tx', status: 'abandoned', at: world.now() },
    });
  });

  it('R5.2: a failing abandon write blocks only the turns that read the abandoned bundle’s keys', async () => {
    const { storage, world } = await openBundle(AI_STUDIO);
    storage.failWhen((op, keys) => op === 'set' && keys.includes(BUNDLE_INTENT_KEY));
    const queue = createWriteQueue();
    const recovery = createBundleRecovery({
      area: storage.area,
      authority: AI_LEGACY,
      serialize: queue,
      subscribe: () => () => {},
      setTimer: () => () => {},
    });
    queue.setPrelude(recovery.prelude);
    recovery.start();
    const gemini = createFolderOwnerCore({
      area: storage.area,
      authority: AI_LEGACY,
      now: world.now,
      serialize: queue,
    });
    const prompts = createPromptLibraryOwner({
      area: { get: (key) => storage.area.get([key]), set: storage.area.set },
      serialize: queue,
    });

    await expect(
      gemini.open({ key: KEY, clientId: 'tab', ackedThrough: 0 }),
    ).resolves.toMatchObject({ kind: 'empty' });
    await expect(prompts.read()).rejects.toThrow('write_failed');
    expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
    recovery.stop();
  });

  it('T24a: freezes the rolled-back site while prompt turns commit, then holds old ops without replay', async () => {
    const { storage, world, cloud } = await openBundle(AI_STUDIO);
    const queue = createWriteQueue();
    queue.setPrelude(async () => {
      const result = await resolveBundleIntent(storage.area, AI_LEGACY, world.now);
      if (result !== 'ok') throw new Error(result);
    });
    const rollback = createFolderOwnerCore({
      area: storage.area,
      authority: AI_LEGACY,
      now: world.now,
      serialize: queue,
    });
    await writeAuthorityFence(storage.area, 'P4a', AI_LEGACY);
    world.advance(60_000);
    const legacyK = folderData([folder('F', 'Original'), folder('L', 'Legacy edit')]);
    storage.write(AI_STUDIO, legacyK);
    const frozen = storage.snapshot();

    await drainOwnedKeys(storage.area, rollback, AI_LEGACY);
    const beforeObserve = storage.calls();
    await rollback.observe(AI_STUDIO, legacyK);
    expect(storage.calls()).toBe(beforeObserve);
    const prompts = createPromptLibraryOwner({
      area: { get: (key) => storage.area.get([key]), set: storage.area.set },
      serialize: queue,
    });
    await prompts.apply({ kind: 'update', id: 'p', changes: { text: 'edited under P4a' } });

    expect(storage.snapshot()).toEqual({
      ...frozen,
      [BUNDLE_INTENT_KEY]: { v: 1, txId: 'tx', status: 'abandoned', at: world.now() },
      [PROMPT_LIBRARY_KEY]: [{ ...PROMPT, text: 'edited under P4a' }],
    });
    expect(storage.read(ownerBackupKey(AI_STUDIO, 'foreign'))).toBeUndefined();
    expect(pendingKeys(storage)).toHaveLength(3);

    world.advance(60_000);
    const upgraded = world.process();
    await writeAuthorityFence(storage.area, 'P4b', ALL_OWNER);
    await drainOwnedKeys(storage.area, upgraded, ALL_OWNER);

    expect(storedData(storage, AI_STUDIO)).toEqual(legacyK);
    expect(storedMeta(storage, AI_STUDIO).clients.ordinary).toMatchObject({
      applied: 0,
      held: { from: 1, reason: 'foreign_write' },
    });
    expect(pendingKeys(storage)).toHaveLength(3);
    expect(storage.read(ownerBackupKey(AI_STUDIO, 'foreign'))).toMatchObject({ value: legacyK });
    expect(await cloud.send(upgraded, [1])).toMatchObject({
      kind: 'ok',
      applied: 1,
      outcomes: { 1: INTERRUPTED },
    });
    await upgraded.drain(AI_STUDIO);
    expect(storedData(storage, AI_STUDIO)).toEqual(legacyK);
    expect(storage.read(PROMPT_LIBRARY_KEY)).toEqual([{ ...PROMPT, text: 'edited under P4a' }]);
    expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'abandoned' });
  });

  it('T24c: preserves an R0 prompt edit and abandons the old bundle on re-upgrade', async () => {
    const { storage, world, cloud } = await openBundle(KEY);
    const legacy = createFolderOwnerCore({
      area: storage.area,
      authority: FOLDER_WRITE_AUTHORITY,
      now: world.now,
    });
    await writeAuthorityFence(storage.area, 'R0', FOLDER_WRITE_AUTHORITY);
    await drainOwnedKeys(storage.area, legacy, FOLDER_WRITE_AUTHORITY);
    world.advance(60_000);
    const prompts = createPromptLibraryOwner({
      area: { get: (key) => storage.area.get([key]), set: storage.area.set },
    });
    await prompts.apply({ kind: 'update', id: 'p', changes: { text: 'R0 edit' } });
    expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });

    const upgraded = world.process();
    await writeAuthorityFence(storage.area, 'P4c', ALL_OWNER);
    await drainOwnedKeys(storage.area, upgraded, ALL_OWNER);

    expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'abandoned' });
    expect(storage.read(PROMPT_LIBRARY_KEY)).toEqual([{ ...PROMPT, text: 'R0 edit' }]);
    expect(await cloud.send(upgraded, [1])).toMatchObject({
      kind: 'ok',
      applied: 1,
      outcomes: { 1: INTERRUPTED },
    });
    expect(storedData(storage)).toEqual(folderData([folder('F', 'Original')]));
    expect(storage.read(AUTHORITY_FENCE_KEY)).toEqual({
      build: 'P4c',
      sites: ALL_OWNER,
    });
  });
});
