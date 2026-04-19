import { describe, expect, it } from 'vitest';

import { convertCanvasDomToMarkdown } from '../markdownConverter';

function renderFromHtml(html: string): string {
  const root = document.createElement('div');
  root.className = 'ProseMirror';
  root.innerHTML = html;
  return convertCanvasDomToMarkdown(root);
}

describe('convertCanvasDomToMarkdown', () => {
  it('renders headings and paragraphs', () => {
    const md = renderFromHtml(
      '<h1>Title</h1><p>Hello <strong>bold</strong> and <em>italic</em>.</p>',
    );
    expect(md).toContain('# Title');
    expect(md).toContain('Hello **bold** and *italic*.');
  });

  it('handles heading hierarchy', () => {
    const md = renderFromHtml('<h2>A</h2><h3>B</h3><p>text</p>');
    expect(md).toMatch(/## A/);
    expect(md).toMatch(/### B/);
  });

  it('renders unordered and ordered lists', () => {
    const md = renderFromHtml(
      '<ul><li>first</li><li>second</li></ul><ol><li>one</li><li>two</li></ol>',
    );
    expect(md).toContain('- first');
    expect(md).toContain('- second');
    expect(md).toContain('1. one');
    expect(md).toContain('2. two');
  });

  it('renders fenced code blocks with language hint', () => {
    const md = renderFromHtml('<pre><code class="language-ts">const x = 1;</code></pre>');
    expect(md).toContain('```ts');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('```');
  });

  it('renders inline code', () => {
    const md = renderFromHtml('<p>Use <code>npm install</code> first.</p>');
    expect(md).toContain('Use `npm install` first.');
  });

  it('renders links and images', () => {
    const md = renderFromHtml(
      '<p><a href="https://x.com">x</a> and <img src="a.png" alt="pic"></p>',
    );
    expect(md).toContain('[x](https://x.com)');
    expect(md).toContain('![pic](a.png)');
  });

  it('renders blockquotes with multi-line content', () => {
    const md = renderFromHtml('<blockquote><p>line 1</p><p>line 2</p></blockquote>');
    expect(md).toContain('> line 1');
    expect(md).toContain('> line 2');
  });

  it('returns whitespace-only output for empty root', () => {
    const md = renderFromHtml('');
    expect(md.trim()).toBe('');
  });

  it('collapses excess blank lines', () => {
    const md = renderFromHtml('<p>a</p><p></p><p></p><p>b</p>');
    expect(md.split('\n\n\n').length).toBe(1);
  });
});
