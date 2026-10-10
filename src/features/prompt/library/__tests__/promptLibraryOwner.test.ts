import { describe, expect, it } from 'vitest';

import { PromptImportExportService } from '@/features/backup/services/PromptImportExportService';
import type { PromptItem } from '@/features/backup/types/backup';

import { mergeImportedPrompts } from '../mergeImportedPrompts';
import {
  createPromptLibraryClient,
  handlePromptLibraryApplyMessage,
  parsePromptLibraryOp,
} from '../promptLibraryMessages';
import {
  PROMPT_LIBRARY_KEY,
  type PromptLibraryArea,
  createPromptLibraryOwner,
} from '../promptLibraryOwner';

/** One in-memory storage area, counting writes. */
function memoryArea(initial?: unknown) {
  const data = new Map<string, unknown>(
    initial === undefined ? [] : [[PROMPT_LIBRARY_KEY, structuredClone(initial)]],
  );
  let writes = 0;
  const area: PromptLibraryArea = {
    get: async (key) => (data.has(key) ? { [key]: structuredClone(data.get(key)) } : {}),
    set: async (items) => {
      writes += 1;
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    },
  };
  return {
    area,
    stored: () => data.get(PROMPT_LIBRARY_KEY),
    /** A write that bypasses the owner, as an unrouted writer would. */
    writeDirect: (value: unknown) => data.set(PROMPT_LIBRARY_KEY, structuredClone(value)),
    writes: () => writes,
  };
}

const prompt = (id: string, text: string, extra: Partial<PromptItem> = {}): PromptItem => ({
  id,
  text,
  tags: [],
  createdAt: 1,
  ...extra,
});

