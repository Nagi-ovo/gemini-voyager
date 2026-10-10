import { describe, expect, it } from 'vitest';

import type { PromptItem } from '@/core/types/sync';

import { ghostSuffix, hasSlashEligiblePrompts, matchSlashPrompts } from '../slashMatch';

const prompts: PromptItem[] = [
  {
    id: 'translate',
    name: 'Translator',
    text: 'Translate the following text into Chinese.',
    tags: ['writing', 'language'],
    createdAt: 1,
  },
  {
    id: 'review',
    name: 'Code Review',
    text: 'Review this code and report correctness issues.',
    tags: ['code'],
    createdAt: 2,
  },
  {
    id: 'legacy',
    text: 'Legacy body without a name',
    tags: ['legacy'],
    createdAt: 3,
  },
];

describe('matchSlashPrompts', () => {
  it('matches only prompt names and excludes legacy prompts without names', () => {
    expect(matchSlashPrompts(prompts, 'review').map((item) => item.id)).toEqual(['review']);
    expect(matchSlashPrompts(prompts, 'correctness')).toEqual([]);
    expect(matchSlashPrompts(prompts, 'legacy')).toEqual([]);
  });

  it('excludes every member of a normalized duplicate-name group', () => {
    const duplicateNames: PromptItem[] = [
      { id: 'first', name: 'Translator', text: 'First body', tags: [], createdAt: 1 },
      { id: 'second', name: 'ＴＲＡＮＳＬＡＴＯＲ', text: 'Second body', tags: [], createdAt: 2 },
      { id: 'unique', name: 'Summarizer', text: 'Unique body', tags: [], createdAt: 3 },
    ];

    expect(matchSlashPrompts(duplicateNames, 'translator')).toEqual([]);
    expect(matchSlashPrompts(duplicateNames, 'summarizer').map((item) => item.id)).toEqual([
      'unique',
    ]);
  });

  it('restores slash eligibility as soon as duplicate prompts have unique names', () => {
    const items: PromptItem[] = [
      { id: 'first', name: 'Translator', text: 'First body', tags: [], createdAt: 1 },
      { id: 'second', name: 'translator', text: 'Second body', tags: [], createdAt: 2 },
    ];

    expect(matchSlashPrompts(items, 'translator')).toEqual([]);

    items[1] = { ...items[1], name: 'Editor' };

    expect(matchSlashPrompts(items, 'translator').map((item) => item.id)).toEqual(['first']);
    expect(matchSlashPrompts(items, 'editor').map((item) => item.id)).toEqual(['second']);
  });
});

describe('hasSlashEligiblePrompts', () => {
  it('requires a non-empty name that is not part of a normalized conflict group', () => {
    const duplicateNames: PromptItem[] = [
      { id: 'first', name: 'Translator', text: 'First body', tags: [], createdAt: 1 },
      { id: 'second', name: 'ＴＲＡＮＳＬＡＴＯＲ', text: 'Second body', tags: [], createdAt: 2 },
      { id: 'legacy', text: 'Legacy body', tags: [], createdAt: 3 },
      { id: 'blank', name: '  ', text: 'Blank name', tags: [], createdAt: 4 },
    ];

    expect(hasSlashEligiblePrompts(duplicateNames)).toBe(false);
    expect(
      hasSlashEligiblePrompts([
        ...duplicateNames,
        { id: 'unique', name: 'Summarizer', text: 'Unique body', tags: [], createdAt: 5 },
      ]),
    ).toBe(true);
  });
});

describe('ghostSuffix', () => {
  it('completes the rest of the selected name past what was typed', () => {
    expect(ghostSuffix('Trans', 'Translator')).toBe('lator');
    // Matching is case-insensitive; the completion keeps the saved casing.
    expect(ghostSuffix('trans', 'Translator')).toBe('lator');
    // Nothing to add once the name is fully typed.
    expect(ghostSuffix('Translator', 'Translator')).toBe('');
    // A row reached with the arrow keys need not start with the query.
    expect(ghostSuffix('rev', 'Translator')).toBe('');
    expect(ghostSuffix('', 'Translator')).toBe('');
  });
});
