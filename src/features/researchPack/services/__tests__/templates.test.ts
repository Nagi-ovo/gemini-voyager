import { describe, expect, it } from 'vitest';

import { PromptImportExportService } from '@/features/backup/services/PromptImportExportService';
import {
  createPromptLibraryClient,
  handlePromptLibraryApplyMessage,
} from '@/features/prompt/library/promptLibraryMessages';
import {
  type PromptLibraryArea,
  createPromptLibraryOwner,
} from '@/features/prompt/library/promptLibraryOwner';

import {
  PROMPT_EXPORT_FORMAT,
  RESEARCH_PACK_TEMPLATE_LIMITS,
  RESEARCH_PACK_TEMPLATE_TAG,
  buildTemplateFile,
  createTemplateLibrary,
  listTemplates,
  parseTemplateFile,
  planTemplateSave,
} from '../templates';

const KEY = 'gvPromptItems';
const TAG = RESEARCH_PACK_TEMPLATE_TAG;

function fileOf(items: unknown[], format: unknown = PROMPT_EXPORT_FORMAT): string {
  return JSON.stringify({ format, exportedAt: '2026-10-01T00:00:00.000Z', version: '1', items });
}

/** The background owner every tab writes through, one per storage area. */
const owners = new WeakMap<PromptLibraryArea, ReturnType<typeof createPromptLibraryOwner>>();

/** What a tab sends its writes through: a message to the area's owner. */
function writerFor(area: PromptLibraryArea) {
  const owner = owners.get(area) ?? createPromptLibraryOwner({ area });
  owners.set(area, owner);
  return createPromptLibraryClient((request) =>
    handlePromptLibraryApplyMessage(structuredClone(request), owner),
  ).apply;
}

function memoryArea(initial?: unknown) {
  const data = new Map<string, unknown>(initial === undefined ? [] : [[KEY, initial]]);
  let writes = 0;
  const area: PromptLibraryArea = {
    get: async (key) => (data.has(key) ? { [key]: structuredClone(data.get(key)) } : {}),
    set: async (items) => {
      writes += 1;
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    },
  };
  return { area, stored: () => data.get(KEY), writes: () => writes };
}

