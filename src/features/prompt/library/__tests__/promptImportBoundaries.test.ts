import { describe, expect, it } from 'vitest';

import { PromptImportExportService } from '@/features/backup/services/PromptImportExportService';
import type { PromptItem } from '@/features/backup/types/backup';

import { mergeImportedPrompts } from '../mergeImportedPrompts';
import { parsePromptLibraryOp } from '../promptLibraryMessages';
import { PROMPT_LIBRARY_KEY, createPromptLibraryOwner } from '../promptLibraryOwner';

const prompt = (id: string, extra: Partial<PromptItem> = {}): PromptItem => ({
  id,
  text: `Body of ${id}`,
  tags: [],
  createdAt: 1,
  ...extra,
});

const ids = (items: PromptItem[]) => items.map((item) => item.id);

describe('prompts import boundaries', () => {
  it('lets the id match win when the id and the text point at different prompts', () => {
    const library = [prompt('a'), prompt('b', { tags: ['kept'] })];
    // Same id as `a`, same body as `b`, and newer: it is an edit of `a`.
    const incoming = [prompt('a', { text: 'Body of b', tags: ['in'], updatedAt: 5 })];

    const { items, imported, duplicates } = mergeImportedPrompts(
      structuredClone(library),
      incoming,
    );

    expect([imported, duplicates]).toEqual([0, 1]);
    expect(items).toEqual([
      prompt('a', { text: 'Body of b', tags: ['in'], updatedAt: 5 }),
      prompt('b', { tags: ['kept'] }),
    ]);
  });

  it('matches a body to the earliest prompt holding it after an edit moved it there', () => {
    const library = [prompt('a'), prompt('b')];
    const incoming = [
      // `a` now holds b's body too, and comes first in the library.
      prompt('a', { text: 'Body of b', updatedAt: 5 }),
      prompt('z', { text: 'BODY OF B', tags: ['tag'] }),
    ];

    const { items } = mergeImportedPrompts(structuredClone(library), incoming);

    expect(items.map((item) => [item.id, item.tags])).toEqual([
      ['a', ['tag']],
      ['b', []],
    ]);
  });

  it('keeps adding after a stored prompt that the incoming list names twice', () => {
    const library = [prompt('a'), prompt('b')];
    const incoming = [prompt('a'), prompt('x'), prompt('b'), prompt('a'), prompt('y')];

    const { items } = mergeImportedPrompts(structuredClone(library), incoming);

    expect(ids(items)).toEqual(['a', 'x', 'y', 'b']);
  });

  it('fills an empty or missing library in incoming order, as given', async () => {
    const incoming = [prompt('x', { pinnedAt: 3, updatedAt: 3 }), prompt('y'), prompt('z')];

    expect(mergeImportedPrompts([], structuredClone(incoming)).items).toEqual(incoming);

    let library: unknown;
    const owner = createPromptLibraryOwner({
      area: {
        get: async () => (library === undefined ? {} : { [PROMPT_LIBRARY_KEY]: library }),
        set: async (items) => {
          library = structuredClone(items[PROMPT_LIBRARY_KEY]);
        },
      },
    });
    const result = await owner.apply({ kind: 'import', items: structuredClone(incoming) });
    expect(result).toMatchObject({ added: 3, skipped: 0, total: 3 });
    expect(library).toEqual(incoming);
  });

  it('keeps newer local text over an old file without times, and still adds its new prompts', async () => {
    let library: unknown = [
      prompt('edited', { text: 'NEW', updatedAt: 20 }),
      prompt('legacy', { text: 'Legacy, kept', createdAt: 5 }),
    ];
    const owner = createPromptLibraryOwner({
      area: {
        get: async () => ({ [PROMPT_LIBRARY_KEY]: structuredClone(library) }),
        set: async (items) => {
          library = structuredClone(items[PROMPT_LIBRARY_KEY]);
        },
      },
    });
    // An old backup file: no times, no pins. The popup validates it and sends the op.
    const file = JSON.parse(
      JSON.stringify({
        items: [
          { id: 'edited', text: 'OLD' },
          { id: 'legacy', text: 'Legacy, old' },
          { id: 'fresh', text: 'Fresh' },
        ],
      }),
    );
    const payload = PromptImportExportService.validatePayload(file);
    if (!payload.success) throw payload.error;
    const op = parsePromptLibraryOp({ kind: 'import', items: payload.data.items });
    if (!op) throw new Error('the op validator rejected the import');

    const result = await owner.apply(op);

    expect(result).toMatchObject({ added: 1, skipped: 2 });
    expect(library).toEqual([
      prompt('edited', { text: 'NEW', updatedAt: 20 }),
      prompt('legacy', { text: 'Legacy, kept', createdAt: 5 }),
      prompt('fresh', { text: 'Fresh', createdAt: 0 }),
    ]);
  });
});

describe('prompts import at library scale', () => {
  it('applies 5000 newer same-id edits and follows every body through the text index', () => {
    const size = 5000;
    const library = Array.from({ length: size }, (_, i) => prompt(`p${i}`));
    const incoming: PromptItem[] = library.map((item, i) => ({
      ...item,
      // Even prompts take the body their successor had, so bodies keep moving between prompts.
      text: i % 2 === 0 ? `Body of p${i + 1}` : `Edited ${item.id}`,
      updatedAt: 10,
    }));
    // No prompt holds p0's old body any more, so this one is new.
    incoming.push(prompt('new', { text: 'Body of p0' }));

    const { items, imported, duplicates } = mergeImportedPrompts(
      structuredClone(library),
      incoming,
    );

    expect([imported, duplicates]).toEqual([1, size]);
    expect(ids(items)).toEqual([...ids(library), 'new']);
    expect(items.map((item) => item.text)).toEqual(incoming.map((item) => item.text));
  });
});
