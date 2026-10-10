// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
/**
 * Characterization of the popup settings that change how the Gemini timeline rail renders or
 * behaves, read at start-up from `chrome.storage.sync` and applied live when the popup changes
 * them: hidden container, rail width, draggable position, scroll mode and timeline style.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  type GeminiTurn,
  GeminiPage,
  SURFACE,
  dotFor,
  followInlinePosition,
  reloadPage,
  settle,
  startTimelineOnPage,
  timelineBar,
  useTimelinePage,
} from './geminiTimelineHarness';

vi.mock('webextension-polyfill', async () =>
  (await import('./geminiTimelineHarness')).polyfillMock(),
);

const TURNS: GeminiTurn[] = [
  { prompt: 'First question', serverId: 'aaaaaaaaaaaaaaaa' },
  { prompt: 'Second question', serverId: 'bbbbbbbbbbbbbbbb' },
  { prompt: 'Third question', serverId: 'cccccccccccccccc' },
];

const bar = () => {
  const element = timelineBar();
  if (!element) throw new Error('No timeline bar');
  return element;
};
const barWidth = () => bar().style.getPropertyValue('--timeline-bar-width');

function pointer(type: string, target: EventTarget, clientX: number, clientY: number): void {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY }),
  );
}

describe('timeline container setting', () => {
  const ext = useTimelinePage();

  it('the rail keeps its container by default', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    expect(bar().classList.contains('timeline-no-container')).toBe(false);
  });

  it('a saved "hide container" setting renders the rail without its container', async () => {
    ext().seed('sync', { geminiTimelineHideContainer: true });
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    expect(bar().classList.contains('timeline-no-container')).toBe(true);
  });

  it('toggling "hide container" in the popup updates the open rail', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    ext().external('sync', { geminiTimelineHideContainer: true });
    await settle();
    expect(bar().classList.contains('timeline-no-container')).toBe(true);

    ext().external('sync', { geminiTimelineHideContainer: false });
    await settle();
    expect(bar().classList.contains('timeline-no-container')).toBe(false);
  });

  it('a change in local storage under the same name is not a settings change', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    ext().external('local', { geminiTimelineHideContainer: true });
    await settle();

    expect(bar().classList.contains('timeline-no-container')).toBe(false);
  });
});

describe('timeline rail width', () => {
  const ext = useTimelinePage();

  it('uses the 4px default width without a saved width', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    expect(barWidth()).toBe('4px');
  });

  it('applies a saved width within 4 to 24px', async () => {
    ext().seed('sync', { geminiTimelineBarWidth: 16 });
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    expect(barWidth()).toBe('16px');
  });

  it('ignores a saved width outside 4 to 24px', async () => {
    ext().seed('sync', { geminiTimelineBarWidth: 99 });
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    expect(barWidth()).toBe('4px');
  });

  it('a width changed in the popup applies to the open rail', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    ext().external('sync', { geminiTimelineBarWidth: 10 });
    await settle();

    expect(barWidth()).toBe('10px');
  });

  it('dragging the edge of the rail resizes it and saves the width', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    bar().style.left = '900px';
    bar().style.top = '100px';
    followInlinePosition(bar());
    // The 4px rail is centred in a 24px box at x = 900..924, so its right edge sits at x = 914.
    pointer('pointerdown', bar(), 914, 200);
    pointer('pointermove', window, 912 + 8, 200);
    pointer('pointerup', window, 912 + 8, 200);
    await settle();

    expect(barWidth()).toBe('16px');
    expect(ext().read('sync', 'geminiTimelineBarWidth')).toBe(16);
  });
});

describe('timeline draggable position', () => {
  const ext = useTimelinePage();

  async function dragRail(): Promise<void> {
    bar().style.left = '900px';
    bar().style.top = '100px';
    followInlinePosition(bar());
    pointer('pointerdown', bar(), 912 - 9, 250);
    pointer('pointermove', window, 512 - 9, 450);
    pointer('pointerup', window, 512 - 9, 450);
    await settle();
  }

  it('with dragging enabled, dragging the rail moves it and saves its position as percentages', async () => {
    ext().seed('sync', { geminiTimelineDraggable: true });
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    await dragRail();

    expect(bar().style.left).toBe('500px');
    expect(bar().style.top).toBe('300px');
    expect(ext().read('sync', 'geminiTimelinePosition')).toEqual({
      version: 2,
      topPercent: (300 / window.innerHeight) * 100,
      leftPercent: (500 / window.innerWidth) * 100,
    });
  });

  it('with dragging disabled (the default), the rail does not move or save a position', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    await dragRail();

    expect(bar().style.left).toBe('900px');
    expect(ext().read('sync', 'geminiTimelinePosition')).toBeUndefined();
  });

  it('a dragged position is restored after a reload', async () => {
    ext().seed('sync', { geminiTimelineDraggable: true });
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    await dragRail();

    await reloadPage(TURNS);

    expect(bar().style.left).toBe('500px');
    expect(bar().style.top).toBe('300px');
  });

  it('an old pixel position is applied and upgraded to a percentage position', async () => {
    ext().seed('sync', {
      geminiTimelineDraggable: true,
      geminiTimelinePosition: { top: 200, left: 300 },
    });
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    expect(bar().style.left).toBe('300px');
    expect(bar().style.top).toBe('200px');
    expect(ext().read('sync', 'geminiTimelinePosition')).toEqual({
      version: 2,
      topPercent: (200 / window.innerHeight) * 100,
      leftPercent: (300 / window.innerWidth) * 100,
    });
  });

  it('clearing the saved position in the popup returns the rail to its default place', async () => {
    ext().seed('sync', {
      geminiTimelineDraggable: true,
      geminiTimelinePosition: { version: 2, topPercent: 30, leftPercent: 40 },
    });
    new GeminiPage(TURNS);
    await startTimelineOnPage();
    expect(bar().style.left).not.toBe('');

    ext().external('sync', { geminiTimelinePosition: null });
    await settle();

    expect(bar().style.left).toBe('');
    expect(bar().style.top).toBe('');
  });
});

describe('timeline scroll mode and style', () => {
  const ext = useTimelinePage();

  it('switching scroll mode to jump in the popup makes the next dot click instant', async () => {
    const page = new GeminiPage(TURNS);
    await startTimelineOnPage();

    ext().external('sync', { geminiTimelineScrollMode: 'jump' });
    await settle();
    dotFor(TURNS[2].prompt).click();

    expect(page.viewport.scrollTop).toBe(page.topOf(TURNS[2].prompt));
  });

  it('the compact style marks the rail compact and hides the floating preview button', async () => {
    ext().seed('sync', { geminiTimelineStyle: 'compact' });
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    expect(bar().classList.contains('timeline-style-compact')).toBe(true);
    expect(document.querySelector<HTMLElement>(SURFACE.previewToggle)!.hidden).toBe(true);
  });

  it('switching to the ruler style in the popup restyles the open rail', async () => {
    new GeminiPage(TURNS);
    await startTimelineOnPage();

    ext().external('sync', { geminiTimelineStyle: 'ruler' });
    await settle();

    expect(bar().classList.contains('gv-timeline-style-ruler')).toBe(true);
    expect(bar().classList.contains('timeline-style-compact')).toBe(false);
  });
});
