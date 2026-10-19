import { describe, expect, it } from 'vitest';

import { readContentStyle } from '@/tests/contentStyle';

describe('Folder-as-Project dropdown positioning', () => {
  it('opens the folder picker upward from the Gemini input toolbar', () => {
    const css = readContentStyle();
    const dropdownBlock = css.match(/\.gv-fp-dropdown\s*{([\s\S]*?)}/)?.[1] ?? '';

    expect(dropdownBlock).toContain('top: auto;');
    expect(dropdownBlock).toContain('bottom: 100%;');
    expect(dropdownBlock).toContain('margin-bottom: 4px;');
    expect(dropdownBlock).not.toContain('top: 100%;');
  });

  it('lifts the text-input-field overflow clip while the dropdown is open (#748)', () => {
    const css = readContentStyle();
    const unclipBlock =
      css.match(
        /\.text-input-field:has\(\.gv-fp-dropdown:not\(\[hidden\]\)\)\s*{([\s\S]*?)}/,
      )?.[1] ?? '';

    expect(unclipBlock).toContain('overflow: visible !important;');
  });
});
