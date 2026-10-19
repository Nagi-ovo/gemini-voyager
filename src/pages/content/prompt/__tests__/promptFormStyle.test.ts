import { describe, expect, it } from 'vitest';

import { readContentStyle } from '@/tests/contentStyle';

/**
 * Every rule block that targets the class `cls`, as [selector, body] pairs.
 * Matched on a class-name boundary so `.gv-pm-save` does not also pull in
 * `.gv-pm-saved-filters`.
 */
function blocksFor(css: string, cls: string): Array<[string, string]> {
  const boundary = new RegExp(`\\${cls}(?![\\w-])`);
  const out: Array<[string, string]> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const selector = m[1].trim();
    if (boundary.test(selector)) out.push([selector, m[2]]);
  }
  return out;
}

describe('prompt form accent', () => {
  it('paints the primary buttons from the brand token in every theme layer', () => {
    const css = readContentStyle();
    // The panel always carries data-gv-theme, so that layer wins over the base
    // rules — both must resolve the accent through the token, or a custom
    // colour only survives in whichever layer was updated.
    for (const cls of ['.gv-pm-save', '.gv-pm-add', '.gv-pm-backup-btn']) {
      const blocks = blocksFor(css, cls);
      expect(blocks.length).toBeGreaterThan(2);

      for (const [selector, body] of blocks) {
        if (!/background:/.test(body) || /::/.test(selector)) continue;
        expect(
          /var\(--gv-pm-brand/.test(body),
          `${selector} sets a background that does not come from the brand token`,
        ).toBe(true);
      }
    }
  });

  it('never rebuilds the accent from a literal hue', () => {
    const css = readContentStyle();

    // Regression: :hover hardcoded hue 158 and the dark foreground hue 160, so
    // a user's custom accent snapped back to the default green on hover.
    for (const needle of ['.gv-pm-save', '.gv-pm-add']) {
      for (const [selector, body] of blocksFor(css, needle)) {
        expect(body, `${selector} hardcodes a brand hue`).not.toMatch(
          /oklch\([^)]*\b(?:158|160)\b[^)]*\)/,
        );
      }
    }
  });

  it('keeps the form fields on one shape and inherits the panel foreground', () => {
    const css = readContentStyle();
    // The class also appears in the shared user-select and box-sizing resets;
    // the shape block is the one that sets the radius.
    const base = blocksFor(css, '.gv-pm-input-text').find(([, body]) =>
      body.includes('border-radius'),
    );
    expect(base).toBeDefined();
    const body = (base as [string, string])[1];

    // Inheriting kills the per-theme hex duplication these fields used to carry.
    expect(body).toContain('color: inherit');
    // Form controls do not inherit type by default.
    expect(body).toContain('font: inherit');
    expect(body).toContain('border-radius: 10px');
    expect(body).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it('lets a fill slot wrap rather than set itself a width', () => {
    const css = readContentStyle();
    const slot = blocksFor(css, '.gv-pm-slot').find(([, body]) => body.includes('border-bottom'));
    expect(slot).toBeDefined();
    const body = (slot as [string, string])[1];

    // An `<input>` cannot wrap, so a long value grew the slot past the card
    // that held it: measured on gemini.google.com, a 45-character value made a
    // 465px slot inside a 460px card, which then scrolled sideways and clipped
    // its own text. The slot is an editable span now and takes no width.
    expect(body).toMatch(/white-space:\s*pre-wrap/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
    expect(body).not.toMatch(/^\s*width\s*:/m);
    // The name it stands for, which an input carried as `placeholder`.
    expect(css).toContain('.gv-pm-slot:empty::before');
  });

  it('dims the quoted prompt with colour, never opacity', () => {
    const css = readContentStyle();
    const body = blocksFor(css, '.gv-pm-sent-body').find(([, b]) => b.includes('border-left'));
    const value = blocksFor(css, '.gv-pm-sent-value').find(([, b]) => b.includes('background'));
    expect(body).toBeDefined();
    expect(value).toBeDefined();

    // `opacity` applies to the whole subtree and cannot be undone by a child,
    // so the filled values would be dimmed along with the template they sit in.
    expect((body as [string, string])[1]).not.toMatch(/opacity\s*:/);
    expect((body as [string, string])[1]).toMatch(/color\s*:\s*color-mix/);
    // The value carries the chip's accent so it lifts clear of the quotation.
    expect((value as [string, string])[1]).toMatch(/--gv-pm-brand/);
  });
});
