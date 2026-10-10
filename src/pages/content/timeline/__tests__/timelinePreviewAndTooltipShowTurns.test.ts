// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
/**
 * Characterization of what the Gemini timeline shows about a turn without navigating: the hover
 * tooltip on a dot, and the preview panel (list, search, navigation, starring, pinning).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  type GeminiTurn,
  GeminiPage,
  SURFACE,
  activeDotLabel,
  dotFor,
  hover,
  settle,
  startTimelineOnPage,
  starredDotLabels,
  useTimelinePage,
} from './geminiTimelineHarness';

vi.mock('webextension-polyfill', async () =>
  (await import('./geminiTimelineHarness')).polyfillMock(),
);

const TURNS: GeminiTurn[] = [
  {
    prompt: 'How do tides work?',
    response: 'The moon pulls the ocean.',
    serverId: 'aaaaaaaaaaaaaaaa',
  },
  {
    prompt: 'What about spring tides?',
    response: 'Sun and moon align.',
    serverId: 'bbbbbbbbbbbbbbbb',
  },
  { prompt: 'Draw a tide chart', response: 'Here is a chart.', serverId: 'cccccccccccccccc' },
];

const tooltip = () => document.querySelector<HTMLElement>(SURFACE.tooltip)!;
const panel = () => document.querySelector<HTMLElement>(SURFACE.previewPanel)!;
const panelIsOpen = () => panel().classList.contains('visible');
const previewItems = () => Array.from(document.querySelectorAll<HTMLElement>(SURFACE.previewItem));
const previewTexts = () =>
  previewItems().map((item) => item.querySelector('.timeline-preview-text')?.textContent ?? '');
const openPreview = () => document.querySelector<HTMLElement>(SURFACE.previewToggle)!.click();

describe('timeline dot tooltip', () => {
  const ext = useTimelinePage();

  it('hovering a dot shows its prompt after a short delay', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    hover(dotFor(TURNS[1].prompt));
    expect(tooltip().classList.contains('visible')).toBe(false);
    await settle(400);

    expect(tooltip().classList.contains('visible')).toBe(true);
    expect(tooltip().textContent).toContain(TURNS[1].prompt);
    expect(tooltip().textContent).not.toContain('★');
  });

  it('moving off the dot hides the tooltip', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    const dot = dotFor(TURNS[1].prompt);
    hover(dot);
    await settle(400);

    dot.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    await settle(400);

    expect(tooltip().classList.contains('visible')).toBe(false);
  });

  it('the ruler style shows the prompt and Gemini’s response right away', async () => {
    ext().seed('sync', { geminiTimelineStyle: 'ruler' });
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    hover(dotFor(TURNS[1].prompt));
    await settle(50);

    expect(tooltip().classList.contains('visible')).toBe(true);
    expect(tooltip().textContent).toContain(TURNS[1].prompt);
    expect(tooltip().textContent).toContain(TURNS[1].response);
  });
});

describe('timeline tooltip turn time', () => {
  const ext = useTimelinePage();
  const sentAt = new Date(2025, 0, 2, 3, 4, 5).getTime();

  function seedRecordedTime(): void {
    ext().seed('local', {
      gvMessageTimestamps: {
        version: 2,
        conversations: { 'gemini:conv:abc123': { 's-bbbbbbbbbbbbbbbb': sentAt } },
      },
    });
  }

  it('shows when the turn was sent once message timestamps are switched on', async () => {
    seedRecordedTime();
    ext().seed('sync', { gvShowMessageTimestamps: true });
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    hover(dotFor(TURNS[1].prompt));
    await settle(400);

    expect(tooltip().textContent).toBe(`2025-01-02 03:04:05\n${TURNS[1].prompt}`);
  });

  it('shows only the prompt while message timestamps are off', async () => {
    seedRecordedTime();
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    hover(dotFor(TURNS[1].prompt));
    await settle(400);

    expect(tooltip().textContent).toBe(TURNS[1].prompt);
  });
});

describe('timeline preview panel', () => {
  const ext = useTimelinePage();

  it('the preview button opens a numbered list of every prompt', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    expect(panelIsOpen()).toBe(false);

    openPreview();

    expect(panelIsOpen()).toBe(true);
    expect(previewTexts()).toEqual(TURNS.map((turn) => turn.prompt));
    expect(
      previewItems().map((item) => item.querySelector('.timeline-preview-index')?.textContent),
    ).toEqual(['1', '2', '3']);
  });

  it('clicking a preview item scrolls the chat to that turn', async () => {
    ext().seed('sync', { geminiTimelineScrollMode: 'jump' });
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    openPreview();

    previewItems()[2].click();
    await settle();

    expect(page.viewport.scrollTop).toBe(page.topOf(TURNS[2].prompt));
    expect(activeDotLabel()).toBe(TURNS[2].prompt);
  });

  it('searching narrows the list and highlights the match in the chat', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    openPreview();
    const search = document.querySelector<HTMLInputElement>(SURFACE.previewSearch)!;

    search.value = 'spring';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(500);

    expect(previewTexts()).toEqual([TURNS[1].prompt]);
    expect(page.bubble(TURNS[1].prompt).querySelector('mark')?.textContent?.toLowerCase()).toBe(
      'spring',
    );

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(500);

    expect(previewTexts()).toEqual(TURNS.map((turn) => turn.prompt));
    expect(page.viewport.querySelector('mark')).toBeNull();
  });

  it('long-pressing a preview item stars the turn on the rail', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    openPreview();

    previewItems()[0].dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 1, clientY: 1 }),
    );
    await settle(600);
    window.dispatchEvent(new MouseEvent('pointerup'));
    await settle();

    expect(starredDotLabels()).toEqual([TURNS[0].prompt]);
    expect(previewItems()[0].classList.contains('starred')).toBe(true);
  });

  it('Escape or a click elsewhere closes the panel', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    openPreview();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panelIsOpen()).toBe(false);

    openPreview();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(panelIsOpen()).toBe(false);
  });

  it('a pinned panel stays open on Escape and on clicks elsewhere', async () => {
    ext().seed('sync', { geminiTimelinePreviewPinned: true });
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    openPreview();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(panelIsOpen()).toBe(true);
  });

  it('pinning the panel in the popup keeps an open panel open', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    openPreview();

    ext().external('sync', { geminiTimelinePreviewPinned: true });
    await settle();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(panelIsOpen()).toBe(true);
  });

  it('hovering a dot while the panel is open shows no tooltip', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    openPreview();

    hover(dotFor(TURNS[1].prompt));
    await settle(400);

    expect(tooltip().classList.contains('visible')).toBe(false);
  });
});
