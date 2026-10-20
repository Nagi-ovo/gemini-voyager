import { describe, expect, it } from 'vitest';

import { readContentStyle } from '@/tests/contentStyle';

import { VOYAGER_WORDMARK_PATH, VOYAGER_WORDMARK_VIEWBOX } from '../voyagerWordmark';

describe('Voyager wordmark', () => {
  // The prompt panel draws the wordmark from a CSS mask while the popup renders
  // the TS path, so an edit to one alone would show two different logos.
  it('paints the prompt panel with the same outline the popup renders', () => {
    const masks = [...readContentStyle().matchAll(/mask: url\("data:image\/svg\+xml,([^"]+)"\)/g)]
      .map(([, svg]) => decodeURIComponent(svg))
      .filter((svg) => svg.includes(VOYAGER_WORDMARK_VIEWBOX));

    expect(masks.length).toBeGreaterThan(0);
    for (const svg of masks) expect(svg).toContain(`d='${VOYAGER_WORDMARK_PATH}'`);
  });
});