describe('research pack template files', () => {
  it('reads only the tagged templates, keeping just their name and text', () => {
    const result = parseTemplateFile(
      fileOf([
        { id: 'p1', name: 'Plain prompt', text: 'Not a template', tags: ['writing'] },
        {
          id: 'p2',
          name: '  Literature review  ',
          text: 'Compare the sources.\r\nList gaps.',
          tags: ['Research-Pack'],
          createdAt: 5,
          pinnedAt: 9,
          extra: '<img src=x onerror=alert(1)>',
        },
      ]),
    );

    expect(result).toEqual({
      ok: true,
      templates: [{ name: 'Literature review', text: 'Compare the sources.\nList gaps.' }],
    });
  });

  it('rejects files that are not a prompts export, too large, or too long', () => {
    const template = { name: 'A', text: 'B', tags: [TAG] };
    expect(parseTemplateFile('{nope')).toEqual({ ok: false, error: 'invalid_json' });
    expect(parseTemplateFile(JSON.stringify([template]))).toEqual({
      ok: false,
      error: 'wrong_format',
    });
    expect(parseTemplateFile(fileOf([template], 'gemini-voyager.folders.v1'))).toEqual({
      ok: false,
      error: 'wrong_format',
    });
    expect(parseTemplateFile(JSON.stringify({ format: PROMPT_EXPORT_FORMAT, items: {} }))).toEqual({
      ok: false,
      error: 'wrong_format',
    });
    expect(parseTemplateFile('x'.repeat(RESEARCH_PACK_TEMPLATE_LIMITS.maxFileBytes + 1))).toEqual({
      ok: false,
      error: 'too_large',
    });
    expect(
      parseTemplateFile(
        fileOf(
          Array.from({ length: RESEARCH_PACK_TEMPLATE_LIMITS.maxFileItems + 1 }, () => template),
        ),
      ),
    ).toEqual({ ok: false, error: 'too_many' });
    expect(parseTemplateFile(fileOf([{ name: 'A', text: 'B', tags: ['other'] }]))).toEqual({
      ok: false,
      error: 'no_templates',
    });
  });

  it('rejects the whole file when any template breaks a rule', () => {
    const good = { name: 'Good', text: 'Fine', tags: [TAG] };
    const broken = [
      { text: 'No name', tags: [TAG] },
      { name: '   ', text: 'Blank name', tags: [TAG] },
      { name: 'No text', text: '  ', tags: [TAG] },
      { name: 'Number', text: 42, tags: [TAG] },
      {
        name: 'x'.repeat(RESEARCH_PACK_TEMPLATE_LIMITS.maxNameChars + 1),
        text: 'Long',
        tags: [TAG],
      },
      {
        name: 'Long',
        text: 'x'.repeat(RESEARCH_PACK_TEMPLATE_LIMITS.maxTextChars + 1),
        tags: [TAG],
      },
      { name: 'Two\nlines', text: 'Name breaks', tags: [TAG] },
      { name: 'Control', text: 'Bell \u0007 inside', tags: [TAG] },
    ];
    for (const item of broken) {
      expect(parseTemplateFile(fileOf([good, item]))).toEqual({
        ok: false,
        error: 'invalid_template',
      });
    }
  });

  it('rejects names with invisible or direction-changing characters that could pass for another', () => {
    const named = (name: string) => fileOf([{ name, text: 'Body', tags: [TAG] }]);
    for (const name of [
      'Trusted\u200B',
      'Tru\u200Dsted',
      'Tru\uFEFFsted',
      'Trus\u00ADted',
      'Trusted\u2060',
      '\u202ETrusted',
      '\u2066Trusted\u2069',
      'Trusted\u200F',
      'Trusted\u2028more',
      'Trusted\u3164',
    ]) {
      expect(parseTemplateFile(named(name))).toEqual({ ok: false, error: 'invalid_template' });
    }
    // Right-to-left script and emoji are ordinary characters.
    for (const name of ['مراجعة الأدبيات', '📚 Review', 'Café Review']) {
      expect(parseTemplateFile(named(name))).toEqual({
        ok: true,
        templates: [{ name, text: 'Body' }],
      });
    }
    // Only names: an instruction may carry a direction mark for mixed-script text.
    expect(
      parseTemplateFile(fileOf([{ name: 'Mixed', text: 'abc \u200F עברית', tags: [TAG] }])).ok,
    ).toBe(true);
  });

  it('writes one template in the prompts format that the popup import also accepts', () => {
    const content = buildTemplateFile(
      { name: 'Review', text: 'Compare the sources.' },
      Date.UTC(2026, 9, 1),
      () => 'fresh-id',
    );
    const payload = JSON.parse(content);

    expect(payload.format).toBe(PROMPT_EXPORT_FORMAT);
    expect(payload.items).toEqual([
      {
        id: 'fresh-id',
        name: 'Review',
        text: 'Compare the sources.',
        tags: [TAG],
        createdAt: Date.UTC(2026, 9, 1),
      },
    ]);
    expect(PromptImportExportService.validatePayload(payload).success).toBe(true);
    expect(parseTemplateFile(content)).toEqual({
      ok: true,
      templates: [{ name: 'Review', text: 'Compare the sources.' }],
    });
  });

  it('shares a file the popup import adds as a new prompt, leaving every stored prompt as it was', async () => {
    // The recipient imported this template once and then rewrote it; the
    // sender exports the same template again later.
    const recipient = [
      { id: 'p9', name: 'My review', text: 'My rewritten review', tags: [TAG], createdAt: 1 },
      { id: 'other', name: 'Other', text: 'Unrelated', tags: [], createdAt: 2 },
    ];
    const { area, stored } = memoryArea(structuredClone(recipient));
    const file = buildTemplateFile(
      { name: 'Review', text: 'Compare the sources.' },
      Date.UTC(2026, 9, 1),
    );
    const payload = PromptImportExportService.validatePayload(JSON.parse(file));
    if (!payload.success) throw new Error('expected a valid payload');

    // What the popup import sends to the prompt library's owner.
    await writerFor(area)({ kind: 'import', items: payload.data.items });

    const items = stored() as Array<Record<string, unknown>>;
    for (const prompt of recipient) {
      expect(items.find((item) => item.id === prompt.id)).toEqual(prompt);
    }
    expect(items.filter((item) => item.text === 'Compare the sources.')).toHaveLength(1);
  });
});

