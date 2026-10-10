import { describe, expect, it } from 'vitest';

import type { HighlightRecordV1 } from '@/core/types/highlight';
import { hashString } from '@/core/utils/hash';
import type { StarredMessage } from '@/features/savedLibrary/starTypes';
import { makeRecord as makeHighlightRecord } from '@/pages/content/highlight/__tests__/fixtures';

import { savedLibraryItemKey, toSavedLibraryItems } from '../model';
import { type SavedLibrarySelection, getSavedLibraryView } from '../viewModel';

function makeRecord(overrides: Partial<HighlightRecordV1>) {
  return makeHighlightRecord(
    {
      quote: { exact: 'Stored selection', prefix: '', suffix: '' },
      position: { start: 0, end: 16 },
      sourceTextHash: 'hash',
    },
    overrides,
  );
}

const selection: SavedLibrarySelection = { kind: 'all', query: '', site: 'all', account: 'all' };
const star: StarredMessage = {
  conversationId: 'conversation-one',
  conversationUrl: 'https://gemini.google.com/u/1/app/one',
  turnId: 'turn-one',
  content: 'Stored preview',
  starredAt: 200,
};

describe('saved library conversation views', () => {
  it('a ChatGPT switch prompt and account filter use the same stable account numbers', () => {
    const items = toSavedLibraryItems(
      [
        {
          ...star,
          conversationId: 'chatgpt:conv:one',
          conversationUrl: 'https://chatgpt.com/c/one',
          account: 'chatgpt:first',
          starredAt: 100,
        },
        {
          ...star,
          conversationId: 'chatgpt:conv:two',
          conversationUrl: 'https://chatgpt.com/c/two',
          account: 'chatgpt:second',
          starredAt: 200,
        },
        {
          ...star,
          conversationId: 'chatgpt:conv:legacy',
          conversationUrl: 'https://chatgpt.com/c/legacy',
          starredAt: 300,
        },
      ],
      [],
    );
    const view = getSavedLibraryView(items, { ...selection, site: 'chatgpt' });
    expect(view.accounts.map((account) => account.number)).toEqual([1, 2, 0]);
    const second = view.accounts.find((account) => account.number === 2)!;
    const filtered = getSavedLibraryView(items, {
      ...selection,
      site: 'chatgpt',
      account: second.id,
      query: 'Stored',
    });
    expect(filtered.items.map((item) => item.account)).toEqual(['chatgpt:second']);
    expect(filtered.groups[0].accountNumber).toBe(2);
  });
  it('resolves site labels from prefixed records and legacy native URLs', () => {
    const items = toSavedLibraryItems(
      [
        star,
        {
          ...star,
          conversationId: 'studio-legacy',
          conversationUrl: 'https://aistudio.google.cn/prompts/one',
        },
        {
          ...star,
          conversationId: 'chatgpt:conv:one',
          conversationUrl: 'https://chatgpt.com/c/one',
        },
        {
          ...star,
          conversationId: 'claude:conv:one',
          conversationUrl: 'https://chatgpt.com/c/one',
        },
        { ...star, conversationId: 'unknown', conversationUrl: 'https://example.com/one' },
      ],
      [],
    );
    const view = getSavedLibraryView(items, selection);
    expect(view.sites).toEqual(
      expect.arrayContaining([
        { id: 'gemini', label: 'Gemini' },
        { id: 'aistudio', label: 'AI Studio' },
        { id: 'chatgpt', label: 'ChatGPT' },
        { id: 'unknown', label: '' },
      ]),
    );
    expect(getSavedLibraryView(items, { ...selection, site: 'unknown' }).items).toHaveLength(2);
    expect(getSavedLibraryView(items, { ...selection, site: 'chatgpt' }).accounts).toEqual([]);
  });

  it('groups Gemini stars with highlights only when their captured account identities match', () => {
    const items = toSavedLibraryItems(
      [
        { ...star, account: 'route:1', conversationTitle: 'Latest title', starredAt: 400 },
        { ...star, account: 'route:2', turnId: 'other-turn' },
        { ...star, turnId: 'legacy-turn' },
      ],
      [
        makeRecord({
          id: 'highlight',
          conversationId: star.conversationId,
          conversationUrl: star.conversationUrl,
          accountHash: hashString('route:1'),
          createdAt: 100,
          updatedAt: 300,
          conversationTitle: 'Older title',
        }),
      ],
    );
    const view = getSavedLibraryView(items, { ...selection, site: 'gemini' });
    expect(view.groups).toHaveLength(3);
    expect(view.groups[0].items.map((item) => item.kind)).toEqual(['starred', 'highlight']);
    expect(view.groups[0].title).toBe('Latest title');
    expect(view.groups[0]).toMatchObject({ siteLabel: 'Gemini', accountNumber: 1 });
    expect(view.accounts.map((account) => account.number)).toEqual([1, 2, 0]);
    const firstAccount = view.accounts[0].id;
    expect(
      getSavedLibraryView(items, { ...selection, site: 'gemini', account: firstAccount }).items,
    ).toHaveLength(2);
    expect(
      getSavedLibraryView(items, { ...selection, site: 'gemini', account: 'unassigned' }).items.map(
        (item) => item.turnId,
      ),
    ).toEqual(['legacy-turn']);
    expect(
      items.find((item) => item.kind === 'starred' && item.turnId === star.turnId)?.account,
    ).toBe('route:1');
  });

  it('does not infer account ownership from a route or merge unproven AI Studio identities', () => {
    const items = toSavedLibraryItems(
      [
        {
          ...star,
          conversationUrl: 'https://aistudio.google.com/u/1/prompts/one',
          account: 'route:1',
        },
        {
          ...star,
          conversationUrl: 'https://aistudio.google.com/u/1/prompts/one',
          turnId: 'unassigned',
        },
      ],
      [
        makeRecord({
          platform: 'aistudio',
          accountHash: hashString('route:1'),
          conversationId: star.conversationId,
          conversationUrl: 'https://aistudio.google.com/u/1/prompts/one',
        }),
      ],
    );
    const view = getSavedLibraryView(items, { ...selection, site: 'aistudio' });
    expect(view.groups).toHaveLength(3);
    expect(view.accounts).toHaveLength(3);
    expect(
      getSavedLibraryView(items, {
        ...selection,
        site: 'aistudio',
        account: 'unassigned',
      }).items.map((item) => item.turnId),
    ).toEqual(['unassigned']);
  });

  it('keeps account numbering stable through kind and text filtering and uses creation time', () => {
    const items = toSavedLibraryItems(
      [{ ...star, account: 'second', starredAt: 200, conversationTitle: 'Newest title' }],
      [
        makeRecord({
          accountHash: hashString('first'),
          createdAt: 100,
          updatedAt: 900,
          note: 'Find me',
        }),
      ],
    );
    const base = getSavedLibraryView(items, { ...selection, site: 'gemini' });
    const filtered = getSavedLibraryView(items, {
      ...selection,
      site: 'gemini',
      kind: 'starred',
      query: 'preview',
    });
    expect(filtered.accounts).toEqual(base.accounts);
    expect(filtered.items).toHaveLength(1);
    expect(
      getSavedLibraryView(items, {
        ...selection,
        site: 'gemini',
        account: base.accounts[0].id,
      }).items.map((item) => item.kind),
    ).toEqual(['highlight']);
    expect(getSavedLibraryView(items, selection).groups[0]).toMatchObject({
      siteLabel: 'Gemini',
      accountNumber: 1,
    });
    expect(filtered.groups[0].accountNumber).toBe(2);
    expect(
      getSavedLibraryView(items, { ...selection, kind: 'highlights', query: 'Find me' }).items,
    ).toHaveLength(1);
  });

  it('keeps different sites separate and orders conversations and their items newest first', () => {
    const items = toSavedLibraryItems(
      [
        { ...star, account: 'one', starredAt: 100, conversationTitle: 'Earlier title' },
        { ...star, account: 'one', turnId: 'later', starredAt: 300, conversationTitle: '' },
        {
          ...star,
          account: 'one',
          conversationUrl: 'https://aistudio.google.com/prompts/one',
          starredAt: 200,
        },
      ],
      [],
    );
    const view = getSavedLibraryView(items, selection);
    expect(view.groups.map((group) => group.site)).toEqual(['gemini', 'aistudio']);
    expect(view.groups[0].items.map((item) => item.savedAt)).toEqual([300, 100]);
    expect(view.groups[0].title).toBe('Earlier title');
    expect(view.groups[1].title).toBeUndefined();
  });

  it('distinguishes imported highlight ids in different account scopes without changing their raw ids', () => {
    const items = toSavedLibraryItems(
      [],
      [makeRecord({ accountHash: 'first' }), makeRecord({ accountHash: 'second' })],
    );
    expect(items[0].id).toBe(items[1].id);
    expect(savedLibraryItemKey(items[0])).not.toBe(savedLibraryItemKey(items[1]));
  });
});
