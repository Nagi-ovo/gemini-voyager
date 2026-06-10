import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Folder-as-Project dropdown positioning', () => {
  it('opens the folder picker upward from the Gemini input toolbar', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    const dropdownBlock = css.match(/\.gv-fp-dropdown\s*{([\s\S]*?)}/)?.[1] ?? '';

    expect(dropdownBlock).toContain('top: auto;');
    expect(dropdownBlock).toContain('bottom: 100%;');
    expect(dropdownBlock).toContain('margin-bottom: 4px;');
    expect(dropdownBlock).not.toContain('top: 100%;');
  });

  it('lifts the text-input-field overflow clip while the dropdown is open (#748)', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    const unclipBlock =
      css.match(
        /\.text-input-field:has\(\.gv-fp-dropdown:not\(\[hidden\]\)\)\s*{([\s\S]*?)}/,
      )?.[1] ?? '';

    expect(unclipBlock).toContain('overflow: visible !important;');
  });
});