describe('research pack templates in the prompt library', () => {
  it('lists only prompts tagged as templates, in library order', () => {
    expect(
      listTemplates([
        { id: 'a', name: 'Alpha', text: 'First', tags: [TAG] },
        { id: 'b', name: 'Beta', text: 'Not one', tags: ['writing'] },
        { id: 'c', text: 'Unnamed legacy\nsecond line', tags: ['writing', TAG] },
        { id: 'd', name: 'Empty', text: '  ', tags: [TAG] },
        'garbage',
      ]),
    ).toEqual([
      { id: 'a', name: 'Alpha', text: 'First' },
      { id: 'c', name: 'Unnamed legacy', text: 'Unnamed legacy\nsecond line' },
    ]);
    expect(listTemplates(undefined)).toEqual([]);
  });

  it('skips drafts whose text or name the library already has, also within one batch', () => {
    const library = [{ id: 'a', name: 'Review', text: 'Compare the sources.', tags: [] }];
    expect(
      planTemplateSave(library, [
        { name: 'Other name', text: '  COMPARE the sources. ' },
        { name: 'review', text: 'New text' },
        { name: 'Fresh', text: 'Fresh text' },
        { name: 'Fresh', text: 'Another text' },
      ]).map((planned) => planned.status),
    ).toEqual(['duplicate_text', 'name_taken', 'new', 'name_taken']);
  });

  it('adds new templates ahead of the library and leaves stored prompts untouched', async () => {
    const existing = [
      { id: 'keep', name: 'Mine', text: 'Private prompt', tags: ['x'], createdAt: 1, pinnedAt: 2 },
    ];
    const { area, stored } = memoryArea(existing);
    const library = createTemplateLibrary({
      area,
      key: KEY,
      apply: writerFor(area),
      now: () => 50,
      makeId: () => 'new-id',
    });

    await expect(library.save([{ name: 'Review', text: 'Compare.' }])).resolves.toBe(1);

    expect(stored()).toEqual([
      { id: 'new-id', name: 'Review', text: 'Compare.', tags: [TAG], createdAt: 50 },
      ...existing,
    ]);
  });

  it('never edits a stored prompt, even when an imported file carries its id', async () => {
    const existing = [{ id: 'p1', name: 'Mine', text: 'Original', tags: [TAG], createdAt: 1 }];
    const { area, stored } = memoryArea(existing);
    const library = createTemplateLibrary({
      area,
      key: KEY,
      apply: writerFor(area),
      makeId: () => 'fresh',
    });
    const parsed = parseTemplateFile(
      fileOf([{ id: 'p1', name: 'Other', text: 'Overwritten', tags: [TAG], updatedAt: 9e12 }]),
    );
    if (!parsed.ok) throw new Error('expected a parsed file');

    await library.save(parsed.templates);

    const items = stored() as Array<{ id: string; text: string }>;
    expect(items.find((item) => item.id === 'p1')).toEqual(existing[0]);
    expect(items.map((item) => item.id)).toEqual(['fresh', 'p1']);
  });

  it('writes nothing when every draft is already saved, or the stored value is not a list', async () => {
    const { area, writes } = memoryArea([{ id: 'a', name: 'A', text: 'Same', tags: [] }]);
    const library = createTemplateLibrary({ area, key: KEY, apply: writerFor(area) });
    await expect(library.save([{ name: 'B', text: 'same' }])).resolves.toBe(0);
    expect(writes()).toBe(0);

    const corrupt = memoryArea({ not: 'a list' });
    await expect(
      createTemplateLibrary({
        area: corrupt.area,
        key: KEY,
        apply: writerFor(corrupt.area),
      }).save([{ name: 'B', text: 'C' }]),
    ).rejects.toThrow();
    expect(corrupt.stored()).toEqual({ not: 'a list' });
  });

  it('starts the library when there is none yet', async () => {
    const { area, stored } = memoryArea();
    await createTemplateLibrary({
      area,
      key: KEY,
      apply: writerFor(area),
      makeId: () => 'n',
      now: () => 3,
    }).save([{ name: 'First', text: 'Go' }]);
    expect(stored()).toEqual([{ id: 'n', name: 'First', text: 'Go', tags: [TAG], createdAt: 3 }]);
  });

  it('keeps both templates when two tabs save at the same moment', async () => {
    const { area, stored } = memoryArea([]);
    let id = 0;
    const tab = () =>
      createTemplateLibrary({ area, key: KEY, apply: writerFor(area), makeId: () => `id-${++id}` });

    await Promise.all([
      tab().save([{ name: 'From tab one', text: 'One' }]),
      tab().save([{ name: 'From tab two', text: 'Two' }]),
    ]);

    expect((stored() as Array<{ name: string }>).map((item) => item.name).sort()).toEqual([
      'From tab one',
      'From tab two',
    ]);
  });
});
