import { afterEach, describe, expect, it } from 'vitest';

import { SKELETON_LIMITS, ancestorChain, buildSkeleton, describeElement } from './skeleton';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe('site check skeleton', () => {
  it('keeps structure and drops text nodes and every text-bearing attribute', () => {
    const root = mount(
      `<article class="turn group/turn" role="article" data-message-author-role="assistant"
          aria-label="Secret label" title="Secret title" data-title="Secret data title"
          data-message-id="m-7f3a9c" data-state="open" aria-expanded="true">
        Secret text node
        <a href="https://secret.example/path" class="link">Secret link text</a>
        <img src="https://secret.example/a.png" alt="Secret alt" class="avatar">
        <input value="Secret value" placeholder="Secret placeholder" class="field">
        <p style="color: red" data-testid="markdown">Secret paragraph</p>
      </article>`,
    );
    const { lines } = buildSkeleton(root);
    const text = lines.join('\n');
    expect(lines).toEqual([
      'article.turn.group/turn[role=article][data-message-author-role=assistant][data-title][data-message-id][data-state=open][aria-expanded=true]',
      '  a.link',
      '  img.avatar',
      '  input.field',
      '  p[data-testid=markdown]',
    ]);
    expect(text).not.toMatch(/secret/i);
  });

  it('withholds a data value that could be an id or free text, keeping the attribute name', () => {
    const root = mount(
      '<div data-row-key="chat:abc123" data-kind="Two words" data-count="12" data-test-id="chat-history"></div>',
    );
    expect(describeElement(root)).toBe(
      'div[data-row-key][data-kind][data-count][data-test-id=chat-history]',
    );
  });

  it('does not export a code block language class or a short data value taken from content', () => {
    const root = mount(
      `<pre class="code-block language-alice@example.com lang-Alice x-7f3a9c0d1e"
          data-owner="Alice" data-language="python" data-kind="secretword"
          data-empty-paragraph="true" data-collapsed="false" data-message-author-role="user"
          aria-haspopup="Alice"><code class="language-secretword hljs"></code></pre>`,
    );
    const text = buildSkeleton(root).lines.join('\n');
    expect(text).toBe(
      'pre.code-block[data-owner][data-language][data-kind][data-empty-paragraph=true][data-collapsed=false][data-message-author-role=user]\n' +
        '  code.hljs',
    );
    expect(text).not.toMatch(/alice|python|secretword|7f3a9c/i);
  });

  it('caps depth, children per element and the whole size, and says it truncated', () => {
    const deep = mount(
      '<div><div><div><div><div><div><span></span></div></div></div></div></div></div>',
    );
    const deepSkeleton = buildSkeleton(deep);
    expect(deepSkeleton.lines.at(-1)).toBe(`${'  '.repeat(SKELETON_LIMITS.depth + 1)}… 1 more`);
    expect(deepSkeleton.truncated).toBe(true);

    const wide = mount(`<ul>${'<li></li>'.repeat(SKELETON_LIMITS.children + 3)}</ul>`);
    const wideSkeleton = buildSkeleton(wide);
    expect(wideSkeleton.lines.filter((line) => line.trim() === 'li')).toHaveLength(
      SKELETON_LIMITS.children,
    );
    expect(wideSkeleton.lines.at(-1)).toBe('  … 3 more');

    const big = mount(`<div>${'<section><p></p><p></p><p></p></section>'.repeat(8)}</div>`);
    expect(buildSkeleton(big).lines.length).toBeLessThanOrEqual(SKELETON_LIMITS.nodes + 8);
  });

  it('does not descend into SVG or leave Voyager’s own layers in the structure', () => {
    const root = mount(
      '<div><svg class="icon"><text>Secret svg text</text><path d="M0 0"></path></svg><div data-gv-layer="popover"></div></div>',
    );
    expect(buildSkeleton(root).lines).toEqual(['div', '  svg.icon']);
  });

  it('lists the ancestors outermost first, stopping below body', () => {
    mount('<main class="app"><section><p id="leaf"></p></section></main>');
    const chain = ancestorChain(document.getElementById('leaf')!);
    expect(chain.map(describeElement)).toEqual(['main.app', 'section', 'p']);
  });
});
