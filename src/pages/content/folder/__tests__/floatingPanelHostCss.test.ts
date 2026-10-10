import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AISTUDIO_TREE_CSS } from '../aistudioTree';
import { POPOVER_LAYER_HOST_CSS } from '../floatingTree/popoverLayer';

// The vitest config swallows `?raw` CSS outside the plugin catalog, so read the file.
const panelCss = readFileSync(resolve(__dirname, '../floatingPanel.css'), 'utf8');

// jsdom has no cascade across shadow boundaries, so this guards the stylesheet
// contract directly: a page rule that matches the host (`* {}`, `div {}`, a CSS
// reset) beats any normal `:host` declaration, whatever its specificity. Only
// `!important` host declarations win, and Chrome confirmed the page rules won
// before they were marked.
const HOST_ONLY = /^:host(\(\[[^\]]+\]\))?$/;

function hostOnlyDeclarations(css: string): string[] {
  const declarations: string[] = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (!selectors.every((selector) => HOST_ONLY.test(selector))) continue;
    for (const declaration of match[2].split(';')) {
      const text = declaration.trim();
      if (text && !text.startsWith('--')) declarations.push(text.replace(/\s+/g, ' '));
    }
  }
  return declarations;
}

describe('floating panel host stylesheet', () => {
  it('marks every host declaration important so page rules cannot restyle the panel', () => {
    const declarations = hostOnlyDeclarations(panelCss);

    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.filter((text) => !text.endsWith('!important'))).toEqual([]);
  });
});

describe('AI Studio sidebar tree host stylesheet', () => {
  it('marks every host declaration important, so the nav cannot restyle the tree host', () => {
    const declarations = hostOnlyDeclarations(AISTUDIO_TREE_CSS);

    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.filter((text) => !text.endsWith('!important'))).toEqual([]);
  });

  // The panel's `:host([data-gv-scheme='light'])` paints a background and shadow
  // with the same specificity as a bare attribute host selector; the sidebar
  // sheet comes after it, so it must reset those under that selector too.
  it('resets the floating geometry under the scheme host selector as well', () => {
    const withoutComments = AISTUDIO_TREE_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const block = withoutComments.match(/([^{}]*:host\(\[data-gv-scheme\]\)[^{}]*)\{([^{}]*)\}/);
    expect(block?.[2]).toMatch(/position:\s*relative !important/);
    expect(block?.[2]).toMatch(/background:\s*transparent !important/);
    expect(block?.[2]).toMatch(/box-shadow:\s*none !important/);
  });
});

describe('folder menu popover layer host stylesheet', () => {
  const hostBlock = () =>
    POPOVER_LAYER_HOST_CSS.match(/([^{}]*:host\(\[data-gv-scheme\]\)[^{}]*)\{([^{}]*)\}/)?.[2] ??
    '';

  it('marks every host declaration important, so page rules cannot restyle the layer', () => {
    const declarations = hostOnlyDeclarations(POPOVER_LAYER_HOST_CSS);

    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.filter((text) => !text.endsWith('!important'))).toEqual([]);
  });

  // It follows the panel sheet, whose host is a 280×320 card taking clicks.
  it('shrinks the host to a box that takes no clicks, under the scheme selector too', () => {
    expect(hostBlock()).toMatch(/min-width:\s*0 !important/);
    expect(hostBlock()).toMatch(/min-height:\s*0 !important/);
    expect(hostBlock()).toMatch(/pointer-events:\s*none !important/);
    expect(hostBlock()).toMatch(/background:\s*transparent !important/);
    expect(POPOVER_LAYER_HOST_CSS).toMatch(/__context-menu\s*\{\s*pointer-events:\s*auto;/);
  });

  // A containing block on the host would place and clip the fixed menu again.
  it('keeps the host from becoming the containing block of the fixed menu', () => {
    for (const property of ['transform', 'filter', 'perspective', 'contain']) {
      expect(hostBlock()).toMatch(new RegExp(`(^|[;\\s])${property}:\\s*none !important`));
    }
  });
});
