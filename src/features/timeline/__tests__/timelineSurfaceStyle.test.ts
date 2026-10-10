import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readContentStyle(): string {
  return [
    'public/contentStyle.css',
    'src/features/timeline/timeline.css',
    'src/features/timeline/timelinePreview.css',
  ]
    .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
    .join('\n');
}

/** Every declaration of `name`, in source order. */
function declarations(css: string, name: string): string[] {
  return [...css.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g'))].map((match) =>
    match[1].trim(),
  );
}

describe('timeline floating surfaces', () => {
  // These tokens are shared by the timeline tooltip and the timeline context
  // menu, and they used to be Tailwind-era hex - the dark one a blue-black
  // (#0b1220) against the prompt panel's neutral, so two Voyager surfaces on
  // the same page read as two different products.
  it('draws its surfaces from the same oklch set as the prompt panel', () => {
    const css = readContentStyle();

    for (const token of [
      '--timeline-tooltip-bg',
      '--timeline-tooltip-text',
      '--timeline-tooltip-border',
    ]) {
      const values = declarations(css, token);
      expect(values.length, `${token} is declared for every theme`).toBe(4);
      for (const value of values) {
        expect(value, `${token} = ${value}`).toMatch(/^oklch\(/);
      }
    }
  });

  it('shares the panel surfaces exactly, so the two read as one product', () => {
    const css = readContentStyle();

    expect(declarations(css, '--timeline-tooltip-bg')).toContain('oklch(0.2 0.008 285)');
    expect(declarations(css, '--timeline-tooltip-bg')).toContain('oklch(0.995 0.002 250)');
    expect(declarations(css, '--timeline-tooltip-text')).toContain('oklch(0.92 0.004 250)');
  });

  it('lifts with one restrained shadow rather than a heavier stacked pair', () => {
    const shadow = declarations(readContentStyle(), '--timeline-tooltip-shadow')[0];

    expect(shadow).toBe('0 6px 20px oklch(0 0 0 / 0.28)');
  });

  it('pins its own font stack instead of inheriting a host page font', () => {
    // Gemini, Claude and ChatGPT each set a different body font, and
    // 'Google Sans' is one host's.
    const block = readContentStyle().match(/\.timeline-tooltip\s*\{([^}]*)\}/)?.[1] ?? '';
    // Comments stripped: this rule explains itself by naming the font it left.
    const declared = block.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(declared).toMatch(/font-family:\s*\n?\s*ui-sans-serif/);
    expect(declared).not.toContain('Google Sans');
  });
});

describe('timeline rail background', () => {
  function rule(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = readContentStyle().match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[2];
    if (!body) throw new Error(`Missing rule for ${selector}`);
    return body;
  }

  it('paints a hairline-visible film when the outer container is shown', () => {
    expect(
      rule('html[data-gv-scheme] .gemini-timeline-bar:not(.timeline-no-container)::before'),
    ).toMatch(/background-color:\s*var\(--timeline-rail-film\)/);
    expect(rule("html[data-gv-scheme='dark']")).toMatch(
      /--timeline-rail-film:\s*rgba\(255,\s*255,\s*255,\s*0\.28\)/,
    );
    expect(rule("html[data-gv-scheme='light']")).toMatch(
      /--timeline-rail-film:\s*rgba\(0,\s*0,\s*0,\s*0\.2\)/,
    );
  });
});
