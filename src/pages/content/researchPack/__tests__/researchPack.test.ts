import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import {
  type ResearchPackStorageArea,
  createResearchPackOwner,
} from '@/features/researchPack/services/packStore';
import type { ResearchPack } from '@/features/researchPack/services/types';
import { confirmDriver } from '@/tests/confirmDriver';
import { toastDriver } from '@/tests/toastDriver';
import { getTranslationSync } from '@/utils/i18n';

import { findChatInput, insertTextIntoChatInput } from '../../chatInput';
import { startResearchPack } from '../index';
import { ADD_BUTTON_CLASS } from '../turnButtons';
import { collectAnswerLinks } from '../turnCapture';
import { clickAdd, flush, readBlob, turn } from './fixtures';

vi.mock('../../chatInput', () => ({
  findChatInput: vi.fn(),
  insertTextIntoChatInput: vi.fn(),
}));

const KEY = StorageKeys.RESEARCH_PACK;

function memoryStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const area: ResearchPackStorageArea = {
    get: async (key) => (data.has(key) ? { [key]: data.get(key) } : {}),
    set: async (items) => {
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    },
  };
  const store = createResearchPackOwner({ area });
  return { store, stored: () => data.get(KEY) as ResearchPack | undefined };
}

describe('research pack on Gemini', () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.mocked(findChatInput).mockReset();
    vi.mocked(insertTextIntoChatInput).mockReset();
  });

  afterEach(() => {
    stop?.();
    stop = null;
    document.body.innerHTML = '';
  });

  it('collects answer and source links but not thoughts or action-bar links', () => {
    const host = turn(
      'See <a href="https://example.com/a">Example A</a> and <a href="#local">jump</a>.' +
        '<a aria-label="Source B" href="https://example.org/b">chip</a>',
    );

    expect(collectAnswerLinks(host)).toEqual([
      { url: 'https://example.com/a', title: 'Example A' },
      { url: 'https://example.org/b', title: 'Source B' },
    ]);
  });

  it('adds a clicked answer with its prompt and sources, and renders it in the panel', async () => {
    const host = turn('<p>Rayleigh scattering.</p><a href="https://example.com/a">Example A</a>');
    const { store, stored } = memoryStore();
    stop = startResearchPack({ store, resolveKey: async () => KEY });

    const buttons = host.querySelectorAll(`.${ADD_BUTTON_CLASS}`);
    expect(buttons).toHaveLength(1);
    expect(host.querySelector('.buttons-container-v2')!.lastElementChild).toBe(buttons[0]);

    clickAdd(host);
    await flush();

    const pack = stored()!;
    expect(pack.items).toHaveLength(1);
    expect(pack.items[0]).toMatchObject({ excerpt: false, sourceUrl: window.location.href });
    expect(pack.items[0].text).toContain('Rayleigh scattering.');
    expect(pack.items[0].prompt).toContain('Why is the sky blue?');
    expect(pack.items[0].citations).toEqual([{ url: 'https://example.com/a', title: 'Example A' }]);
    expect(document.querySelectorAll('.gv-rp-item')).toHaveLength(1);
    expect(document.querySelector('.gv-rp-markdown')!.textContent).toContain(
      '[Example A](https://example.com/a)',
    );

    clickAdd(host);
    await flush();
    expect(stored()!.items).toHaveLength(1);
  });

  it('inserts the assembled Markdown into the composer without sending it', async () => {
    const host = turn('<p>Answer text.</p>');
    const composer = document.createElement('div');
    vi.mocked(findChatInput).mockReturnValue(composer);
    vi.mocked(insertTextIntoChatInput).mockReturnValue(true);
    const { store } = memoryStore();
    stop = startResearchPack({ store, resolveKey: async () => KEY });

    clickAdd(host);
    await flush();
    const insert = document.querySelector<HTMLButtonElement>('.gv-rp-actions .gv-rp-btn-primary')!;
    insert.click();

    expect(insertTextIntoChatInput).toHaveBeenCalledOnce();
    const [text, target] = vi.mocked(insertTextIntoChatInput).mock.calls[0];
    expect(target).toBe(composer);
    expect(text).toContain('# Research pack');
    expect(text).toContain('Answer text.');
  });

  it('clears the pack only once confirmed, and Escape answers the confirm, not the panel', async () => {
    const host = turn('<p>Answer text.</p>');
    const { store, stored } = memoryStore();
    stop = startResearchPack({ store, resolveKey: async () => KEY });
    clickAdd(host);
    await flush();
    document.querySelector<HTMLButtonElement>('.gv-rp-launcher')!.click();
    // Footer order: Insert, Copy, Download, Clear.
    const clear = document.querySelectorAll<HTMLButtonElement>('.gv-rp-actions button')[3];

    clear.click();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    await flush();
    expect(document.querySelector<HTMLElement>('.gv-rp-panel')!.hidden).toBe(false);
    expect(stored()!.items).toHaveLength(1);

    clear.click();
    confirmDriver.answer('Clear');
    await flush();
    expect(stored()!.items).toHaveLength(0);
  });

  describe('exports the instruction exactly as typed, even before it is saved', () => {
    const typeInstruction = (value: string): void => {
      const textarea = document.querySelector<HTMLTextAreaElement>('#gv-rp-instruction')!;
      textarea.focus();
      textarea.value = value;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };
    // Footer order: Insert, Copy, Download, Clear.
    const FOOTER_INDEX = { insert: 0, copy: 1, download: 2 } as const;
    const button = (action: keyof typeof FOOTER_INDEX): HTMLButtonElement =>
      document.querySelectorAll<HTMLButtonElement>('.gv-rp-actions button')[FOOTER_INDEX[action]];

    async function startWithOneItem() {
      const host = turn('<p>Answer text.</p>');
      const memory = memoryStore();
      stop = startResearchPack({ store: memory.store, resolveKey: async () => KEY });
      clickAdd(host);
      await flush();
      return memory;
    }

    it('Copy', async () => {
      const writeText = vi.fn(async (_text: string) => undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await startWithOneItem();

      typeInstruction('Compare with the 2025 survey.');
      button('copy').click();

      expect(writeText).toHaveBeenCalledOnce();
      expect(writeText.mock.calls[0][0]).toContain(
        '## Instruction\n\nCompare with the 2025 survey.',
      );
    });

    it('Download .md', async () => {
      const blobs: Blob[] = [];
      const createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:test';
      });
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
      await startWithOneItem();

      typeInstruction('Find counter-evidence.');
      button('download').click();

      expect(blobs).toHaveLength(1);
      expect(await readBlob(blobs[0])).toContain('## Instruction\n\nFind counter-evidence.');
    });

    it('Insert into chat', async () => {
      vi.mocked(findChatInput).mockReturnValue(document.createElement('div'));
      vi.mocked(insertTextIntoChatInput).mockReturnValue(true);
      const { stored } = await startWithOneItem();

      typeInstruction('Summarize in a table.');
      button('insert').click();

      expect(vi.mocked(insertTextIntoChatInput).mock.calls[0][0]).toContain(
        '## Instruction\n\nSummarize in a table.',
      );
      await flush();
      expect(stored()!.instruction).toBe('Summarize in a table.');
    });
  });

  it('adds only the selected part of an answer as an excerpt', async () => {
    const host = turn('<p id="first">First sentence.</p><p>Second sentence.</p>');
    const { store, stored } = memoryStore();
    stop = startResearchPack({ store, resolveKey: async () => KEY });

    const range = document.createRange();
    range.selectNodeContents(host.querySelector('#first')!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    clickAdd(host);
    await flush();

    expect(stored()!.items[0]).toMatchObject({ text: 'First sentence.', excerpt: true });
    window.getSelection()!.removeAllRanges();
  });

  it('reports a failed add, not a success, when a newer build wrote the pack', async () => {
    const host = turn('<p>Not saved.</p>');
    const newer = { version: 2, items: [{ text: 'future' }] };
    const { store, stored } = memoryStore({ [KEY]: newer });
    stop = startResearchPack({ store, resolveKey: async () => KEY });

    clickAdd(host);
    await flush();

    expect(toastDriver.all()).toMatchObject([
      { message: getTranslationSync('researchPackSaveFailed'), tone: 'error' },
    ]);
    expect(host.querySelector<HTMLElement>(`.${ADD_BUTTON_CLASS}`)!.dataset.state).toBeUndefined();
    expect(stored()).toEqual(newer);
  });

  it('removes its buttons and panel on stop and leaves the stored pack intact', async () => {
    const host = turn('<p>Keep me.</p>');
    const { store, stored } = memoryStore();
    stop = startResearchPack({ store, resolveKey: async () => KEY });
    clickAdd(host);
    await flush();

    stop();
    stop = null;

    expect(document.querySelector(`.${ADD_BUTTON_CLASS}`)).toBeNull();
    expect(document.querySelector('.gv-rp-root')).toBeNull();
    expect(stored()!.items).toHaveLength(1);

    turn('<p>Later answer.</p>');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(document.querySelector(`.${ADD_BUTTON_CLASS}`)).toBeNull();
  });

  it('adds buttons to answers that stream in later', async () => {
    const { store } = memoryStore();
    stop = startResearchPack({ store, resolveKey: async () => KEY });

    const host = turn('<p>Late.</p>');
    expect(host.querySelector(`.${ADD_BUTTON_CLASS}`)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(host.querySelectorAll(`.${ADD_BUTTON_CLASS}`)).toHaveLength(1);
  });
});
