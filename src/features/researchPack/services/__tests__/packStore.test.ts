import { describe, expect, it, vi } from 'vitest';

import { buildScopedStorageKey } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';

import {
  RESEARCH_PACK_APPLY_MESSAGE,
  createResearchPackClient,
  handleResearchPackApplyMessage,
} from '../packMessages';
import {
  RESEARCH_PACK_UNSUPPORTED_VERSION,
  type ResearchPackStorageArea,
  createResearchPackOwner,
  isResearchPackStorageKey,
  resolveResearchPackStorageKey,
} from '../packStore';
import type { ResearchPackDraftItem } from '../types';

const KEY = StorageKeys.RESEARCH_PACK;

function memoryArea(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial));
  const area: ResearchPackStorageArea = {
    // Yield between read and write like real storage does, so races can interleave.
    get: vi.fn(async (key: string) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return data.has(key) ? { [key]: structuredClone(data.get(key)) } : {};
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    }),
  };
  return { area, data };
}

const draft = (text: string): ResearchPackDraftItem => ({
  text,
  excerpt: false,
  prompt: '',
  sourceTitle: 'Conversation',
  sourceUrl: 'https://gemini.google.com/app/abc',
  platform: 'gemini',
  citations: [{ url: 'https://example.com/a', title: 'A' }],
});

/** Two tabs, each with its own client, talking to one background owner over a fake runtime. */
function twoTabs() {
  const { area, data } = memoryArea();
  const owner = createResearchPackOwner({ area, now: () => 1 });
  const send = (request: unknown) => handleResearchPackApplyMessage(request, owner);
  const tab = () => createResearchPackClient({ area, send });
  return { tabA: tab(), tabB: tab(), data, area };
}

