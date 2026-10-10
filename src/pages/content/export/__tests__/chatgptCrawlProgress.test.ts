import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ContentExtractor,
  createContentExtractor,
} from '@/features/export/services/DOMContentExtractor';
import type { ExportContentDialect } from '@/features/export/services/exportContentDialect';
import { normalizeText } from '@/features/export/services/exportDomPolicy';
import { showExportProgress } from '@/features/export/ui/exportToasts';
import { toastDriver } from '@/tests/toastDriver';

import { makeTurns, mountThreadFixture } from '../adapter/__tests__/chatgptThreadFixture';
import type { ChatGptCrawlTiming } from '../adapter/chatgptCrawl';
import {
  type ChatGptThreadPreparer,
  createChatGptThreadPreparer,
} from '../adapter/chatgptThreadExport';
import { prepareChatGptExportWithProgress } from '../chatgptCrawlProgress';
import { trackMutationObservers } from './observerTracking';

let extractor: ContentExtractor;
let preparer: ChatGptThreadPreparer;
/** Observers that are observing right now. */
let observing: ReadonlySet<MutationObserver>;

const FAST: Partial<ChatGptCrawlTiming> = {
  pollMs: 1,
  settleMs: 4,
  mountTimeoutMs: 400,
  historyIdleMs: 25,
  historyStallMs: 150,
};

function progressText(): string {
  return toastDriver
    .all()
    .map((toast) => [toast.title, toast.message, toast.detail].filter(Boolean).join(' '))
    .join(' | ');
}

beforeEach(() => {
  document.body.replaceChildren();
  preparer = createChatGptThreadPreparer();
  observing = trackMutationObservers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  extractor = createContentExtractor({
    extractUserImage: (element: HTMLElement) => element.querySelectorAll('img'),
    extractUserText: (
      _lines: NodeListOf<HTMLElement>,
      textParts: string[],
      element: HTMLElement,
    ) => {
      const text = normalizeText(element.textContent || '');
      if (text) textParts.push(text);
    },
    getUserAttachmentCandidates: () => [],
    extractAssistantImage: () => undefined,
    extractFormula: () => undefined,
    extractCodeBlock: () => undefined,
    extractInlineFormula: () => undefined,
  } as unknown as ExportContentDialect);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('prepareChatGptExportWithProgress', () => {
  it('counts the turns it reads in the export progress, then gives the export its text back', async () => {
    const turns = makeTurns(5);
    mountThreadFixture({ turns });
    const exportProgress = showExportProgress({ title: 'Export...', message: 'Loading' });
    const shown: string[] = [];

    const session = await prepareChatGptExportWithProgress(preparer, {
      extractor,
      timing: FAST,
      onProgress: () => {
        shown.push(progressText());
      },
    });

    expect(shown.at(-1)).toBe('Reading conversation… Turns read: 5');
    expect(progressText()).toBe('Export... Loading');
    expect(toastDriver.all()).toMatchObject([{ pending: true }]);
    expect(session?.containers()).toHaveLength(10);
    exportProgress.hide();
    expect(toastDriver.all()).toEqual([]);
  });

  it('cancels from its button: restores the scroll, stops watching the thread and rejects quietly', async () => {
    const turns = makeTurns(8);
    const fixture = mountThreadFixture({ turns });
    fixture.setOffset(3000);
    const fromEnd = fixture.range() - fixture.offset();
    const onProgress = (count: number) => {
      if (count === 2) toastDriver.press(toastDriver.all()[0], 'Cancel');
    };

    await expect(
      prepareChatGptExportWithProgress(preparer, { extractor, timing: FAST, onProgress }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(toastDriver.all()).toEqual([]);
    expect(fixture.range() - fixture.offset()).toBe(fromEnd);
    expect(observing.size).toBe(0);
  });

  it('stops when the export itself is cancelled', async () => {
    mountThreadFixture({ turns: makeTurns(6) });
    const controller = new AbortController();
    const onProgress = (count: number) => {
      if (count === 1) controller.abort();
    };

    await expect(
      prepareChatGptExportWithProgress(preparer, {
        extractor,
        signal: controller.signal,
        timing: FAST,
        onProgress,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(toastDriver.all()).toEqual([]);
  });

  it('shows nothing on the earlier DOM, which has no crawl', async () => {
    document.body.innerHTML = '<main><div data-turn-id-container="a"></div></main>';

    await expect(
      prepareChatGptExportWithProgress(preparer, { extractor, timing: FAST }),
    ).resolves.toBeNull();
    expect(toastDriver.all()).toEqual([]);
  });
});
