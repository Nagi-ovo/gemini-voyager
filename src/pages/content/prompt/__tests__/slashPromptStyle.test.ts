import { describe, expect, it } from 'vitest';

import { readContentStyle } from '@/tests/contentStyle';

function cssBlock(css: string, selector: string): string {
  const escapedSelector = selector
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*');
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`Missing CSS block for ${selector}`);
  return block;
}

describe('slash prompt token styling', () => {
  it('keeps prompt markers unpadded so they align with Gemini plain text', () => {
    const css = readContentStyle();
    const nativeToken = cssBlock(css, ".gv-pm-slash-token[contenteditable='false']");
    const rebuiltMarker = cssBlock(css, '.gv-pm-slash-textarea-token');

    expect(nativeToken).toContain('--gv-pm-brand');
    expect(rebuiltMarker).toContain('--gv-pm-brand');
    expect(nativeToken).not.toMatch(/(?:padding|background|border-radius)\s*:/);
    expect(rebuiltMarker).not.toMatch(/(?:padding|background|border-radius)\s*:/);
  });

  it('keeps the native hit-test marker invisible in every theme', () => {
    const css = readContentStyle();

    // The marker sits on top of the editor's real token purely for hover. A
    // single-class colour rule must never outrank it, or light theme paints a
    // second copy of the prompt name over the first one.
    expect(css).toContain(
      '.gv-pm-slash-textarea-token.gv-pm-slash-textarea-token-native {\n  color: transparent !important;\n}',
    );
    expect(css).not.toMatch(/\[data-gv-theme='light'\]\s+\.gv-pm-slash-textarea-token\s*\{/);
  });

  it('keeps rebuilt contenteditable markers from repainting the prompt name', () => {
    const css = readContentStyle();
    const contenteditableMarker = cssBlock(
      css,
      ".gv-pm-slash-textarea-tokens[data-gv-input-kind='contenteditable']\n  .gv-pm-slash-textarea-token",
    );

    expect(contenteditableMarker).toContain('color: transparent !important');
  });

  it('shows a single theme-coloured overlay only after its source is covered', () => {
    const css = readContentStyle();
    const coveredMarker = cssBlock(
      css,
      ".gv-pm-slash-textarea-tokens[data-gv-input-kind='contenteditable']\n  .gv-pm-slash-textarea-token-covered-source",
    );
    const tag = cssBlock(css, '.gv-pm-slash-option-tag');

    expect(coveredMarker).toContain('--gv-pm-brand');
    expect(tag).toContain('--gv-pm-brand');
    expect(css).toContain("[data-gv-interaction='pointer'] .gv-pm-slash-option:hover");
    expect(css).not.toMatch(/^\.gv-pm-slash-option:hover/m);
  });

  it('lets the marker cover Prompt selections without exposing native selection paint', () => {
    const css = readContentStyle();
    const nativeSelection = cssBlock(css, '.gv-pm-slash-prompt-only-selection *::selection');
    const selectedMarker = cssBlock(css, '.gv-pm-slash-textarea-token-selected');

    expect(nativeSelection).toContain('background: transparent !important');
    expect(nativeSelection).toContain('color: transparent !important');
    expect(selectedMarker).toContain('--gv-pm-brand');
    expect(selectedMarker).toContain('--gv-pm-slash-input-surface');
    expect(selectedMarker).toContain('18%');
    expect(selectedMarker).toContain('linear-gradient');
    expect(selectedMarker).toContain('-1px / 100% 100% no-repeat');
    expect(selectedMarker).toContain('box-shadow: 0 -1px 0');
    expect(selectedMarker).not.toMatch(/padding\s*:/);
    expect(selectedMarker).not.toMatch(/transform\s*:/);
  });
});
