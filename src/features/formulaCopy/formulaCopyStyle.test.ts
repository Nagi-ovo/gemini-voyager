import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readFormulaCopyCss(): string {
  const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
  const start = css.indexOf('/* ==================== Formula Copy Feature ==================== */');
  const end = css.indexOf('/* Notebooks corner swap toggle', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe('formula copy interaction styles', () => {
  it('only shows formula click affordances while the service is active', () => {
    const css = readFormulaCopyCss();

    expect(css).toContain(
      ':root.gv-formula-copy-enabled .math-inline:not(.gv-formula-copy-ignored)',
    );
    expect(css).toContain(
      ':root.gv-formula-copy-enabled [data-math]:not(.gv-formula-copy-ignored)',
    );
    expect(css).toContain(':root.gv-formula-copy-enabled ms-katex:not(.gv-formula-copy-ignored)');
    expect(css).toContain(
      ':root.gv-platform-themed.gv-formula-copy-enabled .katex:not(.gv-formula-copy-ignored)',
    );
    // The hover affordance is scoped by the enabled class, on the root, so it
    // appears only while the service is running. There used to be a second,
    // light-only copy of this hover keyed on [data-color-scheme='light'] — an
    // attribute no adapter sets, so it never rendered. It is deleted rather
    // than rewired: switching it on now would be a new behaviour, not a fix.
    expect(css).toContain(
      ':root.gv-formula-copy-enabled .math-inline:not(.gv-formula-copy-ignored):hover',
    );

    expect(css).not.toMatch(/^\.math-inline/m);
    expect(css).not.toMatch(/^\.math-display/m);
    expect(css).not.toMatch(/^\[data-math\]/m);
    expect(css).not.toMatch(/^ms-katex/m);
    expect(css).not.toContain(':root.gv-platform-themed .katex');
  });
});
