import { describe, expect, it } from 'vitest';

import type { ConversationReference, FolderData } from '@/core/types/folder';

import {
  type ConversationSortMode,
  ownBucket,
  reorderConversations,
  setBucket,
  sortConversationsByPriority,
} from '../folderData';

/** `reorderConversations` from main 49bd6eec, before its lookups used Maps, copied verbatim. */
function oldReorderConversations(
  data: FolderData,
  conversationIds: readonly string[],
  sourceParentId: string,
  targetParentId: string,
  insertIndex: number,
  mode: ConversationSortMode = 'manual',
): FolderData {
  const uniqueIds = [...new Set(conversationIds)];
  const source = ownBucket(data.folderContents, sourceParentId) ?? [];
  if (!source.some((conversation) => uniqueIds.includes(conversation.conversationId))) return data;

  const folderContents = {
    ...data.folderContents,
    [sourceParentId]: source.map((conversation) => ({ ...conversation })),
  };
  if (sourceParentId !== targetParentId) {
    setBucket(
      folderContents,
      targetParentId,
      (ownBucket(data.folderContents, targetParentId) ?? []).map((conversation) => ({
        ...conversation,
      })),
    );
  }
  const moving = uniqueIds.flatMap((id) => {
    const conversation = folderContents[sourceParentId].find(
      (candidate) => candidate.conversationId === id,
    );
    return conversation ? [conversation] : [];
  });
  const isStarred = moving[0].starred ?? false;

  if (sourceParentId === targetParentId) {
    const originalSorted = sortConversationsByPriority(
      folderContents[targetParentId].filter((conversation) => !!conversation.starred === isStarred),
      mode,
    );
    let adjustment = 0;
    for (const id of uniqueIds) {
      const originalIndex = originalSorted.findIndex(
        (conversation) => conversation.conversationId === id,
      );
      if (originalIndex >= 0 && originalIndex < insertIndex) adjustment++;
    }
    insertIndex -= adjustment;
  }

  const removeSet = new Set(conversationIds);
  setBucket(
    folderContents,
    sourceParentId,
    folderContents[sourceParentId].filter(
      (conversation) => !removeSet.has(conversation.conversationId),
    ),
  );
  if (sourceParentId !== targetParentId) {
    sortConversationsByPriority(folderContents[sourceParentId], mode).forEach(
      (conversation, index) => {
        conversation.sortIndex = index;
      },
    );
  }

  const target = folderContents[targetParentId].filter(
    (conversation) => !removeSet.has(conversation.conversationId),
  );
  const sameGroup = sortConversationsByPriority(
    target.filter((conversation) => !!conversation.starred === isStarred),
    mode,
  );
  const otherGroup = target.filter((conversation) => !!conversation.starred !== isStarred);
  sameGroup.splice(Math.min(insertIndex, sameGroup.length), 0, ...moving);
  sameGroup.forEach((conversation, index) => {
    conversation.sortIndex = index;
  });
  otherGroup.forEach((conversation, index) => {
    if (conversation.sortIndex == null) conversation.sortIndex = index;
  });
  setBucket(folderContents, targetParentId, [...sameGroup, ...otherGroup]);
  return { ...data, folderContents };
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * Un-normalized buckets: repeated ids holding different metadata (title,
 * star, sortIndex), missing and tied sortIndex values, and starred mixes.
 */
function randomCase(seed: number) {
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const ids = Array.from({ length: 4 + Math.floor(random() * 10) }, (_, i) => `c${i}`);
  const bucket = (name: string): ConversationReference[] =>
    Array.from({ length: Math.floor(random() * 12) }, (_, i) => {
      const conversationId = pick(ids);
      return {
        conversationId,
        title: `${name}-${conversationId}-${i}`,
        url: `/app/${conversationId}`,
        addedAt: Math.floor(random() * 5),
        lastOpenedAt: random() < 0.5 ? Math.floor(random() * 5) : undefined,
        starred: random() < 0.3 ? true : random() < 0.2 ? false : undefined,
        sortIndex: random() < 0.25 ? undefined : Math.floor(random() * 6),
      };
    });
  const folderContents: Record<string, ConversationReference[]> = {
    a: bucket('a'),
    b: bucket('b'),
  };
  const source = random() < 0.85 ? 'a' : 'missing';
  const target = random() < 0.4 ? source : pick(['a', 'b', 'new']);
  const selected = Array.from({ length: 1 + Math.floor(random() * 5) }, () =>
    random() < 0.85 ? pick(ids) : 'absent',
  );
  return {
    data: { folders: [], folderContents } as FolderData,
    selected,
    source,
    target,
    insertIndex: Math.floor(random() * 14) - 1,
    mode: (random() < 0.7 ? 'manual' : 'recent') as ConversationSortMode,
  };
}

function snapshot(data: FolderData): string {
  return JSON.stringify(data);
}

describe('reorderConversations parity', () => {
  it.each(Array.from({ length: 400 }, (_, i) => i))(
    'matches the old moves for case #%i',
    (seed) => {
      const { data, selected, source, target, insertIndex, mode } = randomCase(seed + 1);
      const before = snapshot(data);
      const expected = oldReorderConversations(data, selected, source, target, insertIndex, mode);
      const actual = reorderConversations(data, selected, source, target, insertIndex, mode);
      expect(snapshot(data)).toBe(before);
      if (expected === data) {
        expect(actual).toBe(data);
        return;
      }
      expect(Object.keys(actual.folderContents)).toEqual(Object.keys(expected.folderContents));
      expect(actual).toStrictEqual(expected);
    },
  );

  it('moves the first stored copy of each selected id, in selection order', () => {
    const conversation = (id: string, title: string, sortIndex: number): ConversationReference => ({
      conversationId: id,
      title,
      url: `/app/${id}`,
      addedAt: 1,
      sortIndex,
    });
    const data: FolderData = {
      folders: [],
      folderContents: {
        a: [
          conversation('x', 'first x', 0),
          conversation('y', 'first y', 1),
          conversation('x', 'second x', 2),
        ],
        b: [conversation('z', 'z', 0)],
      },
    };
    const next = reorderConversations(data, ['y', 'x', 'y'], 'a', 'b', 0);
    expect(next.folderContents.b.map((item) => item.title)).toEqual(['first y', 'first x', 'z']);
    expect(next.folderContents.a).toEqual([]);
  });
});
