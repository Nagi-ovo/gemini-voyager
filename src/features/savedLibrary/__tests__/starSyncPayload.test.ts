import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { SyncAccountScope } from '@/core/types/sync';
import { hashString } from '@/core/utils/hash';

import { createStarStore } from '../starStore';
import { buildStarsV2, decodeStarsV2 } from '../starSyncPayload';
import type { StarredMessage, StarTombstone } from '../starTypes';

const NOW = 1_800_000_000_000;
const scope: SyncAccountScope = { accountKey: 'account-one', accountId: 1, routeUserId: '2' };
const star = (id: string, slot: string | null = '2'): StarredMessage => ({
  conversationId: id,
  turnId: 'same',
  content: 'Prompt',
  starredAt: 50,
  conversationUrl: `https://gemini.google.com/${slot === null ? '' : `u/${slot}/`}app/${id}`,
});
const deletion = (item: StarredMessage): StarTombstone => ({
  conversationId: item.conversationId,
  turnId: item.turnId,
  conversationUrl: item.conversationUrl,
  starredAt: item.starredAt,
  deletedAt: NOW,
});
function payload(items: StarredMessage[] = [], tombstones: StarTombstone[] = [], scoped = true) {
  return {
    format: 'gemini-voyager.stars.v2',
    exportedAt: new Date(NOW).toISOString(),
    version: '1.9.0',
    ...(scoped ? { accountScope: { accountHash: hashString(scope.accountKey) } } : {}),
    items,
    tombstones,
  };
}
function setup(items: StarredMessage[] = [], tombstones: StarTombstone[] = []) {
  const values: Record<string, unknown> = {
    [StorageKeys.SAVED_LIBRARY_STARS]: {
      messages: Object.fromEntries(items.map((item) => [item.conversationId, [item]])),
    },
    [StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]: tombstones,
  };
  const area = {
    get: vi.fn(async () => structuredClone(values)),
    set: vi.fn(async (next: Record<string, unknown>) => {
      Object.assign(values, structuredClone(next));
    }),
  };
  return { store: createStarStore(area), values, area };
}
afterEach(() => vi.restoreAllMocks());

