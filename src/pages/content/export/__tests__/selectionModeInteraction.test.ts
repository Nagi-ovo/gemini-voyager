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

  it('pins selection bar to top and uses top-center compact progress toast styles', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    const overlayBlock = css.match(/\.gv-export-progress-overlay\s*{([\s\S]*?)}/)?.[1] ?? '';
    const cardBlock = css.match(/\.gv-export-progress-card\s*{([\s\S]*?)}/)?.[1] ?? '';

    expect(css).toMatch(/\.gv-export-select-bar\s*{[\s\S]*top:\s*12px;/);
    expect(css).not.toContain('.gv-export-select-below-pill');
    expect(overlayBlock).toContain('position: fixed;');
    expect(overlayBlock).toContain('left: 50%;');
    expect(overlayBlock).toContain('transform: translateX(-50%);');
    expect(overlayBlock).toContain('top: calc(env(safe-area-inset-top, 0px) + 76px);');
    expect(overlayBlock).toContain('pointer-events: none;');
    expect(cardBlock).toContain('border-radius: 999px;');
    expect(cardBlock).toContain('backdrop-filter: blur(10px);');
  });

  it('supports dark-theme selectors for export dialog and progress toast', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');

    expect(css).toContain('html.dark-theme .gv-export-dialog');
    expect(css).toContain('body.dark-theme .gv-export-dialog');
    expect(css).toContain('html.dark-theme .gv-export-progress-card');
    expect(css).toContain("body[data-theme='dark'] .gv-export-progress-card");
  });

  it('wires Safari PDF success path to runtime toast guidance', () => {
    const code = readFileSync(resolve(process.cwd(), 'src/pages/content/export/index.ts'), 'utf8');

    expect(code).toContain("format === 'pdf'");
    expect(code).toContain('isSafari()');
    expect(code).toContain('showExportToast(');
  });
});
