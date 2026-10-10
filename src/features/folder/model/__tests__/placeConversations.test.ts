import { describe, expect, it } from 'vitest';

import type { ConversationReference, FolderData } from '@/core/types/folder';

import { placeConversations } from '../placeConversations';

function conv(id: string, extra: Partial<ConversationReference> = {}): ConversationReference {
  return { conversationId: id, title: id, url: '', addedAt: 1, ...extra };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function data(folderContents: FolderData['folderContents'], folderIds = ['a', 'b']): FolderData {
  return deepFreeze({
    folders: folderIds.map((id) => ({
      id,
      name: id,
      parentId: null,
      isExpanded: true,
      createdAt: 1,
      updatedAt: 1,
    })),
    folderContents,
  });
}

function layout(result: FolderData): Record<string, Array<[string, number | undefined]>> {
  return Object.fromEntries(
    Object.entries(result.folderContents).map(([key, list]) => [
      key,
      list.map((c) => [c.conversationId, c.sortIndex] as [string, number | undefined]),
    ]),
  );
}

describe('placeConversations', () => {
  it('appends after the highest index, once per id, creating the bucket', () => {
    const input = data({ a: [conv('x', { sortIndex: 4 }), conv('y')] });
    const { data: next, added } = placeConversations(
      input,
      [conv('y'), conv('n1'), conv('n2'), conv('n1')],
      { target: 'a', placement: 'append' },
    );
    expect(layout(next).a).toEqual([
      ['x', 4],
      ['y', undefined],
      ['n1', 5],
      ['n2', 6],
    ]);
    expect(added.map((c) => c.conversationId)).toEqual(['n1', 'n2']);

    const created = placeConversations(input, [conv('n')], { target: 'b', placement: 'append' });
    expect(layout(created.data).b).toEqual([['n', 0]]);
  });

  it('places at the top, normalizing first so every record shifts', () => {
    const input = data({
      a: [conv('x', { sortIndex: 0 }), conv('y', { addedAt: 99 })],
      b: [conv('z')],
    });
    const { data: next } = placeConversations(input, [conv('n')], {
      target: 'a',
      placement: 'top',
    });
    expect(layout(next)).toEqual({
      a: [
        ['x', 1],
        ['y', 1],
        ['n', 0],
      ],
      b: [['z', 0]],
    });
  });

  it('leaves the data untouched by normalization when nothing new is placed at the top', () => {
    const input = data({ a: [conv('x')], stray: [conv('s')] });
    const { data: next, added } = placeConversations(input, [conv('x')], {
      target: 'a',
      placement: 'top',
    });
    expect(added).toEqual([]);
    expect(next).toEqual(input);
  });

  it('keeps whatever index the records carry', () => {
    const input = data({ a: [conv('x', { sortIndex: 2 })] });
    const { data: next } = placeConversations(input, [conv('m', { sortIndex: 2 }), conv('u')], {
      target: 'a',
      placement: 'keep',
    });
    expect(layout(next).a).toEqual([
      ['x', 2],
      ['m', 2],
      ['u', undefined],
    ]);
  });

  it('removes placed ids from one source bucket, skipping a missing one', () => {
    const input = data({ a: [conv('held')], b: [conv('held'), conv('n'), conv('other')] });
    const moved = placeConversations(input, [conv('held'), conv('n')], {
      target: 'a',
      placement: 'append',
      removeFrom: { bucket: 'b' },
    });
    expect(layout(moved.data).b).toEqual([
      ['held', undefined],
      ['other', undefined],
    ]);

    const strict = placeConversations(input, [conv('held'), conv('n')], {
      target: 'a',
      placement: 'append',
      removeFrom: { bucket: 'b' },
      removeWhenPresent: true,
    });
    expect(layout(strict.data).b).toEqual([['other', undefined]]);

    const missing = placeConversations(input, [conv('n')], {
      target: 'a',
      placement: 'append',
      removeFrom: { bucket: 'gone' },
    });
    expect(Object.keys(missing.data.folderContents)).toEqual(['a', 'b']);
    expect(layout(missing.data).a).toEqual([
      ['held', undefined],
      ['n', 0],
    ]);
  });

  it('never removes from the target, even when it is the source', () => {
    const input = data({ a: [conv('x')] });
    const { data: next } = placeConversations(input, [conv('x'), conv('n')], {
      target: 'a',
      placement: 'keep',
      removeFrom: { bucket: 'a' },
      removeWhenPresent: true,
    });
    expect(layout(next).a.map(([id]) => id)).toEqual(['x', 'n']);
  });

  it('removes placed ids from every other bucket, keeping the target record', () => {
    const input = data({
      a: [conv('x', { title: 'kept' })],
      b: [conv('x'), conv('y')],
      __root__: [conv('x')],
      orphan: [conv('x')],
    });
    const { data: next } = placeConversations(input, [conv('x', { title: 'incoming' })], {
      target: 'a',
      placement: 'keep',
      removeFrom: 'everywhere',
      removeWhenPresent: true,
    });
    expect(layout(next)).toEqual({
      a: [['x', undefined]],
      b: [['y', undefined]],
      __root__: [],
      orphan: [],
    });
    expect(next.folderContents.a[0].title).toBe('kept');
  });

  it('treats records sharing a key as held, without touching stored duplicates', () => {
    const keysOf = (c: ConversationReference) => [c.conversationId.replace(/^c_/, '')];
    const input = data({ a: [conv('c_x'), conv('x')], b: [conv('x'), conv('c_y')] });
    const { data: next, added } = placeConversations(input, [conv('c_x'), conv('y'), conv('c_y')], {
      target: 'a',
      placement: 'keep',
      removeFrom: { bucket: 'b' },
      removeWhenPresent: true,
      keysOf,
    });
    expect(added.map((c) => c.conversationId)).toEqual(['y']);
    expect(layout(next).a.map(([id]) => id)).toEqual(['c_x', 'x', 'y']);
    // Removal matches each incoming record's exact id.
    expect(layout(next).b.map(([id]) => id)).toEqual(['x']);

    const batch = placeConversations(input, [conv('c_z'), conv('z')], {
      target: 'b',
      placement: 'keep',
      keysOf,
    });
    expect(batch.added.map((c) => c.conversationId)).toEqual(['c_z']);
  });

  it('stores fresh records and never mutates its input', () => {
    const input = data({ a: [conv('x', { sortIndex: 0 })], b: [] });
    const incoming = deepFreeze([conv('n', { starred: true })]);
    for (const placement of ['append', 'top', 'keep'] as const) {
      const { data: next, added } = placeConversations(input, incoming, {
        target: 'b',
        placement,
        removeFrom: 'everywhere',
      });
      expect(added[0]).not.toBe(incoming[0]);
      expect(next.folderContents.b.at(-1)).toBe(added[0]);
      expect(next.folderContents.b.at(-1)).toMatchObject({ conversationId: 'n', starred: true });
    }
  });
});

describe('placeConversations into a folder stored as __proto__', () => {
  it.each(['append', 'top', 'keep'] as const)(
    '%s writes an own bucket, not the prototype',
    (placement) => {
      const { data: placed } = placeConversations(data({}, ['__proto__']), [conv('x')], {
        target: '__proto__',
        placement,
      });
      expect(Object.getPrototypeOf(placed.folderContents)).toBe(Object.prototype);
      expect(Object.hasOwn(placed.folderContents, '__proto__')).toBe(true);
      expect(placed.folderContents['__proto__'].map((c) => c.conversationId)).toEqual(['x']);
    },
  );
});