describe('stars v2 owner boundary', () => {
  it('an empty v2 backup seeds from v1 without losing local stars', async () => {
    const local = star('local');
    const incoming = star('incoming');
    const { store } = setup([local]);
    const result = await store.mergeSync(
      { v1: { data: { messages: { incoming: [incoming, null, {}] } } }, v2: payload() },
      scope,
    );
    expect(result.data.messages).toEqual({ local: [local], incoming: [incoming] });
  });

  it('a cloud deletion removes a local star while preserving unrelated local scopes', async () => {
    const own = star('own');
    const other = star('other', '3');
    const { store, values } = setup([own, other]);
    expect(await store.mergeSync({ v2: payload([], [deletion(own)]) }, scope)).toEqual({
      data: { messages: {} },
      tombstones: [deletion(own)],
    });
    expect((await store.getAll()).messages).toEqual({ other: [other] });
    expect(values[StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]).toEqual([deletion(own)]);
  });

  it('local exports and unscoped legacy imports retain account route isolation', async () => {
    const own = star('own');
    const other = star('other', '3');
    const absent = star('absent', null);
    const { store } = setup([other], [deletion(star('other-deleted', '3'))]);
    const result = await store.mergeSync(
      {
        v1: { data: { messages: { fromV1: [star('fromV1', '3')] } } },
        v2: payload([own, absent], [deletion(star('accepted'))]),
      },
      scope,
    );
    expect(result.data.messages).toEqual({ own: [own], absent: [absent] });
    expect(result.tombstones).toEqual([deletion(star('accepted'))]);
    expect(await store.getSyncSnapshot(scope)).toEqual(result);
    expect((await store.getAll()).messages).toEqual({
      own: [own],
      absent: [absent],
      other: [other],
    });
    const exported = buildStarsV2(await store.getSyncSnapshot(null), scope, '1.9.0');
    expect(exported.items).toEqual([own, absent]);
    expect(exported.tombstones).toEqual([deletion(star('accepted'))]);
    await store.mergeSync(
      {
        v1: {
          data: {
            messages: {
              other: [{ ...other, conversationUrl: star('other').conversationUrl, starredAt: 49 }],
            },
          },
        },
      },
      scope,
    );
    expect((await store.getAll()).messages.other).toEqual([other]);
    expect((await store.getSyncSnapshot(scope)).data.messages).toEqual({
      own: [own],
      absent: [absent],
    });
  });

  it('an unscoped fallback from another account does not erase an authorized star', async () => {
    const own = star('shared-id');
    const foreign = { ...star('shared-id', '0'), starredAt: 60 };
    const { store } = setup();
    await store.mergeSync(
      {
        v1: { data: { messages: { [foreign.conversationId]: [foreign] } } },
        v2: payload([own]),
      },
      scope,
    );
    expect((await store.getAll()).messages[own.conversationId]).toEqual([own]);
  });

  it('a scoped v1 restore repairs a newer cached star from another navigation slot', async () => {
    const cached = { ...star('same-account', '0'), starredAt: 60 };
    const { store } = setup([cached]);
    await store.mergeSync(
      {
        v1: { data: { messages: { [cached.conversationId]: [star('same-account', '0')] } } },
        v1AccountHash: hashString(scope.accountKey),
      },
      scope,
    );
    expect((await store.getSyncSnapshot(scope)).data.messages[cached.conversationId]).toEqual([
      { ...cached, conversationUrl: star('same-account').conversationUrl },
    ]);
  });

  it('scoped v1 provenance from a different account refuses mutation', async () => {
    const { store, area, values } = setup([star('local')]);
    const before = structuredClone(values);
    await expect(
      store.mergeSync(
        {
          v1: { data: { messages: { incoming: [star('incoming', '0')] } } },
          v1AccountHash: hashString('another-account'),
        },
        scope,
      ),
    ).rejects.toThrow('account scope');
    expect(area.get).not.toHaveBeenCalled();
    expect(area.set).not.toHaveBeenCalled();
    expect(values).toEqual(before);
  });

  it('a queued star snapshot retains the requested account scope when the caller switches accounts', async () => {
    const own = star('own');
    const { store } = setup([own, star('other', '3')]);
    const movingScope = { ...scope };
    const pending = store.getSyncSnapshot(movingScope);
    movingScope.routeUserId = '3';
    movingScope.accountKey = 'other-account';
    expect((await pending).data.messages).toEqual({ own: [own] });
  });

  it.each([
    { items: [{ ...star('bad'), starredAt: '50' }] },
    { items: [{ ...star('bad'), text: 42 }] },
    { items: [{ ...star('bad'), turnId: '' }] },
    { tombstones: [{ ...deletion(star('bad')), deletedAt: Infinity }] },
    { tombstones: [{ ...deletion(star('bad')), movedTo: '' }] },
    { tombstones: [null] },
    { exportedAt: 'invalid' },
  ])('a malformed v2 record refuses the entire mutation: %j', async (invalid) => {
    const { store, area, values } = setup([star('local')]);
    const before = structuredClone(values);
    await expect(
      store.mergeSync(
        {
          v1: { data: { messages: { valid: [star('valid')] } } },
          v2: { ...payload(), ...invalid },
        },
        scope,
      ),
    ).rejects.toThrow('Invalid stars v2');
    expect(area.get).not.toHaveBeenCalled();
    expect(area.set).not.toHaveBeenCalled();
    expect(values).toEqual(before);
  });

  it.each([
    { current: scope, incoming: payload([], [], false) },
    { current: null, incoming: payload() },
    { current: scope, incoming: { ...payload(), accountScope: { accountHash: 'other' } } },
  ])(
    'a v2 backup from the wrong account scope never changes local stars',
    async ({ current, incoming }) => {
      const { store, area } = setup([star('local')]);
      await expect(store.mergeSync({ v2: incoming }, current)).rejects.toThrow('account scope');
      expect(area.get).not.toHaveBeenCalled();
      expect(area.set).not.toHaveBeenCalled();
    },
  );

  it.each([42, [], {}, { data: {} }, { data: { messages: [] } }])(
    'a malformed present v1 cloud file refuses import instead of becoming empty: %j',
    async (v1) => {
      const { store, area } = setup([star('local')]);
      await expect(store.mergeSync({ v1, v2: payload() }, scope)).rejects.toThrow(
        'Invalid starred messages envelope',
      );
      expect(area.get).not.toHaveBeenCalled();
      expect(area.set).not.toHaveBeenCalled();
    },
  );

  it('v2 preserves longer prompt text through a newer sparse v1 import without adding text to v1 storage', async () => {
    const local = { ...star('__proto__'), text: 'Full prompt' };
    const { store, values } = setup([local]);
    await store.mergeSync(
      {
        v1: {
          data: { messages: { ['__proto__']: [{ ...local, starredAt: 51, text: undefined }] } },
        },
        v2: payload([{ ...local, text: 'Full prompt\nwith more text' }]),
      },
      scope,
    );
    const item = (await store.getSyncSnapshot(scope)).data.messages['__proto__'][0];
    expect(item).toEqual({ ...local, starredAt: 51, text: 'Full prompt\nwith more text' });
    expect(values[StorageKeys.TIMELINE_STARRED_MESSAGES]).toEqual({
      messages: { ['__proto__']: [{ ...star('__proto__'), starredAt: 51 }] },
    });
  });

  it('v2 round trips source migration markers without treating them as canonical deletions', async () => {
    const marker = { ...deletion(star('source')), movedTo: 'canonical', account: 'opaque' };
    const canonical = star('canonical');
    const { store } = setup();
    const result = await store.mergeSync({ v2: payload([canonical], [marker]) }, scope);
    expect(result.data.messages).toEqual({ canonical: [canonical] });
    expect(decodeStarsV2(buildStarsV2(result, scope, '1.9.0'), scope)).toEqual(result);
  });

  it('an expired cloud deletion suppresses the current stale import before retention pruning', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const item = star('expired');
    const { store } = setup([item]);
    const expired = { ...deletion(item), deletedAt: NOW - 180 * 24 * 60 * 60 * 1000 - 1 };
    const result = await store.mergeSync(
      { v1: { data: { messages: { expired: [item] } } }, v2: payload([], [expired]) },
      scope,
    );
    expect(result).toEqual({ data: { messages: {} }, tombstones: [] });
  });
});
