import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';

import { createPromptManagerEngine } from '../promptManagerEngine';
import { resolvePromptSiteAdapter } from '../resolvePromptSiteAdapter';

vi.mock('webextension-polyfill', () => ({ default: globalThis.chrome }));

const review = { id: 'review', name: 'Review', text: 'Review this change\nList every risk' };

let cleanup: CleanupManager | null = null;
let stored: unknown = [review];

function mountSentTurn(lines: string[]): HTMLElement {
  const bubble = document.createElement('span');
  bubble.className = 'user-query-bubble-with-background';
  const text = document.createElement('div');
  text.className = 'query-text';
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'query-text-line';
    p.textContent = line;
    text.appendChild(p);
  }
  bubble.appendChild(text);
  document.body.appendChild(bubble);
  return bubble;
}

function emitLocalChange(changes: Record<string, unknown>): void {
  for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) {
    (listener as (changes: object, area: string) => void)(changes, 'local');
  }
}

async function start(url: string): Promise<void> {
  vi.stubGlobal('location', new URL(url));
  cleanup = new CleanupManager();
  await createPromptManagerEngine(resolvePromptSiteAdapter(url), cleanup).startComposerFeatures();
}

const chipOf = (bubble: HTMLElement) => bubble.querySelector('.gv-pm-sent-chip');

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  stored = [review];
  vi.mocked(chrome.storage.sync.get).mockResolvedValue({} as never);
  vi.mocked(chrome.storage.local.get).mockImplementation(((
    _keys: unknown,
    callback?: (items: Record<string, unknown>) => void,
  ) => {
    const items = { [StorageKeys.PROMPT_ITEMS]: stored };
    callback?.(items);
    return Promise.resolve(items);
  }) as typeof chrome.storage.local.get);
});

afterEach(() => {
  cleanup?.executeCleanups();
  cleanup = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('sent prompt chips startup', () => {
  it.each(['https://gemini.google.com/app', 'https://business.gemini.google/app'])(
    'collapses a sent saved prompt on %s',
    async (url) => {
      const bubble = mountSentTurn(review.text.split('\n'));

      await start(url);

      expect(chipOf(bubble)?.textContent).toBe('Review');
    },
  );

  it('paints the chip in the page theme', async () => {
    document.body.insertAdjacentHTML('afterbegin', '<div class="theme-host dark-theme"></div>');
    const bubble = mountSentTurn(review.text.split('\n'));

    await start('https://gemini.google.com/app');

    expect(bubble.getAttribute('data-gv-theme')).toBe('dark');
  });

  it('stops labelling a turn once its prompt is deleted from the library', async () => {
    const bubble = mountSentTurn(review.text.split('\n'));
    await start('https://gemini.google.com/app');
    expect(chipOf(bubble)).not.toBeNull();

    emitLocalChange({ [StorageKeys.PROMPT_ITEMS]: { oldValue: [review], newValue: [] } });

    expect(chipOf(bubble)).toBeNull();
  });

  it.each(['https://aistudio.google.com/prompts/new_chat', 'https://chatgpt.com/'])(
    'leaves sent turns alone on %s',
    async (url) => {
      const bubble = mountSentTurn(review.text.split('\n'));

      await start(url);

      expect(chipOf(bubble)).toBeNull();
      expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
    },
  );
});
