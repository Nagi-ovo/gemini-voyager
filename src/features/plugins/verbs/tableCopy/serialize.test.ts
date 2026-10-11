import { afterEach, describe, expect, it } from 'vitest';

import { serializeTable } from './serialize';

/** KaTeX's own output, as DeepSeek renders it: MathML with the TeX annotation, then glyphs. */
function katex(tex: string, glyphs: string, display = false): string {
  const inline =
    '<span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>' +
    glyphs +
    '</mi></mrow><annotation encoding="application/x-tex">' +
    tex +
    '</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">' +
    glyphs +
    '</span></span>';
  return display ? `<span class="katex-display">${inline}</span>` : inline;
}

function table(html: string): HTMLTableElement {
  document.body.innerHTML = `<table>${html}</table>`;
  return document.querySelector('table')!;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('tableCopy serialization', () => {
  it('copying a table with a formula keeps the LaTeX instead of flattened glyphs', () => {
    const source = table(
      '<thead><tr><th>Term</th><th>Value</th></tr></thead>' +
        `<tbody><tr><td>${katex('x^2', 'x2')}</td><td>${katex('\\frac{a}{b}', 'ab')}</td></tr></tbody>`,
    );

    expect(serializeTable(source, 'markdown')).toBe(
      '| Term | Value |\n| --- | --- |\n| $x^2$ | $\\frac{a}{b}$ |',
    );
    expect(serializeTable(source, 'tsv')).toBe('Term\tValue\n$x^2$\t$\\frac{a}{b}$');
  });

  it('keeps a formula whose TeX sits on a wrapper, as ChatGPT renders it', () => {
    const source = table(
      '<thead><tr><th>Law</th></tr></thead><tbody><tr><td>' +
        '<span data-math-source="E=mc^2"><span class="katex"><span class="katex-html">E=mc2</span></span></span>' +
        '</td></tr></tbody>',
    );

    expect(serializeTable(source, 'markdown')).toBe('| Law |\n| --- |\n| $E=mc^2$ |');
  });

  it('copies a block formula in a cell as display math', () => {
    const source = table(
      `<thead><tr><th>Sum</th></tr></thead><tbody><tr><td>${katex('\\sum_i x_i', 'Σx', true)}</td></tr></tbody>`,
    );

    expect(serializeTable(source, 'tsv')).toBe('Sum\n$$\\sum_i x_i$$');
  });

  it('pastes into a spreadsheet as text: no markup, no evaluated formulas, quotes escaped', () => {
    const source = table(
      '<thead><tr><th><strong>Cell</strong></th><th>Note</th></tr></thead><tbody>' +
        '<tr><td>=HYPERLINK("http://x")</td><td>say "hi"</td></tr>' +
        '<tr><td>-12.5</td><td><code>npm\ti</code><br>next line</td></tr>' +
        '<tr><td>@mention</td><td></td></tr>' +
        '</tbody>',
    );

    expect(serializeTable(source, 'tsv')).toBe(
      [
        'Cell\tNote',
        `"'=HYPERLINK(""http://x"")"\t"say ""hi"""`,
        '-12.5\tnpm i next line',
        "'@mention\t",
      ].join('\n'),
    );
  });
});
