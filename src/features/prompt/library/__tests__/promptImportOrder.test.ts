import { describe, expect, it } from 'vitest';

import { PromptImportExportService } from '@/features/backup/services/PromptImportExportService';
import type { PromptItem } from '@/features/backup/types/backup';
import { sortPinnedFirst } from '@/pages/content/prompt/promptPinning';

import { PROMPT_LIBRARY_KEY, createPromptLibraryOwner } from '../promptLibraryOwner';

/** Imports `incoming` through the owner and returns the library it stored. */
async function importInto(stored: PromptItem[], incoming: PromptItem[]): Promise<PromptItem[]> {
  let library: unknown = structuredClone(stored);
  const owner = createPromptLibraryOwner({
    area: {
      get: async () => ({ [PROMPT_LIBRARY_KEY]: structuredClone(library) }),
      set: async (items) => {
        library = structuredClone(items[PROMPT_LIBRARY_KEY]);
      },
    },
  });
  await owner.apply({ kind: 'import', items: structuredClone(incoming) });
  return library as PromptItem[];
}

// `createdAt` values are chosen so that the manual order is not newest-first.
const prompt = (id: string, createdAt: number, extra: Partial<PromptItem> = {}): PromptItem => ({
  id,
  text: `Body of ${id}`,
  tags: [],
  createdAt,
  ...extra,
});

const ids = (items: PromptItem[]) => items.map((item) => item.id);

describe('prompt order on import', () => {
  it('keeps the manual order of the library when a file adds prompts', async () => {
    const library = [prompt('mid', 2), prompt('newest', 3), prompt('oldest', 1)];
    const file = PromptImportExportService.exportToPayload([prompt('f1', 7), prompt('f2', 9)]);
    const payload = PromptImportExportService.validatePayload(file);
    if (!payload.success) throw payload.error;

    const stored = await importInto(library, payload.data.items);

    // A file sharing nothing with the library lands at the top, in file order.
    expect(ids(stored)).toEqual(['f1', 'f2', 'mid', 'newest', 'oldest']);
  });

  it('keeps local order when the file lists the same prompts in another order', async () => {
    const library = [prompt('b', 2), prompt('a', 3), prompt('c', 1)];

    const stored = await importInto(library, [prompt('a', 3), prompt('b', 2), prompt('c', 1)]);

    expect(ids(stored)).toEqual(['b', 'a', 'c']);
  });

  it('places each new prompt after the stored prompt it follows in the file', async () => {
    const library = [prompt('a', 1), prompt('b', 3), prompt('c', 2)];
    const incoming = [
      prompt('x', 5),
      prompt('b', 3),
      prompt('y', 6),
      prompt('z', 4),
      prompt('a', 1),
      prompt('w', 7),
    ];

    const stored = await importInto(library, incoming);

    expect(ids(stored)).toEqual(['x', 'a', 'w', 'b', 'y', 'z', 'c']);
  });

  it('anchors on a stored prompt matched by text, not on a prompt the same import added', async () => {
    const library = [prompt('a', 1), prompt('b', 2)];
    const incoming = [
      prompt('b', 2),
      prompt('x', 5),
      { ...prompt('other-id', 9), text: 'BODY OF A' },
      { ...prompt('x-again', 6), text: 'Body of x' },
      prompt('y', 7),
    ];

    const stored = await importInto(library, incoming);

    expect(ids(stored)).toEqual(['a', 'y', 'b', 'x']);
  });

  it('leaves pins alone while placing prompts', async () => {
    const library = [prompt('p1', 3), prompt('p2', 1, { pinnedAt: 5 }), prompt('p3', 2)];
    const incoming = [prompt('p2', 1, { pinnedAt: 5 }), prompt('q', 4, { pinnedAt: 7 })];

    const stored = await importInto(library, incoming);

    expect(ids(stored)).toEqual(['p1', 'p2', 'q', 'p3']);
    expect(stored.map((item) => item.pinnedAt)).toEqual([undefined, 5, 7, undefined]);
    expect(ids(sortPinnedFirst(stored))).toEqual(['p2', 'q', 'p1', 'p3']);
  });
});
