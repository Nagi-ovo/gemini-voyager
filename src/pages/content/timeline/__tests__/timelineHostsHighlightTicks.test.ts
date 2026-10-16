// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
/**
 * Highlights reach the Gemini rail only through the page's `timelineAnnotations` registry: the
 * highlight feature publishes turn ids from `readServerTurnId` and the timeline places a tick
 * beside the marker with that id. Driven with the real timeline and the real publisher, so a
 * change to either side's turn identity shows up here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeRecord } from '../../highlight/__tests__/fixtures';
import type { HighlightTimelineAnnotations } from '../../highlight/highlightTimelineAnnotations';
import {
  type GeminiTurn,
  GeminiPage,
  SURFACE,
  leaveConversation,
  navigateTo,
  settle,
  startTimelineOnPage,
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
const TICK = '.gv-timeline-annotation';
const tick = () => document.querySelector<HTMLElement>(TICK);
const trackContent = () => document.querySelector(`${SURFACE.bar} ${SURFACE.trackContent}`);

let highlights: HighlightTimelineAnnotations | null = null;
afterEach(() => {
  highlights?.destroy();
  highlights = null;
});

/** The user highlighted a phrase in the second response. */
async function highlightSecondResponse(
  page: GeminiPage,
  onActivate: (id: string) => void = () => {},
): Promise<HighlightTimelineAnnotations> {
  // Loaded after the harness resets modules, so it shares the timeline's registry as on the page.
  const { HighlightTimelineAnnotations } =
    await import('../../highlight/highlightTimelineAnnotations');
  const response = page.response(TURNS[1].prompt);
  response.innerHTML = 'Small <mark class="gv-highlight-mark">sample size</mark>.';
  const mark = response.querySelector<HTMLElement>('mark')!;
  const record = makeRecord({
    quote: { exact: 'sample size', prefix: 'Small ', suffix: '.' },
    position: { start: 6, end: 17 },
    sourceTextHash: 'source',
  });
  highlights = new HighlightTimelineAnnotations(
    new Map([[record.id, record]]),
    new Map([[record.id, [mark]]]),
    onActivate,
  );
  highlights.render();
  return highlights;
}

describe('highlight ticks on the timeline rail', () => {
  const ext = useTimelinePage();

  it('a highlight tick is placed inside the rail track, next to the dots, and opens its highlight', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    const activate = vi.fn();

    await highlightSecondResponse(page, activate);

    expect(tick()?.parentElement).toBe(trackContent());
    tick()!.click();
    expect(activate).toHaveBeenCalledWith('highlight-1');
  });

  it("switching to the compact style places the tick on the dense rail at its turn's marker", async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    await highlightSecondResponse(page);

    ext().external('sync', { geminiTimelineStyle: 'compact' });
    await settle();

    expect(document.querySelectorAll(TICK)).toHaveLength(1);
    const secondDot = document.querySelector<HTMLElement>(
      `${SURFACE.dot}[data-target-turn-id="s-${TURNS[1].serverId}"]`,
    );
    expect(secondDot).not.toBeNull();
    expect(tick()?.style.top).toBe(secondDot!.style.top);
  });

  it('the tick survives the rail repainting its dots for a new turn', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    await highlightSecondResponse(page);

    page.append({ prompt: 'Suggest a follow-up study', serverId: 'cccccccccccccccc' });
    await settle();

    expect(document.querySelectorAll(TICK)).toHaveLength(1);
    expect(document.querySelectorAll(`${SURFACE.bar} ${SURFACE.dot}`)).toHaveLength(3);
  });

  it('the tick goes away with the rail when the user leaves the conversation', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();
    const ticks = await highlightSecondResponse(page);

    await leaveConversation('/');
    ticks.render();

    expect(tick()).toBeNull();
  });

  it('the tick can be placed on the new rail after switching conversations', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();

    page.render(TURNS);
    await navigateTo('/app/other');
    await highlightSecondResponse(page);

    expect(tick()?.parentElement).toBe(trackContent());
  });
});
