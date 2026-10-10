import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { createStarStore } from '@/features/savedLibrary/starStore';
import type { StarredMessage, StarredMessagesData } from '@/features/savedLibrary/starTypes';

import { createStarredMessagesHandler } from '../starredMessages';

const key = StorageKeys.TIMELINE_STARRED_MESSAGES;
const star = (conversationId: string, turnId: string, starredAt = 1): StarredMessage => ({
  conversationId,
  turnId,
  starredAt,
  content: `${conversationId} prompt`,
  conversationUrl: `https://gemini.google.com/u/2/app/${conversationId}`,
});

function setup(initial: unknown = { messages: {} }) {
  let stored = structuredClone(initial);
  let neutral = structuredClone(initial);
  let tombstones: unknown = [];
  const area = {
    get: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        [key]: structuredClone(stored),
        [StorageKeys.SAVED_LIBRARY_STARS]: structuredClone(neutral),
        [StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]: structuredClone(tombstones),
      };
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      stored = structuredClone(items[key]);
      neutral = structuredClone(items[StorageKeys.SAVED_LIBRARY_STARS]);
      tombstones = structuredClone(items[StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]);
    }),
  };
  const store = createStarStore(area);
  return {
    store,
    handle: createStarredMessagesHandler(store),
    area,
    stored: () => stored as StarredMessagesData,
  };
}

const add = (payload: StarredMessage) => ({ type: 'gv.starred.add', payload });

