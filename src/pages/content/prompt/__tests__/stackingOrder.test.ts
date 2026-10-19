import { describe, expect, it } from 'vitest';

import { readContentStyle } from '@/tests/contentStyle';

function zIndexFor(css: string, selector: string): number {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1];
  const value = block?.match(/z-index:\s*(\d+)/)?.[1];

  if (!value) throw new Error(`Missing z-index for ${selector}`);
  return Number(value);
}

describe('prompt manager stacking order', () => {
  it('keeps the trigger and panel above the floating usage bar', () => {
    const css = readContentStyle();
    const usageBar = zIndexFor(css, '.gv-usage-pill');
    const trigger = zIndexFor(css, '.gv-pm-trigger');
    const panel = zIndexFor(css, '.gv-pm-panel');

    expect(trigger).toBeGreaterThan(usageBar);
    expect(panel).toBeGreaterThan(trigger);
  });

  it('keeps a Prompt Manager opened over the Research Pack on top of it', () => {
    const css = readContentStyle();

    // Opening the Research Pack closes the Prompt Manager, so the newer panel
    // is on top either way only while the Prompt Manager outranks it.
    expect(zIndexFor(css, '.gv-pm-panel')).toBeGreaterThan(zIndexFor(css, '.gv-rp-panel'));
  });
});
