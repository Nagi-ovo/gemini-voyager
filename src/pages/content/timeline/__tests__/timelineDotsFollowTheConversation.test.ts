// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
/**
 * Characterization of the Gemini timeline rail as a user sees it, driven through
 * `startTimeline()` on a fake conversation page: one dot per user turn, dot clicks and keyboard
 * shortcuts scroll the chat, and the active dot follows the chat scroll.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  type GeminiTurn,
  GeminiPage,
  activeDotLabel,
  dotFor,
  dotLabels,
  dots,
  pressKey,
  railPosition,
  settle,
  startTimelineOnPage,
  turnIdOf,
  useTimelinePage,
} from './geminiTimelineHarness';

vi.mock('webextension-polyfill', async () =>
  (await import('./geminiTimelineHarness')).polyfillMock(),
);

const TURNS: GeminiTurn[] = [
  { prompt: 'Plan a trip to Kyoto', serverId: 'aaaaaaaaaaaaaaaa' },
  { prompt: 'Add a day in Nara', serverId: 'bbbbbbbbbbbbbbbb' },
  { prompt: 'Book the ryokan', serverId: 'cccccccccccccccc' },
  { prompt: 'Summarize the budget', serverId: 'dddddddddddddddd' },
];

describe('Gemini timeline dots', () => {
  useTimelinePage();

  it('shows one dot per user turn, in conversation order, spaced by turn position', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    expect(dotLabels()).toEqual(TURNS.map((turn) => turn.prompt));
    expect(dots().map((dot) => dot.dataset.targetTurnId)).toEqual(
      TURNS.map((turn) => turnIdOf(turn.serverId!)),
    );
    // Turns are evenly spaced in the fixture, so the rail spreads them evenly from top to bottom.
    expect(dots().map((dot) => railPosition(dot).toFixed(3))).toEqual([
      '0.000',
      '0.333',
      '0.667',
      '1.000',
    ]);
  });

  it('adds a dot when a new turn is sent and keeps the existing dots', async () => {
    const page = new GeminiPage(TURNS.slice(0, 2));
    await startTimelineOnPage();
    const firstDot = dotFor(TURNS[0].prompt);

    page.append(TURNS[2]);
    await settle();

    expect(dotLabels()).toEqual(TURNS.slice(0, 3).map((turn) => turn.prompt));
    expect(dotFor(TURNS[0].prompt)).toBe(firstDot);
  });

  it('shows no dots for a conversation without user turns', async () => {
    new GeminiPage([]);
    await startTimelineOnPage();
    expect(dots()).toHaveLength(0);
  });

  it('marks the turn at the top of the chat as active on load', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    expect(activeDotLabel()).toBe(TURNS[0].prompt);
  });

  it('moves the active dot as the user scrolls the chat', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();

    page.scrollTo(page.topOf(TURNS[2].prompt));
    await settle(500);
    expect(activeDotLabel()).toBe(TURNS[2].prompt);

    page.scrollTo(page.topOf(TURNS[1].prompt));
    await settle(500);
    expect(activeDotLabel()).toBe(TURNS[1].prompt);
  });
});

describe('Gemini timeline dot navigation', () => {
  const ext = useTimelinePage();

  it('clicking a dot in jump mode scrolls the chat straight to that turn and activates it', async () => {
    ext().seed('sync', { geminiTimelineScrollMode: 'jump' });
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();

    dotFor(TURNS[2].prompt).click();

    expect(page.viewport.scrollTop).toBe(page.topOf(TURNS[2].prompt));
    await settle(100);
    expect(activeDotLabel()).toBe(TURNS[2].prompt);
  });

  it('clicking a dot in flow mode (the default) glides the chat to that turn, then activates it', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    const destination = page.topOf(TURNS[3].prompt);

    dotFor(TURNS[3].prompt).click();
    await settle(50);
    const midway = page.viewport.scrollTop;
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(destination);

    await settle(2500);
    expect(page.viewport.scrollTop).toBe(destination);
    expect(activeDotLabel()).toBe(TURNS[3].prompt);
  });
});

describe('Gemini timeline keyboard shortcuts', () => {
  const ext = useTimelinePage();

  async function startInJumpMode(): Promise<GeminiPage> {
    ext().seed('sync', { geminiTimelineScrollMode: 'jump' });
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    return page;
  }

  it('j and k move to the next and previous turn without any setup', async () => {
    const page = await startInJumpMode();

    pressKey('j');
    await settle(300);
    expect(page.viewport.scrollTop).toBe(page.topOf(TURNS[1].prompt));
    expect(activeDotLabel()).toBe(TURNS[1].prompt);

    pressKey('j');
    await settle(300);
    expect(activeDotLabel()).toBe(TURNS[2].prompt);

    pressKey('k');
    await settle(300);
    expect(page.viewport.scrollTop).toBe(page.topOf(TURNS[1].prompt));
    expect(activeDotLabel()).toBe(TURNS[1].prompt);
  });

  it('G G jumps to the last turn and g g back to the first', async () => {
    const page = await startInJumpMode();

    pressKey('G', { shiftKey: true });
    pressKey('G', { shiftKey: true });
    await settle(300);
    expect(page.viewport.scrollTop).toBe(page.topOf(TURNS[3].prompt));
    expect(activeDotLabel()).toBe(TURNS[3].prompt);

    pressKey('g');
    pressKey('g');
    await settle(300);
    expect(page.viewport.scrollTop).toBe(page.topOf(TURNS[0].prompt));
    expect(activeDotLabel()).toBe(TURNS[0].prompt);
  });

  it('typing j or k in the Gemini prompt box does not move the chat', async () => {
    const page = await startInJumpMode();
    const promptBox = document.createElement('div');
    promptBox.setAttribute('contenteditable', 'true');
    promptBox.setAttribute('role', 'textbox');
    document.body.appendChild(promptBox);

    promptBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    await settle(300);

    expect(page.viewport.scrollTop).toBe(0);
    expect(activeDotLabel()).toBe(TURNS[0].prompt);
  });

  it('a user-disabled shortcut set leaves j inert', async () => {
    ext().seed('sync', {
      geminiTimelineShortcuts: {
        enabled: false,
        shortcuts: {
          previous: { action: 'timeline:previous', modifiers: [], key: 'k' },
          next: { action: 'timeline:next', modifiers: [], key: 'j' },
          first: { action: 'timeline:first', modifiers: [], key: 'g', sequenceLength: 2 },
          last: { action: 'timeline:last', modifiers: ['Shift'], key: 'G', sequenceLength: 2 },
        },
      },
    });
    const page = await startInJumpMode();

    pressKey('j');
    await settle(300);

    expect(page.viewport.scrollTop).toBe(0);
  });
});
