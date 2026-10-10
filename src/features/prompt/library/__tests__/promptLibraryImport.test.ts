import { describe, expect, it } from 'vitest';

import { PromptImportExportService } from '@/features/backup/services/PromptImportExportService';

import { PROMPT_LIBRARY_KEY, createPromptLibraryOwner } from '../promptLibraryOwner';

/**
 * Imports a prompts file, as the popup does: validated by the service, then
 * merged into the stored library by the owner. Returns the owner's result and
 * the library it stored.
 */
async function importFile(stored: unknown[], file: unknown) {
  let library: unknown = structuredClone(stored);
  const owner = createPromptLibraryOwner({
    area: {
      get: async () => ({ [PROMPT_LIBRARY_KEY]: structuredClone(library) }),
      set: async (items) => {
        library = structuredClone(items[PROMPT_LIBRARY_KEY]);
      },
    },
  });
  const payload = PromptImportExportService.validatePayload(file);
  if (!payload.success) throw payload.error;
  const result = await owner.apply({ kind: 'import', items: payload.data.items });
  return { result, library };
}

describe('prompts import', () => {
  it('merges duplicate text into the stored prompt and adds the rest', async () => {
    const { result, library } = await importFile(
      [{ id: 'existing', text: 'Same prompt', tags: ['local'], createdAt: 1 }],
      {
        format: 'gemini-voyager.prompts.v1',
        items: [
          { text: 'Same prompt', tags: ['imported'], name: 'Imported title' },
          { text: 'New prompt', tags: ['new'] },
        ],
      },
    );

    expect(result).toMatchObject({ added: 1, skipped: 1, nameConflicts: 0, total: 2 });
    expect(library).toEqual([
      expect.objectContaining({
        id: 'existing',
        text: 'Same prompt',
        tags: ['local', 'imported'],
        name: 'Imported title',
      }),
      expect.objectContaining({ text: 'New prompt', tags: ['new'] }),
    ]);
  });

  it('preserves historical and newly imported duplicate-name prompts', async () => {
    const historicalItems = [
      { id: 'legacy-a', name: 'Translator', text: 'First body', tags: [], createdAt: 1 },
      { id: 'legacy-b', name: 'Ｔｒａｎｓｌａｔｏｒ', text: 'Second body', tags: [], createdAt: 2 },
      { id: 'legacy-c', name: 'translator', text: 'First body', tags: [], createdAt: 3 },
    ];
    const { result, library } = await importFile(historicalItems, {
      format: 'gemini-voyager.prompts.v1',
      items: [
        { text: 'Conflicting body', tags: [], name: 'translator' },
        { text: 'Unique body', tags: [], name: 'Summarizer' },
        { text: 'Another conflict', tags: [], name: 'summarizer' },
      ],
    });

    expect(result).toMatchObject({ added: 3, nameConflicts: 6, total: 6 });
    expect(library).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'translator', text: 'Conflicting body' }),
        expect.objectContaining({ name: 'Summarizer', text: 'Unique body' }),
        expect.objectContaining({ name: 'summarizer', text: 'Another conflict' }),
        ...historicalItems,
      ]),
    );
  });

  it('merges duplicate text while preserving an incoming conflicting name', async () => {
    const { result, library } = await importFile(
      [
        { id: 'named', name: 'Translator', text: 'Named body', tags: [], createdAt: 1 },
        { id: 'legacy', text: 'Legacy body', tags: ['local'], createdAt: 2 },
      ],
      {
        format: 'gemini-voyager.prompts.v1',
        items: [{ text: 'Legacy body', tags: ['imported'], name: 'translator' }],
      },
    );

    expect(result).toMatchObject({ skipped: 1, nameConflicts: 2 });
    expect(library).toEqual([
      expect.objectContaining({ id: 'named', name: 'Translator' }),
      expect.objectContaining({ id: 'legacy', name: 'translator', tags: ['local', 'imported'] }),
    ]);
  });

  it('applies a newer same-ID body edit and its conflicting cloud rename', async () => {
    const { result, library } = await importFile(
      [
        {
          id: 'editing',
          name: 'Translator',
          text: 'Old body',
          tags: ['local'],
          createdAt: 1,
          updatedAt: 1,
        },
        { id: 'other', name: 'Summarizer', text: 'Other body', tags: [], createdAt: 1 },
      ],
      {
        format: 'gemini-voyager.prompts.v1',
        items: [
          {
            id: 'editing',
            name: 'summarizer',
            text: 'New body',
            tags: ['cloud'],
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      },
    );

    expect(result).toMatchObject({ skipped: 1, nameConflicts: 2 });
    expect(library).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'editing',
          name: 'summarizer',
          text: 'New body',
          tags: ['local', 'cloud'],
        }),
      ]),
    );
  });

  it('applies a newer legacy same-ID body while preserving the existing name', async () => {
    const { result, library } = await importFile(
      [
        {
          id: 'editing',
          name: 'Translator',
          text: 'Old body',
          tags: ['local'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        format: 'gemini-voyager.prompts.v1',
        items: [{ id: 'editing', text: 'New body', tags: ['cloud'], createdAt: 1, updatedAt: 2 }],
      },
    );

    expect(result).toMatchObject({ skipped: 1, nameConflicts: 0 });
    expect(library).toEqual([
      expect.objectContaining({
        id: 'editing',
        name: 'Translator',
        text: 'New body',
        tags: ['local', 'cloud'],
      }),
    ]);
  });
});