describe('prompt library owner', () => {
  it('keeps both of two adds sent at the same moment', async () => {
    const { area, stored } = memoryArea([prompt('a', 'Existing')]);
    const owner = createPromptLibraryOwner({ area });

    await Promise.all([
      owner.apply({ kind: 'add', items: [prompt('t1', 'From tab one')] }),
      owner.apply({ kind: 'add', items: [prompt('t2', 'From tab two')] }),
    ]);

    expect((stored() as PromptItem[]).map((item) => item.id).sort()).toEqual(['a', 't1', 't2']);
  });

  it('applies each op to the library as stored when it runs, not as it was when sent', async () => {
    const { area, stored, writeDirect } = memoryArea([prompt('a', 'Old text')]);
    const owner = createPromptLibraryOwner({ area });
    writeDirect([prompt('a', 'Edited elsewhere')]);

    await owner.apply({ kind: 'add', items: [prompt('t', 'Template')] });

    expect(stored()).toEqual([prompt('t', 'Template'), prompt('a', 'Edited elsewhere')]);
  });

  it('adds only prompts whose id, text and name are all free, and writes others back as stored', async () => {
    const original = [
      { id: 'a', text: 'Alpha', tags: ['x'], createdAt: 1, name: 'First', extra: { kept: true } },
      'legacy junk',
    ];
    const { area, stored, writes } = memoryArea(original);
    const owner = createPromptLibraryOwner({ area });

    const result = await owner.apply({
      kind: 'add',
      items: [
        prompt('a', 'Different text'),
        prompt('b', '  ALPHA '),
        prompt('c', 'New', { name: 'first' }),
        prompt('d', 'Fresh one', { name: 'Fresh' }),
        prompt('e', 'Fresh two', { name: 'Fresh' }),
      ],
    });

    expect(result).toEqual({
      added: 1,
      skipped: 4,
      total: 3,
      nameConflicts: 0,
      items: [prompt('d', 'Fresh one', { name: 'Fresh' }), ...original],
    });
    expect(stored()).toEqual(result.items);
    expect(writes()).toBe(1);

    await owner.apply({ kind: 'add', items: [prompt('z', 'alpha')] });
    expect(writes()).toBe(1);
  });

  it('updates, deletes and reorders by id, leaving prompts it was not told about in place', async () => {
    const { area, stored } = memoryArea([
      prompt('a', 'A', { pinnedAt: 5 }),
      prompt('b', 'B'),
      prompt('new', 'Added meanwhile'),
      prompt('c', 'C'),
    ]);
    const owner = createPromptLibraryOwner({ area });

    await owner.apply({ kind: 'update', id: 'a', changes: { text: 'A2', pinnedAt: null } });
    await owner.apply({ kind: 'reorder', ids: ['c', 'b', 'a'] });
    await owner.apply({ kind: 'delete', id: 'b' });
    await owner.apply({ kind: 'update', id: 'missing', changes: { text: 'X' } });

    expect(stored()).toEqual([
      prompt('c', 'C'),
      prompt('new', 'Added meanwhile'),
      // An unpin is written as `null`, so a merge can tell it from a copy that never had a pin.
      prompt('a', 'A2', { pinnedAt: null }),
    ]);
  });

  it('imports exactly as the prompts import merges', async () => {
    const library = [prompt('a', 'Alpha', { tags: ['x'] }), prompt('b', 'Beta')];
    const incoming = [prompt('z', 'alpha', { tags: ['y'] }), prompt('c', 'Gamma')];
    const { area, stored } = memoryArea(library);
    const owner = createPromptLibraryOwner({ area });

    const result = await owner.apply({ kind: 'import', items: structuredClone(incoming) });
    const expected = mergeImportedPrompts(structuredClone(library), structuredClone(incoming));

    expect(stored()).toEqual(expected.items);
    expect(result).toEqual({
      added: 1,
      skipped: 1,
      total: 3,
      nameConflicts: 0,
      items: expected.items,
    });
  });

  it('adds imported prompts with their own times, and puts unrelated prompts first', async () => {
    // Stamping the import time would make a copy look edited when it was only synced.
    const { area, stored } = memoryArea([
      prompt('old', 'Old', { createdAt: 10 }),
      prompt('older', 'Older', { createdAt: 5 }),
    ]);
    const owner = createPromptLibraryOwner({ area });

    await owner.apply({
      kind: 'import',
      items: [
        prompt('n1', 'New one', { createdAt: 1 }),
        prompt('n2', 'New two', { createdAt: 2, updatedAt: 3 }),
      ],
    });

    expect(stored()).toEqual([
      prompt('n1', 'New one', { createdAt: 1 }),
      prompt('n2', 'New two', { createdAt: 2, updatedAt: 3 }),
      prompt('old', 'Old', { createdAt: 10 }),
      prompt('older', 'Older', { createdAt: 5 }),
    ]);
  });

  it('seeds an empty library once, keeping legacy records as they were', async () => {
    const legacy = [{ id: 'l', text: 'Legacy', tags: [], createdAt: 1, extra: 'kept' }];
    const empty = memoryArea();
    const owner = createPromptLibraryOwner({ area: empty.area });

    await expect(owner.apply({ kind: 'seed', items: legacy })).resolves.toMatchObject({
      added: 1,
      items: legacy,
    });
    await owner.apply({ kind: 'seed', items: [{ id: 'other', text: 'Other' }] });
    expect(empty.stored()).toEqual(legacy);

    for (const existing of [[], [prompt('a', 'A')], { not: 'a list' }]) {
      const area = memoryArea(existing);
      await createPromptLibraryOwner({ area: area.area }).apply({ kind: 'seed', items: legacy });
      expect(area.stored()).toEqual(existing);
      expect(area.writes()).toBe(0);
    }
  });

  it('goes on with the next op after a write fails', async () => {
    const { area, stored } = memoryArea([prompt('a', 'A')]);
    const set = area.set;
    let failNext = true;
    area.set = async (items) => {
      if (failNext) {
        failNext = false;
        throw new Error('Quota exceeded');
      }
      return set(items);
    };
    const owner = createPromptLibraryOwner({ area });

    const [failed, next] = await Promise.allSettled([
      owner.apply({ kind: 'add', items: [prompt('b', 'B')] }),
      owner.apply({ kind: 'add', items: [prompt('c', 'C')] }),
    ]);

    expect(failed.status).toBe('rejected');
    expect(next.status).toBe('fulfilled');
    expect(stored()).toEqual([prompt('c', 'C'), prompt('a', 'A')]);
  });

  it('never overwrites a stored value that is not a list, and goes on with the next op', async () => {
    const { area, stored, writeDirect } = memoryArea({ not: 'a list' });
    const owner = createPromptLibraryOwner({ area });

    await expect(owner.apply({ kind: 'add', items: [prompt('a', 'A')] })).rejects.toThrow();
    expect(stored()).toEqual({ not: 'a list' });

    writeDirect([]);
    await owner.apply({ kind: 'add', items: [prompt('a', 'A')] });
    expect(stored()).toEqual([prompt('a', 'A')]);
  });

  it('lets an in-process merge run on the fresh library between queued writes', async () => {
    const { area, stored } = memoryArea([]);
    const owner = createPromptLibraryOwner({ area });

    const pending = [
      owner.apply({ kind: 'add', items: [prompt('t', 'Template')] }),
      owner.transact((items) => ({
        items: [...items, prompt('d', 'From Drive')],
        result: items.length,
      })),
    ];

    await expect(Promise.all(pending)).resolves.toEqual([
      { added: 1, skipped: 0, total: 1, nameConflicts: 0, items: [prompt('t', 'Template')] },
      1,
    ]);
    expect(stored()).toEqual([prompt('t', 'Template'), prompt('d', 'From Drive')]);
  });
});

