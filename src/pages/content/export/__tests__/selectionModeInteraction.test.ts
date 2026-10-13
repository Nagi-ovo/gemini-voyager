import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Declarations of the top-level rule whose selector list is exactly `selector`.
 * Anchored at a line start and closed by its own `}`, so neither a later rule
 * nor an indented `@media` copy of the selector can satisfy an assertion.
 */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*{([^}]*)}`))?.[1] ?? '';
}

describe('selection mode interaction', () => {
  it('pins the selection bar to the top', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');

    expect(ruleBody(css, '.gv-export-select-bar')).toMatch(/\btop:\s*12px;/);
  });

  it('supports dark-theme selectors for the export dialog', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');

    expect(css).toContain("html[data-gv-scheme='dark'] .gv-export-dialog");
  });

  it('styles the Markdown prompt heading switch for dark and RTL layouts', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');

    expect(css).toContain("html[data-gv-scheme='dark'] .gv-export-prompt-heading-section");
    expect(css).toContain('body.gv-rtl .gv-export-prompt-heading-switch .gv-coach-knob');
  });

  it('keeps logo wrapper from blocking top-bar button clicks', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    const wrapperBlock = ruleBody(css, '.gv-logo-dropdown-wrapper');
    const logoBlock = ruleBody(
      css,
      ".gv-logo-dropdown-wrapper [data-test-id='logo'], .gv-logo-dropdown-wrapper .logo",
    );

    expect(wrapperBlock).toContain('pointer-events: none;');
    expect(wrapperBlock).toContain('width: fit-content;');
    expect(logoBlock).toContain('pointer-events: auto;');
  });

  it('applies horizontal scrolling to the export selection bar and prevents text wrapping', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');

    // Check for container scroll behaviors
    const barBlock = ruleBody(css, '.gv-export-select-bar');
    expect(barBlock).toContain('overflow-x: auto;');
    expect(barBlock).toContain('scrollbar-width: none;');

    // Check for nowrapping and no shrinking on buttons
    const btnBlock = ruleBody(css, '.gv-export-select-all-toggle, .gv-export-select-role-btn');
    expect(btnBlock).toContain('white-space: nowrap;');
    expect(btnBlock).toContain('flex-shrink: 0;');
  });
});
