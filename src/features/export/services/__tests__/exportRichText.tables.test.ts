import { Marked, marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { describe, expect, it } from 'vitest';

import { createContentExtractor } from '../DOMContentExtractor';
import { domExtractorTestAdapter } from './domExtractorTestAdapter';

const extractor = createContentExtractor(domExtractorTestAdapter);

describe('exportRichText.tables', () => {
  it('escapes literal pipes in Markdown table cells', () => {
    const assistant = document.createElement('div');
    assistant.innerHTML = `
      <message-content><div class="markdown">
        <table><thead><tr><th>Choice</th><th>Meaning</th></tr></thead>
        <tbody><tr><td>A | B</td><td>Either</td></tr></tbody></table>
      </div></message-content>
    `;

    const extracted = extractor.extractAssistantContent(assistant);

    expect(extracted.text).toContain('| A \\| B | Either |');
    expect(extracted.html).toContain('A | B');
  });

  describe('Gemini Notebook table exports', () => {
    it('ends the table block before a following paragraph', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <p>前置段落</p>
            <table-block>
              <table>
                <tbody>
                  <tr><th>案例</th></tr>
                  <tr><td>最后一行表格内容</td></tr>
                </tbody>
              </table>
            </table-block>
            <p>通过这三个例题的对比可以看出……</p>
          </div>
        </message-content>
      `;

      const sourceRowCount = assistant.querySelectorAll('table tr').length;
      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.text).toContain('| 最后一行表格内容 |\n\n通过这三个例题的对比可以看出……');

      const rendered = document.createElement('div');
      rendered.innerHTML = marked.parse(extracted.text) as string;
      const renderedTable = rendered.querySelector('table');

      expect(renderedTable?.querySelector('tbody')?.textContent).not.toContain(
        '通过这三个例题的对比可以看出……',
      );
      expect(renderedTable?.nextElementSibling?.tagName).toBe('P');
      expect(renderedTable?.querySelectorAll('tr')).toHaveLength(sourceRowCount);
    });

    it('preserves inline LaTeX and removes source chips from tables with a thead', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Statistic</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      Text before <span class="math-inline" data-math="X \\sim B(15, 0.9)">
                        <span class="katex"><span class="katex-html"><span class="vlist">X∼B(15, 0.9)</span></span></span>
                      </span> text after
                      <sources-carousel-inline>
                        <source-inline-chips>
                          <source-inline-chip>
                            <div class="source-inline-chip-container"><span>PDF</span></div>
                          </source-inline-chip>
                        </source-inline-chips>
                      </sources-carousel-inline>
                    </td>
                    <td><span data-math="p = 0.9"><span class="katex">p=0.9</span></span></td>
                    <td><em>Emphasis</em> and <code>inline code</code></td>
                  </tr>
                  <tr>
                    <td>Multiple formulas</td>
                    <td>
                      <span class="math-inline" data-math="\\mu = 90">μ=90</span>
                      and
                      <span class="math-inline" data-math="\\sigma = 3">σ=3</span>
                    </td>
                    <td>
                      Kept text
                      <span>
                        <sources-carousel-inline>
                          <source-inline-chip><span>PDF+1</span></source-inline-chip>
                        </sources-carousel-inline>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.hasTables).toBe(true);
      expect(extracted.hasFormulas).toBe(true);
      expect(extracted.text).toBe(
        [
          '| Case | Statistic | Notes |',
          '| --- | --- | --- |',
          '| Text before $X \\sim B(15, 0.9)$ text after | $p = 0.9$ | *Emphasis* and `inline code` |',
          '| Multiple formulas | $\\mu = 90$ and $\\sigma = 3$ | Kept text |',
        ].join('\n'),
      );
      expect(extracted.text).not.toContain('PDF');
      expect(extracted.text).not.toContain('PDF+1');
      expect(extracted.html).toContain('data-math="X \\sim B(15, 0.9)"');
      expect(extracted.html).toContain('class="katex"');
      expect(extracted.html).toContain('class="vlist"');
      expect(extracted.html).not.toContain('sources-carousel-inline');
      expect(extracted.html).not.toContain('source-inline-chip');
    });

    it('uses the same inline serialization when a tbody first row is the header', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <tbody>
                  <tr>
                    <th>
                      Parameter <span class="math-inline" data-math="\\theta">θ</span>
                      <source-inline-chip><span>PDF</span></source-inline-chip>
                    </th>
                    <th>Value</th>
                  </tr>
                  <tr>
                    <td>
                      Mean <span><span data-math="\\mu">μ</span></span>
                      <span><source-inline-chip><span>PDF+1</span></source-inline-chip></span>
                    </td>
                    <td>
                      <span class="math-inline" data-math="\\bar{x} = 356.5">x̄=356.5</span>
                      and <span class="math-inline" data-math="s = 5">s=5</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.hasTables).toBe(true);
      expect(extracted.hasFormulas).toBe(true);
      expect(extracted.text).toBe(
        [
          '| Parameter $\\theta$ | Value |',
          '| --- | --- |',
          '| Mean $\\mu$ | $\\bar{x} = 356.5$ and $s = 5$ |',
        ].join('\n'),
      );
      expect(extracted.text).not.toContain('PDF');
      expect(extracted.text).not.toContain('PDF+1');
      expect(extracted.html).toContain('data-math="\\bar{x} = 356.5"');
      expect(extracted.html).not.toContain('source-inline-chip');
    });

    it('preserves whitespace between adjacent formatted nodes', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <tbody>
                  <tr><th>Assessment</th></tr>
                  <tr><td><strong>high</strong> <em>risk</em></td></tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.text).toBe(['| Assessment |', '| --- |', '| **high** *risk* |'].join('\n'));
    });

    it.each([
      ['First<strong> Second</strong>', 'First **Second**'],
      ['<strong>First </strong>Second', '**First** Second'],
      ['First<em> Second</em>', 'First *Second*'],
      ['<code>First </code>Second', '`First` Second'],
    ])(
      'moves nested formatting boundary whitespace outside Markdown markers',
      (content, expected) => {
        const assistant = document.createElement('div');
        assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <tbody>
                  <tr><th>Content</th></tr>
                  <tr><td>${content}</td></tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

        const extracted = extractor.extractAssistantContent(assistant);

        expect(extracted.text).toBe(['| Content |', '| --- |', `| ${expected} |`].join('\n'));
      },
    );

    it('serializes nested display tags in inline code as plain text', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <div>Run <code><strong>npm</strong><em> install</em></code>.</div>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.text).toBe('Run `npm install`.');
      expect(extracted.html).toContain('Run <code>npm install</code>.');
    });

    it('serializes nested display tags in table inline code as plain text', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <tbody>
                  <tr><th>Code</th></tr>
                  <tr>
                    <td>
                      <code><strong>npm</strong><em> install|test</em><source-inline-chip>PDF</source-inline-chip></code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);
      const rendered = document.createElement('div');
      rendered.innerHTML = marked.parse(extracted.text) as string;

      expect(rendered.querySelectorAll('tbody tr:first-child td')).toHaveLength(1);
      expect(rendered.querySelector('tbody tr:first-child code')?.textContent).toBe(
        'npm install|test',
      );
      expect(extracted.text).not.toContain('PDF');
    });

    it.each([
      ['a`b', '``a`b``'],
      ['`edge`', '`` `edge` ``'],
      ['a``b', '```a``b```'],
    ])('round-trips backticks in inline code spans', (content, expectedMarkdown) => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <tbody>
                  <tr><th>Code</th></tr>
                  <tr><td><code>${content}</code></td></tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);
      expect(extracted.text).toContain(`| ${expectedMarkdown} |`);

      const rendered = document.createElement('div');
      rendered.innerHTML = marked.parse(extracted.text) as string;

      expect(rendered.querySelector('tbody tr:first-child code')?.textContent).toBe(content);
    });

    it.each([
      [String.raw`\|`, '<code>&#x5c;&#x7c;</code>'],
      [String.raw`\\|`, '<code>&#x5c;&#x5c;&#x7c;</code>'],
      ['*em*|x', '`*em*\\|x`'],
      [
        '[link](https://example.com)|**bold**~~gone~~',
        '`[link](https://example.com)\\|**bold**~~gone~~`',
      ],
    ])(
      'round-trips Markdown syntax and backslashes in table inline code spans',
      (content, expectedMarkdown) => {
        const assistant = document.createElement('div');
        assistant.innerHTML = `
          <message-content>
            <div class="markdown">
              <table-block>
                <table>
                  <tbody>
                    <tr><th>Code</th></tr>
                    <tr><td><code>${content}</code></td></tr>
                  </tbody>
                </table>
              </table-block>
            </div>
          </message-content>
        `;

        const extracted = extractor.extractAssistantContent(assistant);
        expect(extracted.text).toContain(`| ${expectedMarkdown} |`);

        const rendered = document.createElement('div');
        rendered.innerHTML = marked.parse(extracted.text) as string;

        expect(rendered.querySelectorAll('tbody tr:first-child td')).toHaveLength(1);
        expect(rendered.querySelector('tbody tr:first-child code')?.textContent).toBe(content);
      },
    );

    it.each(['a  |  b', 'a\t|\tb', 'a\n|\nb'])(
      'round-trips collapsible whitespace in table inline code',
      (content) => {
        const assistant = document.createElement('div');
        assistant.innerHTML = `
          <message-content>
            <div class="markdown">
              <table-block>
                <table>
                  <tbody>
                    <tr><th>Code</th></tr>
                    <tr><td><code>${content}</code></td></tr>
                  </tbody>
                </table>
              </table-block>
            </div>
          </message-content>
        `;

        const extracted = extractor.extractAssistantContent(assistant);
        const rendered = document.createElement('div');
        rendered.innerHTML = marked.parse(extracted.text) as string;

        expect(extracted.text).toContain('<code>');
        expect(rendered.querySelectorAll('tbody tr:first-child td')).toHaveLength(1);
        expect(rendered.querySelector('tbody tr:first-child code')?.textContent).toBe(content);
      },
    );

    it('escapes table delimiters in formulas, text, and inline code', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <tbody>
                  <tr><th>Formula</th><th>Text</th><th>Code</th></tr>
                  <tr>
                    <td><span class="math-inline" data-math="P(A|B)">P(A|B)</span></td>
                    <td>left | right</td>
                    <td><code>a|b</code></td>
                  </tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.text).toContain('| $P(A\\|B)$ | left \\| right | `a\\|b` |');

      const rendered = document.createElement('div');
      rendered.innerHTML = marked.parse(extracted.text) as string;
      const cells = rendered.querySelectorAll('tbody tr:first-child td');
      expect(cells).toHaveLength(3);
      expect(Array.from(cells, (cell) => cell.textContent)).toEqual([
        '$P(A|B)$',
        'left | right',
        'a|b',
      ]);

      const katexParser = new Marked(
        markedKatex({
          throwOnError: false,
          output: 'html',
          trust: true,
          strict: false,
        }),
      );
      const katexRendered = document.createElement('div');
      katexRendered.innerHTML = katexParser.parse(extracted.text) as string;

      const formulaCell = katexRendered.querySelector('tbody tr:first-child td:first-child');
      expect(formulaCell?.querySelector('.katex')).not.toBeNull();
      expect(formulaCell?.querySelector('.katex-error')).toBeNull();
      expect(formulaCell?.querySelector('.katex-html')?.textContent).toContain('P(A');
    });

    it('preserves LaTeX vertical-bar commands through Markdown table rendering', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <tbody>
                  <tr><th>Norm</th></tr>
                  <tr>
                    <td><span class="math-inline" data-math="\\|x\\|">‖x‖</span></td>
                  </tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);
      const parser = new Marked(
        markedKatex({
          throwOnError: false,
          output: 'html',
          trust: true,
          strict: false,
        }),
      );
      const rendered = document.createElement('div');
      rendered.innerHTML = parser.parse(extracted.text) as string;

      expect(rendered.querySelector('.katex-html')?.textContent).toBe('∥x∥');
      expect(rendered.querySelector('.katex-html .newline')).toBeNull();
    });

    it('preserves consecutive LaTeX vertical-bar commands in Markdown tables', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <tbody>
                  <tr><th>Bars</th></tr>
                  <tr>
                    <td><span class="math-inline" data-math="\\|\\|">‖‖</span></td>
                  </tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);
      const parser = new Marked(
        markedKatex({
          throwOnError: false,
          output: 'html',
          trust: true,
          strict: false,
        }),
      );
      const rendered = document.createElement('div');
      rendered.innerHTML = parser.parse(extracted.text) as string;

      expect(extracted.text).toContain('$\\Vert{}\\Vert{}$');
      expect(rendered.querySelector('.katex-html')?.textContent).toBe('∥∥');
    });

    it('recursively serializes formulas and filters sources inside formatting tags', () => {
      const assistant = document.createElement('div');
      assistant.innerHTML = `
        <message-content>
          <div class="markdown">
            <table-block>
              <table>
                <tbody>
                  <tr><th>Strong</th><th>Emphasis</th><th>Code</th></tr>
                  <tr>
                    <td>
                      <strong>
                        <span class="math-inline" data-math="\\theta">θ</span>
                        <source-inline-chip><span>PDF</span></source-inline-chip>
                      </strong>
                    </td>
                    <td>
                      <em>
                        value <span data-math="\\alpha">α</span>
                        <source-inline-chip><span>PDF+1</span></source-inline-chip>
                      </em>
                    </td>
                    <td><code>x<source-inline-chip><span>PDF</span></source-inline-chip></code></td>
                  </tr>
                </tbody>
              </table>
            </table-block>
          </div>
        </message-content>
      `;

      const extracted = extractor.extractAssistantContent(assistant);

      expect(extracted.hasFormulas).toBe(true);
      expect(extracted.text).toContain('| **$\\theta$** | *value $\\alpha$* | `x` |');
      expect(extracted.text).not.toContain('PDF');
      expect(extracted.text).not.toContain('PDF+1');
    });
  });
});