describe('starred messages owner', () => {
  it('reads wait for earlier writes and retain their queued snapshots', async () => {
    const { store } = setup();
    const [added, afterAdd, removed, afterRemove] = await Promise.all([
      store.add(star('a', 'one')),
      store.getAll(),
      store.remove('a', 'one'),
      store.getForConversation('a'),
    ]);
    expect(added).toBe(true);
    expect(afterAdd).toEqual({ messages: { a: [star('a', 'one')] } });
    expect(removed).toBe(true);
    expect(afterRemove).toEqual([]);
  });

  it('cloud restore merges into queued current state and never replaces local-only stars', async () => {
    const { store, stored } = setup({ messages: { a: [star('a', 'local')] } });
    await Promise.all([
      store.add(star('a', 'during-download')),
      store.mergeCloud({ data: { messages: { a: [star('a', 'cloud')] } } }),
    ]);
    expect(stored().messages.a.map((item) => item.turnId)).toEqual([
      'cloud',
      'local',
      'during-download',
    ]);
    await expect(
      store.mergeCloud({
        format: 'gemini-voyager.starred.v1',
        data: { messages: {} },
      }),
    ).resolves.toEqual({ status: 'merged', count: 3 });
    expect(stored().messages.a).toHaveLength(3);
  });

  it('absent cloud values do not touch storage and unusable cloud data cannot remove local stars', async () => {
    const { store, area, stored } = setup({ messages: { a: [star('a', 'local')] } });
    for (const envelope of [undefined, null, false, 3, 'bad']) {
      await expect(store.mergeCloud(envelope)).resolves.toEqual({ status: 'absent', count: 0 });
    }
    expect(area.get).not.toHaveBeenCalled();
    expect(area.set).not.toHaveBeenCalled();
    await expect(
      store.mergeCloud({ format: 'unsupported', data: { messages: {} } }),
    ).rejects.toThrow('Invalid starred messages');
    expect(area.set).not.toHaveBeenCalled();
    for (const envelope of [{}, [], { data: null }, { data: { messages: { a: 3 } } }]) {
      await expect(store.mergeCloud(envelope)).resolves.toEqual({ status: 'merged', count: 1 });
    }
    expect(stored()).toEqual({ messages: { a: [star('a', 'local')] } });
    await expect(store.getAll()).resolves.toEqual(stored());
  });

  it('failed reads and cloud quota failures release the queue without removing prior data', async () => {
    const { store, area, stored } = setup({ messages: { a: [star('a', 'local')] } });
    area.get.mockRejectedValueOnce(new Error('unavailable'));
    await expect(store.getAll()).rejects.toThrow('unavailable');
    area.set.mockRejectedValueOnce(new Error('quota'));
    await expect(
      store.mergeCloud({ data: { messages: { a: [star('a', 'cloud')] } } }),
    ).rejects.toThrow('quota');
    await expect(store.getAll()).resolves.toEqual({ messages: { a: [star('a', 'local')] } });
    await expect(store.add(star('a', 'retry'))).resolves.toBe(true);
    expect(stored().messages.a).toEqual([star('a', 'local'), star('a', 'retry')]);
  });

  it('only trusted sync contexts may dispatch a cloud merge', async () => {
    const { handle, area } = setup();
    const message = { type: 'gv.starred.mergeCloud', payload: { data: { messages: {} } } };
    await expect(handle(message)).rejects.toThrow('Untrusted');
    await expect(
      handle(message, {
        id: 'test-extension-id',
        tab: { url: 'https://example.com' } as chrome.tabs.Tab,
      }),
    ).rejects.toThrow('Untrusted');
    expect(area.set).not.toHaveBeenCalled();
    await expect(
      handle(message, {
        id: chrome.runtime.id,
        url: chrome.runtime.getURL('src/pages/popup/index.html'),
      }),
    ).resolves.toEqual({ ok: true, status: 'merged', count: 0 });
  });

  it('an untrusted or malformed v2 restore cannot mutate the star library', async () => {
    const { handle, area } = setup();
    const payload = {
      v2: {
        format: 'gemini-voyager.stars.v2',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        items: [],
        tombstones: [],
      },
      accountScope: null,
    };
    const trusted = {
      id: chrome.runtime.id,
      url: chrome.runtime.getURL('src/pages/popup/index.html'),
    };
    await expect(handle({ type: 'gv.starred.mergeSync', payload })).rejects.toThrow('Untrusted');
    await expect(
      handle(
        { type: 'gv.starred.mergeSync', payload },
        {
          id: chrome.runtime.id,
          tab: { url: 'https://example.com' } as chrome.tabs.Tab,
        },
      ),
    ).rejects.toThrow('Untrusted');
    await expect(
      handle(
        {
          type: 'gv.starred.mergeSync',
          payload: {
            ...payload,
            accountScope: { accountKey: 'bad' },
          },
        },
        trusted,
      ),
    ).rejects.toThrow('Invalid starred messages restore scope');
    expect(area.set).not.toHaveBeenCalled();
    await expect(handle({ type: 'gv.starred.mergeSync', payload }, trusted)).resolves.toEqual({
      ok: true,
      status: 'merged',
      count: 0,
    });
  });

  it('serializes concurrent writes, deduplicates only per conversation, and keeps previews bounded', async () => {
    const { handle, area, stored } = setup();
    const first = { ...star('a', '1'), content: 'x'.repeat(80) };
    await expect(
      Promise.all([
        handle(add(first)),
        handle(add(star('a', '2'))),
        handle(add(star('a', '1', 9))),
        handle(add(star('b', '1'))),
      ]),
    ).resolves.toEqual([
      { ok: true, added: true },
      { ok: true, added: true },
      { ok: true, added: false },
      { ok: true, added: true },
    ]);
    expect(stored()).toEqual({
      messages: {
        a: [{ ...first, content: `${'x'.repeat(60)}...` }, star('a', '2')],
        b: [star('b', '1')],
      },
    });
    expect(area.set).toHaveBeenCalledTimes(3);
    expect(area.get).toHaveBeenCalledWith([
      StorageKeys.SAVED_LIBRARY_STARS,
      key,
      StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES,
    ]);
    await expect(
      handle({ type: 'gv.starred.isStarred', payload: { conversationId: 'a', turnId: '2' } }),
    ).resolves.toEqual({ ok: true, isStarred: true });
  });

  it('reconciles draft ids by latest timestamp while retaining first-seen turn order and unrelated chats', async () => {
    const { handle, store, stored } = setup({
      messages: {
        stable: [star('stable', 'shared', 5), star('stable', 'first', 1)],
        draft: [star('draft', 'shared', 5), star('draft', 'second', 2)],
        other: [star('other', 'unchanged', 3)],
      },
    });
    const url = 'https://gemini.google.com/u/2/app/stable';
    const expected = [
      star('draft', 'shared', 5),
      star('stable', 'first', 1),
      star('draft', 'second', 2),
    ].map((message) => ({ ...message, conversationId: 'stable', conversationUrl: url }));
    await expect(
      handle({
        type: 'gv.starred.reconcileConversationIds',
        payload: {
          targetConversationId: 'stable',
          sourceConversationIds: ['draft', 'draft', ''],
          conversationUrl: url,
        },
      }),
    ).resolves.toEqual({ ok: true, messages: expected });
    expect(stored()).toEqual({
      messages: { stable: expected, other: [star('other', 'unchanged', 3)] },
    });
    await expect(store.getAll()).resolves.toEqual(stored());
  });

  it('removes empty buckets without writing for a missing turn and resumes after a rejected write', async () => {
    const { handle, area, stored } = setup({ messages: { a: [star('a', '1')] } });
    await expect(
      handle({
        type: 'gv.starred.remove',
        payload: { conversationId: 'a', turnId: 'missing' },
      }),
    ).resolves.toEqual({ ok: true, removed: false });
    expect(area.set).not.toHaveBeenCalled();
    area.set.mockRejectedValueOnce(new Error('quota'));
    await expect(handle(add(star('a', '2')))).rejects.toThrow('quota');
    await expect(
      handle({ type: 'gv.starred.remove', payload: { conversationId: 'a', turnId: '1' } }),
    ).resolves.toEqual({ ok: true, removed: true });
    expect(stored()).toEqual({ messages: {} });
  });

  it('stored corruption preserves valid buckets and does not disable later edits or read retries', async () => {
    const { handle, store, area, stored } = setup({
      messages: { good: [star('good', 'old')], broken: null },
    });
    await expect(store.getAll()).resolves.toEqual({ messages: { good: [star('good', 'old')] } });
    await expect(handle(add(star('good', 'new')))).resolves.toEqual({ ok: true, added: true });
    expect(stored()).toEqual({ messages: { good: [star('good', 'old'), star('good', 'new')] } });
    area.get.mockRejectedValueOnce(new Error('unavailable'));
    await expect(handle({ type: 'gv.starred.getAll' })).rejects.toThrow('unavailable');
    await expect(store.getAll()).resolves.toEqual(stored());
    expect(handle({ type: 'gv.fork.getAll' })).toBeNull();
    expect(handle(null)).toBeNull();
  });
});
