// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
/**
 * The DOM contract between the Gemini timeline and highlight ticks: the highlight feature finds
 * the rail by `.gemini-timeline-bar` / `.timeline-track-content` and places its ticks there (or
 * on the bar in compact style). Driven with the real timeline and the real tick renderer, so a
 * renamed or restructured rail shows up here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HighlightTimelineMarkers } from '../../highlight/HighlightTimelineMarkers';
import { makeRecord } from '../../highlight/__tests__/fixtures';
import {
  type GeminiTurn,
  GeminiPage,
  SURFACE,
  leaveConversation,
  navigateTo,
  settle,
  startTimelineOnPage,
  timelineBar,
  useTimelinePage,
} from './geminiTimelineHarness';

vi.mock('webextension-polyfill', async () =>
  (await import('./geminiTimelineHarness')).polyfillMock(),
);

const TURNS: GeminiTurn[] = [
  {
    prompt: 'Summarize the paper',
    response: 'It proposes a method.',
    serverId: 'aaaaaaaaaaaaaaaa',
  },
  { prompt: 'List its limits', response: 'Small sample size.', serverId: 'bbbbbbbbbbbbbbbb' },
];
const TICK = '.gv-highlight-timeline-tick';

let highlights: HighlightTimelineMarkers | null = null;
afterEach(() => {
  highlights?.destroy();
  highlights = null;
});

/** The user highlighted a phrase in the second response. */
function highlightSecondResponse(page: GeminiPage): HighlightTimelineMarkers {
  const response = page.response(TURNS[1].prompt);
  response.innerHTML = 'Small <mark class="gv-highlight-mark">sample size</mark>.';
  const mark = response.querySelector<HTMLElement>('mark')!;
  const record = makeRecord({
    quote: { exact: 'sample size', prefix: 'Small ', suffix: '.' },
    position: { start: 6, end: 17 },
    sourceTextHash: 'source',
  });
  highlights = new HighlightTimelineMarkers(
    new Map([[record.id, record]]),
    new Map([[record.id, [mark]]]),
    () => {},
  );
  highlights.start();
  highlights.render();
  return highlights;
}

describe('highlight ticks on the timeline rail', () => {
  const ext = useTimelinePage();

  it('a highlight tick is placed inside the rail track, next to the dots', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();

    highlightSecondResponse(page);

    const tick = document.querySelector(TICK);
    expect(tick?.parentElement).toBe(
      document.querySelector(`${SURFACE.bar} ${SURFACE.trackContent}`),
    );
  });

  it('switching to the compact style moves the tick onto the rail itself', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    highlightSecondResponse(page);

    ext().external('sync', { geminiTimelineStyle: 'compact' });
    await settle();

    expect(document.querySelectorAll(TICK)).toHaveLength(1);
    expect(document.querySelector(TICK)?.parentElement).toBe(timelineBar());
  });

  it('the tick survives the rail repainting its dots for a new turn', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    highlightSecondResponse(page);

    page.append({ prompt: 'Suggest a follow-up study', serverId: 'cccccccccccccccc' });
    await settle();

    expect(document.querySelectorAll(TICK)).toHaveLength(1);
    expect(document.querySelectorAll(`${SURFACE.bar} ${SURFACE.dot}`)).toHaveLength(3);
  });

  it('the tick goes away with the rail when the user leaves the conversation', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    const ticks = highlightSecondResponse(page);

    await leaveConversation('/');
    ticks.render();

    expect(document.querySelector(TICK)).toBeNull();
  });

  it('the tick can be placed on the new rail after switching conversations', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();

    page.render(TURNS);
    await navigateTo('/app/other');
    highlightSecondResponse(page);

    expect(document.querySelector(TICK)?.parentElement).toBe(
      document.querySelector(`${SURFACE.bar} ${SURFACE.trackContent}`),
    );
  });
});
