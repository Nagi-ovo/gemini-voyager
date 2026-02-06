import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('selection mode interaction', () => {
  it('uses checkbox-only selection without select-below behavior', () => {
    const code = readFileSync(resolve(process.cwd(), 'src/pages/content/export/index.ts'), 'utf8');

    expect(code).not.toContain('gv-export-select-below-pill');
    expect(code).not.toContain('export_select_mode_select_below');
    expect(code).not.toContain('selectBelowIds(');
    expect(code).not.toContain('findSelectionStartIdAtLine(');
  });

  it('pins selection bar to top and uses bottom-right progress toast styles', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    const overlayBlock = css.match(/\.gv-export-progress-overlay\s*{([\s\S]*?)}/)?.[1] ?? '';

    expect(css).toMatch(/\.gv-export-select-bar\s*{[\s\S]*top:\s*12px;/);
    expect(css).not.toContain('.gv-export-select-below-pill');
    expect(overlayBlock).toContain('position: fixed;');
    expect(overlayBlock).toContain('inset: auto;');
    expect(overlayBlock).toContain('right: 16px;');
    expect(overlayBlock).toContain('bottom: 16px;');
    expect(overlayBlock).toContain('pointer-events: none;');
    expect(overlayBlock).not.toContain('backdrop-filter');
  });
});
