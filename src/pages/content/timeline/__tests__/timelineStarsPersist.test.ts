// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
/**
 * Characterization of starring turns from the Gemini timeline, end to end: the gesture on a dot,
 * what lands in storage (the Saved Library and its v1 compatibility projection),
 * and how stored stars are painted back onto the right turn
 * after a reload, a lazy load of older turns, or an id migration.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  type GeminiTurn,
  GeminiPage,
  dotFor,
  dotLabels,
  hover,
  longPress,
  reloadPage,
  settle,
  startTimelineOnPage,
  starredDotLabels,
  turnIdOf,
  useTimelinePage,
} from './geminiTimelineHarness';

vi.mock('webextension-polyfill', async () =>
  (await import('./geminiTimelineHarness')).polyfillMock(),
);

const CONVERSATION_ID = 'gemini:conv:abc123';
const CONVERSATION_URL = 'https://gemini.google.com/app/abc123';
const LEGACY_STARS_KEY = `geminiTimelineStars:${CONVERSATION_ID}`;
const SAVED_LIBRARY_KEY = 'geminiTimelineStarredMessages';
const NEUTRAL_LIBRARY_KEY = 'gvSavedLibraryStars';

const TURNS: GeminiTurn[] = [
  { prompt: 'Explain monads', serverId: 'aaaaaaaaaaaaaaaa' },
  { prompt: 'Show one in TypeScript', serverId: 'bbbbbbbbbbbbbbbb' },
  { prompt: 'Compare with promises', serverId: 'cccccccccccccccc' },
];
const [FIRST, SECOND, THIRD] = TURNS;

type SavedLibrary = { messages: Record<string, Array<Record<string, unknown>>> };

describe('starring a turn from the Gemini timeline', () => {
  const ext = useTimelinePage();
  const legacyStars = () => JSON.parse(localStorage.getItem(LEGACY_STARS_KEY) ?? 'null');
  const savedLibrary = () =>
    ext().read<SavedLibrary>('local', SAVED_LIBRARY_KEY)?.messages[CONVERSATION_ID] ?? [];

  it('long-pressing a dot stars its turn in the rail and both Library projections', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    await longPress(dotFor(SECOND.prompt));
    await settle();

    const dot = dotFor(SECOND.prompt);
    expect(starredDotLabels()).toEqual([SECOND.prompt]);
    expect(dot.getAttribute('aria-pressed')).toBe('true');
    expect(ext().read('local', NEUTRAL_LIBRARY_KEY)).toEqual({
      messages: {
        [CONVERSATION_ID]: savedLibrary().map((record) => ({ ...record, text: SECOND.prompt })),
      },
    });
    expect(savedLibrary()).toEqual([
      expect.objectContaining({
        turnId: turnIdOf(SECOND.serverId!),
        content: SECOND.prompt,
        conversationId: CONVERSATION_ID,
        conversationUrl: CONVERSATION_URL,
        starredAt: expect.any(Number),
      }),
    ]);
  });

  it('stale page arrays are ignored and left untouched while Library stars are authoritative', async () => {
    const stale = JSON.stringify([turnIdOf(FIRST.serverId!)]);
    localStorage.setItem(LEGACY_STARS_KEY, stale);
    ext().seed('local', {
      [SAVED_LIBRARY_KEY]: {
        messages: {
          [CONVERSATION_ID]: [
            {
              turnId: turnIdOf(SECOND.serverId!),
              content: SECOND.prompt,
              conversationId: CONVERSATION_ID,
              conversationUrl: CONVERSATION_URL,
              starredAt: 1,
            },
          ],
        },
      },
    });
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    expect(starredDotLabels()).toEqual([SECOND.prompt]);
    await longPress(dotFor(THIRD.prompt));
    await settle();
    expect(starredDotLabels()).toEqual([SECOND.prompt, THIRD.prompt]);
    expect(localStorage.getItem(LEGACY_STARS_KEY)).toBe(stale);
    expect(savedLibrary().map((item) => item.turnId)).toEqual([
      turnIdOf(SECOND.serverId!),
      turnIdOf(THIRD.serverId!),
    ]);
  });

  it('a short press does not star the turn', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    const dot = dotFor(SECOND.prompt);

    dot.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    await settle(200);
    window.dispatchEvent(new MouseEvent('pointerup'));
    await settle(1000);

    expect(starredDotLabels()).toEqual([]);
    expect(savedLibrary()).toEqual([]);
  });

  it('long-pressing a starred dot removes the star everywhere', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    await longPress(dotFor(SECOND.prompt));
    await settle();

    await longPress(dotFor(SECOND.prompt));
    await settle();

    expect(starredDotLabels()).toEqual([]);
    expect(dotFor(SECOND.prompt).getAttribute('aria-pressed')).toBe('false');
    expect(ext().read('local', NEUTRAL_LIBRARY_KEY)).toEqual(
      ext().read('local', SAVED_LIBRARY_KEY),
    );
    expect(savedLibrary()).toEqual([]);
  });

  it('starring a turn survives a reload', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    await longPress(dotFor(THIRD.prompt));
    await settle();

    await reloadPage(TURNS);

    expect(starredDotLabels()).toEqual([THIRD.prompt]);
  });

  it('a star saved only in the Saved Library is painted after a reload', async () => {
    ext().seed('local', {
      [SAVED_LIBRARY_KEY]: {
        messages: {
          [CONVERSATION_ID]: [
            {
              turnId: turnIdOf(FIRST.serverId!),
              content: FIRST.prompt,
              conversationId: CONVERSATION_ID,
              conversationUrl: CONVERSATION_URL,
              starredAt: 1,
            },
          ],
        },
      },
    });
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    expect(starredDotLabels()).toEqual([FIRST.prompt]);
  });

  it('the hover tooltip marks a starred turn with a star', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    await longPress(dotFor(SECOND.prompt));
    await settle();

    hover(dotFor(SECOND.prompt));
    await settle(400);

    const tooltip = document.querySelector('#gemini-timeline-tooltip')!;
    expect(tooltip.classList.contains('visible')).toBe(true);
    expect(tooltip.textContent).toContain(`★ ${SECOND.prompt}`);
  });

  it('a turn Gemini has not given an id yet cannot be starred', async () => {
    new GeminiPage([FIRST, { prompt: 'Still streaming' }]);
    await startTimelineOnPage();

    await longPress(dotFor('Still streaming'));
    await settle();

    expect(starredDotLabels()).toEqual([]);
    expect(legacyStars()).toBeNull();
    expect(savedLibrary()).toEqual([]);
  });

  it('removing the star in the Saved Library un-stars the dot on the open page', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    await longPress(dotFor(SECOND.prompt));
    await settle();

    // The Saved Library lives in another extension page; it asks the background to remove it.
    await chrome.runtime.sendMessage({
      type: 'gv.starred.remove',
      payload: { conversationId: CONVERSATION_ID, turnId: turnIdOf(SECOND.serverId!) },
    });
    await settle();

    expect(starredDotLabels()).toEqual([]);
  });

  it('a star added for this conversation elsewhere appears on the open page', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    await chrome.runtime.sendMessage({
      type: 'gv.starred.add',
      payload: {
        turnId: turnIdOf(THIRD.serverId!),
        content: THIRD.prompt,
        conversationId: CONVERSATION_ID,
        conversationUrl: CONVERSATION_URL,
        starredAt: 1,
      },
    });
    await settle();

    expect(starredDotLabels()).toEqual([THIRD.prompt]);
  });

  it('a star in another conversation does not light up this one', async () => {
    ext().seed('local', {
      [SAVED_LIBRARY_KEY]: {
        messages: {
          'gemini:conv:other': [
            {
              turnId: turnIdOf(FIRST.serverId!),
              content: FIRST.prompt,
              conversationId: 'gemini:conv:other',
              conversationUrl: 'https://gemini.google.com/app/other',
              starredAt: 1,
            },
          ],
        },
      },
    });
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    expect(starredDotLabels()).toEqual([]);
  });
});

describe('stars stay attached to their turn (turn identity)', () => {
  const ext = useTimelinePage();

  /** The full server id list Gemini reported for this conversation on an earlier visit. */
  function rememberTurnOrder(serverIds: string[]): void {
    ext().seed('local', {
      gvTurnIdentityCache: {
        version: 1,
        conversations: {
          c_abc123: { turnIds: serverIds.map(turnIdOf), updatedAt: Date.now() },
        },
      },
    });
  }

  /** A star saved by an older Voyager that numbered turns by position (`u-<index>`). */
  function seedPositionalStar(index: number, content: string): void {
    ext().seed('local', {
      [SAVED_LIBRARY_KEY]: {
        messages: {
          [CONVERSATION_ID]: [
            {
              turnId: `u-${index}`,
              content,
              conversationId: CONVERSATION_ID,
              conversationUrl: CONVERSATION_URL,
              starredAt: 1,
            },
          ],
        },
      },
    });
  }

  it('the star stays on its turn when Gemini loads older turns above it', async () => {
    const page = new GeminiPage([SECOND, THIRD]);
    await startTimelineOnPage();
    await longPress(dotFor(SECOND.prompt));
    await settle();

    page.prepend([FIRST]);
    await settle();

    expect(dotLabels()).toEqual(TURNS.map((turn) => turn.prompt));
    expect(starredDotLabels()).toEqual([SECOND.prompt]);
  });

  it('an old positional star lights up the right turn once the turn order is known', async () => {
    rememberTurnOrder(TURNS.map((turn) => turn.serverId!));
    seedPositionalStar(1, SECOND.prompt);
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    expect(starredDotLabels()).toEqual([SECOND.prompt]);
  });

  it('an old positional star finds its turn even when only the tail of the chat is mounted', async () => {
    rememberTurnOrder(TURNS.map((turn) => turn.serverId!));
    seedPositionalStar(1, SECOND.prompt);
    // Only turns 1 and 2 are mounted, so position 1 in the DOM is THIRD, not SECOND.
    new GeminiPage([SECOND, THIRD]);
    await startTimelineOnPage();

    expect(starredDotLabels()).toEqual([SECOND.prompt]);
  });

  it('an old positional star is not guessed onto a turn when the turn order is unknown', async () => {
    seedPositionalStar(0, SECOND.prompt);
    // Without the full order, the first mounted turn is not evidence of position 0.
    new GeminiPage([SECOND, THIRD]);
    await startTimelineOnPage();

    expect(starredDotLabels()).toEqual([]);
  });

  it('un-starring a migrated positional star clears both its old and new records', async () => {
    rememberTurnOrder(TURNS.map((turn) => turn.serverId!));
    seedPositionalStar(1, SECOND.prompt);
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    await longPress(dotFor(SECOND.prompt));
    await settle();

    expect(starredDotLabels()).toEqual([]);
    expect(
      ext().read<SavedLibrary>('local', SAVED_LIBRARY_KEY)?.messages[CONVERSATION_ID] ?? [],
    ).toEqual([]);

    await reloadPage(TURNS);
    expect(starredDotLabels()).toEqual([]);
  });
});

describe('opening a starred turn from the Saved Library', () => {
  useTimelinePage(`/app/abc123#gv-turn-${turnIdOf(THIRD.serverId!)}`);

  it('scrolls the chat to the starred turn and then drops the link fragment', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    await settle(3000);

    expect(page.viewport.scrollTop).toBe(page.topOf(THIRD.prompt));
    expect(location.hash).toBe('');
    expect(location.pathname).toBe('/app/abc123');
  });
});
