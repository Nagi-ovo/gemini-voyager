// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
/**
 * Gemini's new-chat home (`/app`) matches the conversation route, so the timeline starts there
 * with no turns. Nothing of it may show until the first turn exists, whatever the rail style.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type GeminiTurn,
  GeminiPage,
  SURFACE,
  dotLabels,
  settle,
  startTimelineOnPage,
  timelineBar,
  useTimelinePage,
} from './geminiTimelineHarness';

vi.mock('webextension-polyfill', async () =>
  (await import('./geminiTimelineHarness')).polyfillMock(),
);

const FIRST: GeminiTurn = { prompt: 'Plan a trip to Kyoto', serverId: 'aaaaaaaaaaaaaaaa' };

// Tests stub app CSS imports, so load the stylesheets the view injects to compute visibility.
function installTimelineStyles(): void {
  const style = document.createElement('style');
  style.textContent = ['timeline.css', 'timelinePreview.css']
    .map((file) => readFileSync(resolve(process.cwd(), 'src/features/timeline', file), 'utf8'))
    .join('\n');
  document.head.replaceChildren(style);
}

const shown = (selector: string): boolean => {
  const element = document.querySelector<HTMLElement>(selector);
  return !!element && getComputedStyle(element).display !== 'none';
};

describe.each(['dots', 'compact', 'ruler'] as const)('timeline on Gemini home (%s)', (style) => {
  const ext = useTimelinePage('/app');
  beforeEach(installTimelineStyles);

  it('the Gemini home page with no conversation shows no timeline', async () => {
    ext().seed('sync', { geminiTimelineStyle: style });
    new GeminiPage([]);
    await startTimelineOnPage();
    // Turn discovery waits for a first turn before falling back to polling.
    await settle(5000);

    expect(timelineBar()).not.toBeNull();
    expect(shown(SURFACE.bar)).toBe(false);
    expect(shown(SURFACE.slider)).toBe(false);
    expect(shown(SURFACE.previewToggle)).toBe(false);
  });

  it('the rail appears once the first turn is sent', async () => {
    ext().seed('sync', { geminiTimelineStyle: style });
    const page = new GeminiPage([]);
    await startTimelineOnPage();
    await settle(5000);

    page.append(FIRST);
    await settle(2000);

    expect(dotLabels()).toEqual([FIRST.prompt]);
    expect(shown(SURFACE.bar)).toBe(true);
  });
});