describe('research pack owner', () => {
  it('round-trips a pack through storage', async () => {
    const { area, data } = memoryArea();
    const owner = createResearchPackOwner({ area, now: () => 7 });

    await owner.apply(KEY, { kind: 'add', draft: draft('one') });
    await owner.apply(KEY, { kind: 'setInstruction', instruction: 'Go deeper' });

    const loaded = await owner.load(KEY);
    expect(loaded.items.map((item) => item.text)).toEqual(['one']);
    expect(loaded.items[0].citations).toEqual([{ url: 'https://example.com/a', title: 'A' }]);
    expect(loaded.instruction).toBe('Go deeper');
    expect(data.get(KEY)).toEqual(loaded);
  });

  it('bumps the revision on every write it makes, and only then', async () => {
    const { area, data } = memoryArea();
    const owner = createResearchPackOwner({ area, now: () => 7 });

    const first = await owner.apply(KEY, { kind: 'add', draft: draft('one') });
    const second = await owner.apply(KEY, { kind: 'add', draft: draft('two') });
    const duplicate = await owner.apply(KEY, { kind: 'add', draft: draft('two') });

    expect([first.pack.revision, second.pack.revision, duplicate.pack.revision]).toEqual([1, 2, 2]);
    expect((data.get(KEY) as { revision: number }).revision).toBe(2);
  });

  it('starts again from revision 1 when the pack is removed and recreated', async () => {
    const { area, data } = memoryArea();
    const owner = createResearchPackOwner({ area, now: () => 7 });
    await owner.apply(KEY, { kind: 'add', draft: draft('one') });
    await owner.apply(KEY, { kind: 'add', draft: draft('two') });

    data.delete(KEY);
    const recreated = await owner.apply(KEY, { kind: 'add', draft: draft('three') });
    expect(recreated.pack.revision).toBe(1);
    expect(recreated.pack.items.map((item) => item.text)).toEqual(['three']);
  });

  it('continues from revision 0 for a pack stored before revisions existed', async () => {
    const { area } = memoryArea();
    const owner = createResearchPackOwner({ area });
    await owner.apply(KEY, { kind: 'add', draft: draft('old') });
    const { revision: _omitted, ...legacy } = await owner.load(KEY);
    const { area: legacyArea } = memoryArea({ [KEY]: legacy });

    const next = await createResearchPackOwner({ area: legacyArea, now: () => 1 }).apply(KEY, {
      kind: 'add',
      draft: draft('new'),
    });
    expect(next.pack.revision).toBe(1);
    expect(next.pack.items.map((item) => item.text)).toEqual(['old', 'new']);
  });

  it('hands the revision through to the tab', async () => {
    const { tabA } = twoTabs();
    await tabA.apply(KEY, { kind: 'add', draft: draft('one') });
    const reply = await tabA.apply(KEY, { kind: 'setInstruction', instruction: 'Go' });
    expect(reply.pack.revision).toBe(2);
    expect((await tabA.load(KEY)).revision).toBe(2);
  });

  it('keeps both items when two tabs add at the same time', async () => {
    const { tabA, tabB } = twoTabs();

    const [fromA, fromB] = await Promise.all([
      tabA.apply(KEY, { kind: 'add', draft: draft('from A') }),
      tabB.apply(KEY, { kind: 'add', draft: draft('from B') }),
    ]);

    expect(fromA.outcome).toBe('added');
    expect(fromB.outcome).toBe('added');
    expect((await tabA.load(KEY)).items.map((item) => item.text)).toEqual(['from A', 'from B']);
    // The later reply already reflects the other tab's edit.
    expect(fromB.pack.items).toHaveLength(2);
  });

  it('keeps an instruction edit and a removal made from different tabs', async () => {
    const { tabA, tabB } = twoTabs();
    await tabA.apply(KEY, { kind: 'add', draft: draft('one') });
    await tabA.apply(KEY, { kind: 'add', draft: draft('two') });
    const [first] = (await tabA.load(KEY)).items;

    await Promise.all([
      tabA.apply(KEY, { kind: 'remove', id: first.id }),
      tabB.apply(KEY, { kind: 'setInstruction', instruction: 'Compare' }),
    ]);

    const pack = await tabB.load(KEY);
    expect(pack.items.map((item) => item.text)).toEqual(['two']);
    expect(pack.instruction).toBe('Compare');
  });

  it('skips the write when nothing changed', async () => {
    const { area } = memoryArea();
    const owner = createResearchPackOwner({ area });

    await owner.apply(KEY, { kind: 'clear' });
    await owner.apply(KEY, { kind: 'remove', id: 'missing' });
    expect(area.set).not.toHaveBeenCalled();
  });

  it('reads malformed data as an empty pack instead of failing', async () => {
    const { area } = memoryArea({ [KEY]: 'garbage' });
    expect((await createResearchPackOwner({ area }).load(KEY)).items).toEqual([]);
  });

  it('refuses to edit a pack written by a newer build instead of reporting success', async () => {
    const newer = { version: 2, items: [{ text: 'future' }] };
    const { area, data } = memoryArea({ [KEY]: newer });
    const owner = createResearchPackOwner({ area });

    await expect(owner.apply(KEY, { kind: 'add', draft: draft('x') })).rejects.toThrow(
      RESEARCH_PACK_UNSUPPORTED_VERSION,
    );
    expect(area.set).not.toHaveBeenCalled();
    expect(data.get(KEY)).toEqual(newer);

    const reply = await handleResearchPackApplyMessage(
      { type: RESEARCH_PACK_APPLY_MESSAGE, payload: { key: KEY, op: { kind: 'clear' } } },
      owner,
    );
    expect(reply).toEqual({ ok: false, error: RESEARCH_PACK_UNSUPPORTED_VERSION });

    const client = createResearchPackClient({
      area,
      send: (request) => handleResearchPackApplyMessage(request, owner),
    });
    await expect(client.apply(KEY, { kind: 'add', draft: draft('y') })).rejects.toThrow(
      RESEARCH_PACK_UNSUPPORTED_VERSION,
    );
    expect(data.get(KEY)).toEqual(newer);
  });

  it('refuses keys and ops that are not research-pack ones', async () => {
    const { area } = memoryArea();
    const owner = createResearchPackOwner({ area });
    const message = (payload: unknown) => ({ type: RESEARCH_PACK_APPLY_MESSAGE, payload });

    for (const payload of [
      { key: StorageKeys.FOLDER_DATA, op: { kind: 'clear' } },
      { key: KEY, op: { kind: 'drop-table' } },
      { key: KEY, op: { kind: 'move', id: 'x', delta: 0.5 } },
      { key: KEY, op: { kind: 'add', draft: { text: 1 } } },
      null,
    ]) {
      await expect(handleResearchPackApplyMessage(message(payload), owner)).resolves.toEqual({
        ok: false,
        error: 'invalid_payload',
      });
    }
    expect(area.set).not.toHaveBeenCalled();
  });

  it('surfaces a failed background reply as an error on the tab', async () => {
    const { area } = memoryArea();
    const client = createResearchPackClient({
      area,
      send: async () => ({ ok: false, error: 'sender_not_allowed' }),
    });
    await expect(client.apply(KEY, { kind: 'clear' })).rejects.toThrow('sender_not_allowed');
  });
});

describe('research pack storage key', () => {
  it('uses one global key while account isolation is off', async () => {
    const resolveAccountKey = vi.fn(async () => 'email:abc');
    await expect(
      resolveResearchPackStorageKey({ isIsolationEnabled: async () => false, resolveAccountKey }),
    ).resolves.toBe(StorageKeys.RESEARCH_PACK);
    expect(resolveAccountKey).not.toHaveBeenCalled();
  });

  it('scopes the pack per account when isolation is on', async () => {
    const key = await resolveResearchPackStorageKey({
      isIsolationEnabled: async () => true,
      resolveAccountKey: async () => 'email:abc',
    });

    expect(key).toBe(buildScopedStorageKey(StorageKeys.RESEARCH_PACK, 'email:abc'));
    expect(key).not.toBe(StorageKeys.RESEARCH_PACK);
    expect(isResearchPackStorageKey(key)).toBe(true);
  });

  it('recognizes only pack keys, not the enable toggle', () => {
    expect(isResearchPackStorageKey(StorageKeys.RESEARCH_PACK)).toBe(true);
    expect(isResearchPackStorageKey(StorageKeys.RESEARCH_PACK_ENABLED)).toBe(false);
    expect(isResearchPackStorageKey('gvResearchPackOther')).toBe(false);
  });
});