describe('prompt library messages', () => {
  it('accepts only well-formed ops, rebuilt from their known fields', () => {
    expect(
      parsePromptLibraryOp({ kind: 'add', items: [{ ...prompt('a', 'A'), injected: '<b>' }] }),
    ).toEqual({ kind: 'add', items: [prompt('a', 'A')] });
    for (const op of [
      null,
      { kind: 'wipe' },
      { kind: 'add', items: [] },
      { kind: 'add', items: [{ id: 'a', text: '  ', tags: [], createdAt: 1 }] },
      { kind: 'add', items: [{ id: 'a', text: 'A', tags: 'x', createdAt: 1 }] },
      { kind: 'import', items: [{ id: '', text: 'A', tags: [], createdAt: 1 }] },
      { kind: 'update', id: 'a', changes: { text: 5 } },
      { kind: 'update', id: 'a', changes: { pinnedAt: 'now' } },
      { kind: 'delete' },
      { kind: 'reorder', ids: ['a', 1] },
      { kind: 'seed', items: ['not a record'] },
      { kind: 'add', items: [prompt('x'.repeat(1025), 'Long id')] },
      { kind: 'add', items: [prompt('a', 'A', { tags: ['t'.repeat(1025)] })] },
      {
        kind: 'add',
        items: [prompt('a', 'A', { tags: Array.from({ length: 1001 }, (_, i) => `${i}`) })],
      },
      { kind: 'update', id: 'a', changes: { text: 'x'.repeat(10 * 1024 * 1024 + 1) } },
    ]) {
      expect(parsePromptLibraryOp(op)).toBeNull();
    }
  });

  it('refuses an op over the byte budget, counting multibyte text as UTF-8', () => {
    // Each prompt fits on its own; together they pass 32 MiB only as UTF-8.
    const text = '字'.repeat(3 * 1024 * 1024);
    const items = [prompt('a', text), prompt('b', text), prompt('c', text), prompt('d', text)];
    expect(parsePromptLibraryOp({ kind: 'import', items })).toBeNull();
    expect(parsePromptLibraryOp({ kind: 'import', items: items.slice(0, 3) })).not.toBeNull();
  });

  it('accepts every prompt the prompts import accepts', () => {
    const validated = PromptImportExportService.validatePayload({
      format: 'gemini-voyager.prompts.v1',
      items: [
        { text: '  No id, tags or date  ' },
        { id: 'b', text: 'Named', tags: ['A', 'a', 3], name: ' Name ', pinnedAt: 2 },
        { id: 'c', text: 'Dated', tags: [], createdAt: 5, updatedAt: 6 },
        { id: 'd', text: 'Unpinned', tags: [], createdAt: 5, updatedAt: 7, pinnedAt: null },
      ],
    });
    expect(validated.success && validated.data.items[3].pinnedAt).toBeNull();
    if (!validated.success) throw new Error('expected a valid payload');

    expect(parsePromptLibraryOp({ kind: 'import', items: validated.data.items })).toEqual({
      kind: 'import',
      items: validated.data.items,
    });
  });

  it('carries an op from a writer to the owner and its result back', async () => {
    const { area, stored } = memoryArea([]);
    const owner = createPromptLibraryOwner({ area });
    const client = createPromptLibraryClient((request) =>
      handlePromptLibraryApplyMessage(structuredClone(request), owner),
    );

    await expect(client.apply({ kind: 'add', items: [prompt('a', 'A')] })).resolves.toEqual({
      added: 1,
      skipped: 0,
      total: 1,
      nameConflicts: 0,
      items: [prompt('a', 'A')],
    });
    expect(stored()).toEqual([prompt('a', 'A')]);

    const refused = createPromptLibraryClient(async () => ({ ok: false, error: 'invalid_op' }));
    await expect(refused.apply({ kind: 'delete', id: 'a' })).rejects.toThrow('invalid_op');
    await expect(
      handlePromptLibraryApplyMessage({ type: 'gv.promptLibrary.apply', op: { kind: 'x' } }, owner),
    ).resolves.toEqual({ ok: false, error: 'invalid_op' });
  });
});
