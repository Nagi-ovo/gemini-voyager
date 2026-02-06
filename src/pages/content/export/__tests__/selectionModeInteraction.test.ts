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

  it('pins selection bar to top and includes export progress modal styles', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');

    expect(css).toMatch(/\.gv-export-select-bar\s*{[\s\S]*top:\s*12px;/);
    expect(css).not.toContain('.gv-export-select-below-pill');
    expect(css).toContain('.gv-export-progress-overlay');
    expect(css).toContain('.gv-export-progress-card');
  });
});
