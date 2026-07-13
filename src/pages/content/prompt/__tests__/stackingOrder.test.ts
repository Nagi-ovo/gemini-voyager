import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function zIndexFor(css: string, selector: string): number {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1];
  const value = block?.match(/z-index:\s*(\d+)/)?.[1];

  if (!value) throw new Error(`Missing z-index for ${selector}`);
  return Number(value);
}

describe('prompt manager stacking order', () => {
  it('keeps the trigger and panel above the floating usage bar', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    const usageBar = zIndexFor(css, '.gv-usage-pill');
    const trigger = zIndexFor(css, '.gv-pm-trigger');
    const panel = zIndexFor(css, '.gv-pm-panel');

    expect(trigger).toBeGreaterThan(usageBar);
    expect(panel).toBeGreaterThan(trigger);
  });
});
