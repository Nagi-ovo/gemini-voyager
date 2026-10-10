import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import {
  type PromptLibraryArea,
  createPromptLibraryOwner,
} from '@/features/prompt/library/promptLibraryOwner';
import {
  PROMPT_EXPORT_FORMAT,
  RESEARCH_PACK_TEMPLATE_LIMITS,
  RESEARCH_PACK_TEMPLATE_TAG,
  createTemplateLibrary,
} from '@/features/researchPack/services/templates';
import { confirmDriver } from '@/tests/confirmDriver';
import { toastDriver } from '@/tests/toastDriver';

import { startResearchPack } from '../index';
import { emitStorageChange, flush, packOf, readBlob, sharedStorage } from './fixtures';

const KEY = StorageKeys.RESEARCH_PACK;
const PROMPTS = StorageKeys.PROMPT_ITEMS;
const TAG = RESEARCH_PACK_TEMPLATE_TAG;

function promptLibrary(initial: unknown[] = []) {
  const data = new Map<string, unknown>([[PROMPTS, structuredClone(initial)]]);
  let writes = 0;
  const area: PromptLibraryArea = {
    get: async (key) => (data.has(key) ? { [key]: structuredClone(data.get(key)) } : {}),
    set: async (items) => {
      writes += 1;
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    },
  };
  let id = 0;
  const owner = createPromptLibraryOwner({ area });
  const library = createTemplateLibrary({
    area,
    key: PROMPTS,
    apply: (op) => owner.apply(op),
    now: () => 100,
    makeId: () => `new-${++id}`,
  });
  return {
    library,
    prompts: () => data.get(PROMPTS) as Array<Record<string, unknown>>,
    /** Replace the library from outside, as Prompt Manager would. */
    replace: (items: unknown[]) => data.set(PROMPTS, structuredClone(items)),
    writes: () => writes,
  };
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const instructionBox = () => $<HTMLTextAreaElement>('#gv-rp-instruction');
const picker = () => $<HTMLSelectElement>('.gv-rp-template-select');
const pickerNames = () =>
  Array.from(picker().options)
    .filter((option) => option.value)
    .map((option) => option.textContent);

function typeInstruction(text: string): void {
  const box = instructionBox();
  box.focus();
  box.value = text;
  box.dispatchEvent(new Event('input'));
}

function pick(id: string): void {
  picker().value = id;
  picker().dispatchEvent(new Event('change'));
}

function chooseFile(content: string, size?: number): void {
  const file = new File([content], 'template.json', { type: 'application/json' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  const input = $<HTMLInputElement>('.gv-rp-template-file');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

function templateFile(items: unknown[]): string {
  return JSON.stringify({ format: PROMPT_EXPORT_FORMAT, items });
}

describe('research pack templates in the panel', () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  async function start(
    prompts: unknown[] = [],
    pack = packOf('Stored answer'),
  ): Promise<ReturnType<typeof promptLibrary> & ReturnType<typeof sharedStorage>> {
    const lib = promptLibrary(prompts);
    const shared = sharedStorage({ [KEY]: pack });
    stop = startResearchPack({
      store: shared.store,
      resolveKey: async () => KEY,
      templateLibrary: lib.library,
    });
    await flush();
    return { ...lib, ...shared };
  }

  it('lists only prompts tagged as templates and fills an empty instruction with one', async () => {
    const shared = await start([
      { id: 'a', name: 'Literature review', text: 'Compare the sources.', tags: [TAG] },
      { id: 'b', name: 'Email', text: 'Write an email.', tags: ['writing'] },
    ]);

    expect(pickerNames()).toEqual(['Literature review']);
    pick('a');
    $<HTMLButtonElement>('.gv-rp-template-use').click();
    await flush();

    expect(instructionBox().value).toBe('Compare the sources.');
    expect(shared.instruction(KEY)).toBe('Compare the sources.');
    expect(confirmDriver.isOpen()).toBe(false);
  });

  it('asks before replacing a typed instruction, and the template wins over the pending save', async () => {
    const shared = await start([{ id: 'a', name: 'Review', text: 'Compare.', tags: [TAG] }]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    typeInstruction('Half-typed text');
    pick('a');
    $<HTMLButtonElement>('.gv-rp-template-use').click();
    expect(instructionBox().value).toBe('Half-typed text');

    confirmDriver.answer('Replace');
    await vi.advanceTimersByTimeAsync(1000);

    expect(instructionBox().value).toBe('Compare.');
    expect(shared.instruction(KEY)).toBe('Compare.');
  });

  it('refuses to use or export a tagged prompt longer than an instruction can be', async () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const long = 'x'.repeat(RESEARCH_PACK_TEMPLATE_LIMITS.maxTextChars + 1);
    const shared = await start([{ id: 'a', name: 'Huge', text: long, tags: [TAG] }]);

    pick('a');
    $<HTMLButtonElement>('.gv-rp-template-use').click();
    $<HTMLButtonElement>('.gv-rp-template-export').click();
    await flush();

    expect(instructionBox().value).toBe('');
    expect(shared.instruction(KEY)).toBe('');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(toastDriver.all()).toHaveLength(1);
  });

  it('fills the instruction with the checked text, not padding that would crowd it out', async () => {
    const padded = `${' '.repeat(RESEARCH_PACK_TEMPLATE_LIMITS.maxTextChars)}\r\nReal body\r\n`;
    const shared = await start([{ id: 'a', name: 'Padded', text: padded, tags: [TAG] }]);

    pick('a');
    $<HTMLButtonElement>('.gv-rp-template-use').click();
    await flush();

    expect(instructionBox().value).toBe('Real body');
    expect(shared.instruction(KEY)).toBe('Real body');
  });

  it('checks the template again when a confirm opened before it changed is answered', async () => {
    const lib = await start([{ id: 'a', name: 'Review', text: 'Compare.', tags: [TAG] }]);
    typeInstruction('Typed first');
    pick('a');
    $<HTMLButtonElement>('.gv-rp-template-use').click();

    const long = 'x'.repeat(RESEARCH_PACK_TEMPLATE_LIMITS.maxTextChars + 1);
    lib.replace([{ id: 'a', name: 'Review', text: long, tags: [TAG] }]);
    emitStorageChange({ [PROMPTS]: { newValue: lib.prompts() } }, 'local');
    await flush();
    confirmDriver.answer('Replace');
    await flush();

    expect(instructionBox().value).toBe('Typed first');
    expect(toastDriver.all()).toHaveLength(1);
  });

  it('saves the typed instruction as a named template in the prompt library', async () => {
    const lib = await start([{ id: 'mine', name: 'Mine', text: 'Private', tags: ['x'] }]);
    typeInstruction('Find counter-evidence.');

    $<HTMLButtonElement>('.gv-rp-template-save').click();
    await flush();
    expect(lib.writes()).toBe(0);

    $<HTMLInputElement>('.gv-rp-template-name').value = 'Skeptic';
    $<HTMLButtonElement>('.gv-rp-template-save').click();
    await flush();

    expect(lib.prompts()).toEqual([
      { id: 'new-1', name: 'Skeptic', text: 'Find counter-evidence.', tags: [TAG], createdAt: 100 },
      { id: 'mine', name: 'Mine', text: 'Private', tags: ['x'] },
    ]);
    expect(pickerNames()).toEqual(['Skeptic']);

    // The same instruction again is refused, as Prompt Manager refuses it.
    $<HTMLInputElement>('.gv-rp-template-name').value = 'Another';
    $<HTMLButtonElement>('.gv-rp-template-save').click();
    await flush();
    expect(lib.prompts()).toHaveLength(2);
  });

  it('exports only the chosen template, never the pack or other prompts', async () => {
    const blobs: Blob[] = [];
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:test';
      }),
      revokeObjectURL: vi.fn(),
    });
    await start(
      [
        { id: 'a', name: 'Review', text: 'Compare the sources.', tags: [TAG] },
        { id: 'b', name: 'Secret', text: 'Private prompt', tags: ['x'] },
      ],
      { ...packOf('Confidential answer'), instruction: 'Typed instruction' },
    );

    pick('a');
    $<HTMLButtonElement>('.gv-rp-template-export').click();

    expect(blobs).toHaveLength(1);
    const content = await readBlob(blobs[0]);
    expect(content).not.toContain('Confidential answer');
    expect(content).not.toContain('Private prompt');
    expect(JSON.parse(content).items).toEqual([
      expect.objectContaining({ name: 'Review', text: 'Compare the sources.', tags: [TAG] }),
    ]);
  });

  it('previews an imported file as plain text and saves only on Save', async () => {
    const lib = await start([{ id: 'p1', name: 'Mine', text: 'Original', tags: [TAG] }]);

    chooseFile(
      templateFile([
        { id: 'p1', name: '<img src=x onerror="alert(1)">', text: '<b>bold</b> plan', tags: [TAG] },
        { name: 'Copy of mine', text: 'original', tags: [TAG] },
      ]),
    );
    await vi.waitFor(() => expect($('.gv-rp-template-preview').hidden).toBe(false));

    const preview = $('.gv-rp-template-preview');
    expect(preview.querySelector('img, b')).toBeNull();
    expect(
      Array.from(preview.querySelectorAll('.gv-rp-template-preview-name')).map(
        (n) => n.textContent,
      ),
    ).toEqual(['<img src=x onerror="alert(1)">', 'Copy of mine']);
    expect(
      Array.from(preview.querySelectorAll<HTMLElement>('.gv-rp-template-preview-item')).map(
        (row) => row.dataset.status,
      ),
    ).toEqual(['new', 'duplicate_text']);
    expect(lib.writes()).toBe(0);

    $<HTMLButtonElement>('.gv-rp-template-preview-save').click();
    await flush();

    expect(lib.prompts()).toEqual([
      {
        id: 'new-1',
        name: '<img src=x onerror="alert(1)">',
        text: '<b>bold</b> plan',
        tags: [TAG],
        createdAt: 100,
      },
      { id: 'p1', name: 'Mine', text: 'Original', tags: [TAG] },
    ]);
    expect($('.gv-rp-template-preview').hidden).toBe(true);
  });

  it('writes nothing when an import is cancelled, too large, or not a template file', async () => {
    const lib = await start();

    chooseFile(templateFile([{ name: 'A', text: 'B', tags: [TAG] }]));
    await vi.waitFor(() => expect($('.gv-rp-template-preview').hidden).toBe(false));
    $<HTMLButtonElement>('.gv-rp-template-preview-cancel').click();
    expect($('.gv-rp-template-preview').hidden).toBe(true);

    const readAsText = vi.spyOn(FileReader.prototype, 'readAsText');
    try {
      chooseFile(
        templateFile([{ name: 'A', text: 'B', tags: [TAG] }]),
        RESEARCH_PACK_TEMPLATE_LIMITS.maxFileBytes + 1,
      );
      await flush();
      expect(readAsText).not.toHaveBeenCalled();
    } finally {
      readAsText.mockRestore();
    }

    chooseFile(JSON.stringify([{ name: 'A', text: 'B', tags: [TAG] }]));
    await vi.waitFor(() => expect(toastDriver.all()).toHaveLength(1));
    expect($('.gv-rp-template-preview').hidden).toBe(true);
    expect(lib.writes()).toBe(0);
  });

  it('aborts a file still being read on stop, and touches the library no more', async () => {
    const lib = await start();
    const load = vi.spyOn(lib.library, 'load');
    const abort = vi.spyOn(FileReader.prototype, 'abort');
    try {
      chooseFile(templateFile([{ name: 'A', text: 'B', tags: [TAG] }]));
      stop?.();
      stop = null;
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(abort).toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
      expect(lib.writes()).toBe(0);
    } finally {
      abort.mockRestore();
      load.mockRestore();
    }
  });

  it('writes no template when stopped while a save is checking the library', async () => {
    const lib = await start();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const load = lib.library.load.bind(lib.library);
    vi.spyOn(lib.library, 'load').mockImplementation(async () => {
      await gate;
      return load();
    });
    typeInstruction('Find counter-evidence.');
    $<HTMLInputElement>('.gv-rp-template-name').value = 'Skeptic';
    $<HTMLButtonElement>('.gv-rp-template-save').click();

    stop?.();
    stop = null;
    release();
    await flush();

    expect(lib.writes()).toBe(0);
  });

  it('keeps every template control off until the pack has loaded', async () => {
    const lib = promptLibrary([{ id: 'a', name: 'Review', text: 'Compare.', tags: [TAG] }]);
    const shared = sharedStorage({ [KEY]: packOf('Stored answer') });
    let resolveKey: (key: string) => void = () => undefined;
    stop = startResearchPack({
      store: shared.store,
      resolveKey: () => new Promise<string>((resolve) => (resolveKey = resolve)),
      templateLibrary: lib.library,
    });
    await flush();

    const controls = [
      '.gv-rp-template-select',
      '.gv-rp-template-use',
      '.gv-rp-template-export',
      '.gv-rp-template-name',
      '.gv-rp-template-save',
      '.gv-rp-template-import',
    ].map((selector) => $<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(selector));
    expect(controls.every((control) => control.disabled)).toBe(true);

    resolveKey(KEY);
    await flush();
    expect(picker().disabled).toBe(false);
    expect($<HTMLButtonElement>('.gv-rp-template-save').disabled).toBe(false);
  });

  it('follows template changes made in Prompt Manager', async () => {
    const lib = await start([{ id: 'a', name: 'Review', text: 'Compare.', tags: [TAG] }]);
    expect(pickerNames()).toEqual(['Review']);

    await lib.library.save([{ name: 'Added elsewhere', text: 'New text' }]);
    emitStorageChange({ [PROMPTS]: { newValue: lib.prompts() } }, 'local');
    await flush();

    expect(pickerNames()).toEqual(['Added elsewhere', 'Review']);
  });
});
