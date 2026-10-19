import { describe, expect, it } from 'vitest';

import { readContentStyle } from '@/tests/contentStyle';

function cssBlock(css: string, selector: string): string {
  const escaped = selector
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`Missing CSS block for ${selector}`);
  return block;
}

describe('prompt hover preview styling', () => {
  it('pins the panel font stack so the preview does not inherit the host page', () => {
    // Gemini, Claude and ChatGPT each set a different body font. The panel
    // pins its own stack; without the same pin here the preview renders in the
    // host font while the list underneath it does not.
    const tooltip = cssBlock(readContentStyle(), '.gv-pm-tooltip');

    expect(tooltip).toMatch(/font-family:\s*\n?\s*ui-sans-serif/);
  });

  it('draws the preview surface from the panel colour tokens in both themes', () => {
    const css = readContentStyle();
    const dark = cssBlock(css, '.gv-pm-tooltip');
    const light = cssBlock(css, ".gv-pm-tooltip[data-gv-theme='light']");

    // Same oklch values the panel uses, so the two surfaces read as one product.
    expect(dark).toContain('oklch(0.2 0.008 285)');
    expect(light).toContain('oklch(0.995 0.002 250)');
    // No hardcoded Tailwind-era greys left behind.
    expect(dark).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(light).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(dark).not.toContain('rgba(17, 24, 39');
  });

  it('keeps newline preservation on the raw fallback only', () => {
    const css = readContentStyle();
    const tooltip = cssBlock(css, '.gv-pm-tooltip');
    const raw = cssBlock(css, '.gv-pm-tooltip-raw');

    // `pre-wrap` on the container would put a blank line between every
    // rendered block once the Markdown pass replaces the plain text.
    expect(tooltip).not.toContain('white-space');
    expect(raw).toContain('white-space: pre-wrap');
  });

  it('rescales rendered Markdown headings against the card font size', () => {
    const css = readContentStyle();

    // Prompts routinely open with `# Title` / `## Section`. At host-page
    // heading sizes those blow the 420px card apart.
    expect(cssBlock(css, '.gv-pm-tooltip .gv-md h1')).toContain('font-size: 15px');
    expect(cssBlock(css, '.gv-pm-tooltip .gv-md h2')).toContain('font-size: 14px');
    expect(cssBlock(css, '.gv-pm-tooltip .gv-md > :first-child')).toContain('margin-top: 0');
  });

  it('marks the clipped card instead of ending mid-sentence', () => {
    const css = readContentStyle();
    const fade = cssBlock(css, '.gv-pm-tooltip-more::after');

    // macOS hides overlay scrollbars until a scroll starts, so a card cut off
    // at `max-height` looked broken rather than scrollable.
    expect(cssBlock(css, '.gv-pm-tooltip')).toContain('max-height');
    // Sticky, so the fade rides the bottom of the scrollport rather than the
    // end of the content, and it is scoped to the `-more` class so the last
    // line is not washed out once the user has scrolled to it.
    expect(fade).toContain('position: sticky');
    expect(fade).toContain('linear-gradient');
    expect(css).toContain(".gv-pm-tooltip-more[data-gv-theme='light']::after");
  });
});
