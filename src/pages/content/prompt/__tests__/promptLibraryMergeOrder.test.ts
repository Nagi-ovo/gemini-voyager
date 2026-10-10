import { describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { PromptItem } from '@/core/types/sync';
import { PromptImportExportService } from '@/features/backup/services/PromptImportExportService';
import {
  type PromptLibraryArea,
  createPromptLibraryOwner,
} from '@/features/prompt/library/promptLibraryOwner';
import { mergeCloudPrompts } from '@/pages/background/promptDriveMerge';

import { createPromptLibraryState } from '../promptLibraryState';

const KEY = StorageKeys.PROMPT_ITEMS;

const prompt = (id: string): PromptItem => ({ id, text: `Body of ${id}`, tags: [], createdAt: 1 });
const ids = (items: PromptItem[]) => items.map((item) => item.id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A Prompt Manager tab whose reorder is held on its way to the owner, so a
 * Drive merge lands while the reorder is still pending in the panel.
 */
async function tabWithHeldReorder(initial: PromptItem[]) {
  let stored: unknown = structuredClone(initial);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const area: PromptLibraryArea = {
    get: async () => ({ [KEY]: structuredClone(stored) }),
    set: async (items) => {
      stored = structuredClone(items[KEY]);
      state.receive(structuredClone(stored));
    },
  };
  const owner = createPromptLibraryOwner({ area });
  const state = createPromptLibraryState({
    read: async () => structuredClone(stored) as PromptItem[],
    apply: async (op) => {
      if (op.kind === 'reorder') await held;
      return owner.apply(op);
    },
  });
  await state.load();
  return { state, owner, release, stored: () => stored as PromptItem[] };
}

describe('a Drive merge while a Prompt Manager reorder is pending', () => {
  it('shows the reorder on top of the merged library, and stores what it showed', async () => {
    const pm = await tabWithHeldReorder([prompt('a'), prompt('b'), prompt('c')]);
    const [a, b, c] = pm.state.items;

    pm.state.reorder([c, a, b]);
    expect(ids(pm.state.items)).toEqual(['c', 'a', 'b']);

    // Drive lists the shared prompts in its own order, with a new one after `a`.
    await mergeCloudPrompts(
      pm.owner,
      PromptImportExportService.exportToPayload([prompt('b'), prompt('a'), prompt('x'), c]),
    );
    expect(ids(pm.stored())).toEqual(['a', 'x', 'b', 'c']);
    // The pending reorder puts c, a, b in the places they hold; `x` stays put.
    expect(ids(pm.state.items)).toEqual(['c', 'x', 'a', 'b']);

    pm.release();
    await flush();
    expect(ids(pm.stored())).toEqual(['c', 'x', 'a', 'b']);
    expect(pm.state.items).toEqual(pm.stored());
  });
});
