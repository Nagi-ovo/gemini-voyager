import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixBrokenBoldTags } from '../index';

describe('fixBrokenBoldTags', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('fix intra-node bolding', () => {
    container.innerHTML = 'Normal text **bold text** normal text.';
    fixBrokenBoldTags(container);
    expect(container.innerHTML).toBe('Normal text <strong>bold text</strong> normal text.');
  });

  it('fix multiple intra-node bolds', () => {
    container.innerHTML = '**One** and **Two**';
    fixBrokenBoldTags(container);
    expect(container.innerHTML).toBe('<strong>One</strong> and <strong>Two</strong>');
  });

  it('handles split-node bolding (interrupted by element)', () => {
    // Setup: Text node "Prefix **" -> Element -> Text node "** Suffix"
    const text1 = document.createTextNode('Prefix **');
    const elem = document.createElement('span');
    elem.setAttribute('data-path-to-node', '1,2,3');
    elem.textContent = 'INTERRUPT';
    const text2 = document.createTextNode('** Suffix');

    container.appendChild(text1);
    container.appendChild(elem);
    container.appendChild(text2);

    fixBrokenBoldTags(container);

    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    // The strong tag should wrap the content
    expect(strong?.textContent).toBe('INTERRUPT');
    // Original text nodes should be cleaned up
    expect(text1.textContent).toBe('Prefix ');
    expect(text2.textContent).toBe(' Suffix');
  });

  it('handles mixed intra-node and split-node', () => {
    // Setup: "**Intra** and **Split" -> Elem -> "** End"
    const text1 = document.createTextNode('**Intra** and **Split');
    const elem = document.createElement('span');
    elem.setAttribute('data-path-to-node', 'x');
    elem.textContent = 'ELEM';
    const text2 = document.createTextNode('** End');

    container.appendChild(text1);
    container.appendChild(elem);
    container.appendChild(text2);

    fixBrokenBoldTags(container);

    // Initial check: Intra matches
    // Expect: one strong for Intra, one strong for Split
    const strongs = container.querySelectorAll('strong');
    expect(strongs.length).toBe(2);
    expect(strongs[0].textContent).toBe('Intra');
    expect(strongs[1].textContent).toBe('SplitELEM');

    // Check surrounding text
    // The first text node originally " **Intra** and **Split"
    // Becomes: " " (before Intra, empty?) -> strong(Intra) -> " and " -> strong(Split...)
    // Actually the function replaces the text node.
    // The DOM structure should be:
    // strong(Intra) " and " strong(SplitELEM) " End"
    // Note: My split logic keeps " End" in the trailing text node.

    // Wait, let's verify exact text structure
    expect(container.textContent).toBe('Intra and SplitELEM End');
  });

  // ===== Issue #507: Consecutive bold groups across split nodes =====

  describe('consecutive split-node bolds (#507)', () => {
    it('two split-node bolds with short connector: **A** elem "**和**" elem **B**', () => {
      // DOM: TextNode("**") Elem(A) TextNode("**和**") Elem(B) TextNode("**")
      // Expected: <strong>A</strong>和<strong>B</strong>
      const t1 = document.createTextNode('研究**');
      const e1 = document.createElement('b');
      e1.setAttribute('data-path-to-node', '0,1');
      e1.textContent = 'Centralized ETC';
      const t2 = document.createTextNode('**和**');
      const e2 = document.createElement('b');
      e2.setAttribute('data-path-to-node', '0,2');
      e2.textContent = 'Centralized UCB';
      const t3 = document.createTextNode('**时');

      container.append(t1, e1, t2, e2, t3);
      fixBrokenBoldTags(container);

      const strongs = container.querySelectorAll('strong');
      expect(strongs.length).toBe(2);
      expect(strongs[0].textContent).toBe('Centralized ETC');
      expect(strongs[1].textContent).toBe('Centralized UCB');
      expect(container.textContent).toBe('研究Centralized ETC和Centralized UCB时');
    });

    it('two split-node bolds with multi-char connector', () => {
      // DOM: TextNode("前缀**") Elem(A) TextNode("**，同时**") Elem(B) TextNode("**后缀")
      const t1 = document.createTextNode('前缀**');
      const e1 = document.createElement('b');
      e1.setAttribute('data-path-to-node', '0,1');
      e1.textContent = 'AlphaContent';
      const t2 = document.createTextNode('**，同时**');
      const e2 = document.createElement('b');
      e2.setAttribute('data-path-to-node', '0,2');
      e2.textContent = 'BetaContent';
      const t3 = document.createTextNode('**后缀');

      container.append(t1, e1, t2, e2, t3);
      fixBrokenBoldTags(container);

      const strongs = container.querySelectorAll('strong');
      expect(strongs.length).toBe(2);
      expect(strongs[0].textContent).toBe('AlphaContent');
      expect(strongs[1].textContent).toBe('BetaContent');
      expect(container.textContent).toBe('前缀AlphaContent，同时BetaContent后缀');
    });

    it('three consecutive split-node bolds', () => {
      // **A**、**B**和**C**
      const t1 = document.createTextNode('**');
      const e1 = document.createElement('b');
      e1.setAttribute('data-path-to-node', '0,1');
      e1.textContent = 'AAA';
      const t2 = document.createTextNode('**、**');
      const e2 = document.createElement('b');
      e2.setAttribute('data-path-to-node', '0,2');
      e2.textContent = 'BBB';
      const t3 = document.createTextNode('**和**');
      const e3 = document.createElement('b');
      e3.setAttribute('data-path-to-node', '0,3');
      e3.textContent = 'CCC';
      const t4 = document.createTextNode('**');

      container.append(t1, e1, t2, e2, t3, e3, t4);
      fixBrokenBoldTags(container);

      const strongs = container.querySelectorAll('strong');
      expect(strongs.length).toBe(3);
      expect(strongs[0].textContent).toBe('AAA');
      expect(strongs[1].textContent).toBe('BBB');
      expect(strongs[2].textContent).toBe('CCC');
      expect(container.textContent).toBe('AAA、BBB和CCC');
    });

    it('split-node bold with multiple intermediate elements', () => {
      // TextNode("**") Elem1 Elem2 TextNode("**")
      // Two data-path-to-node elements between the ** markers
      const t1 = document.createTextNode('start **');
      const e1 = document.createElement('b');
      e1.setAttribute('data-path-to-node', '0,1');
      e1.textContent = 'part1';
      const e2 = document.createElement('b');
      e2.setAttribute('data-path-to-node', '0,2');
      e2.textContent = 'part2';
      const t2 = document.createTextNode('** end');

      container.append(t1, e1, e2, t2);
      fixBrokenBoldTags(container);

      const strong = container.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('part1part2');
      expect(container.textContent).toBe('start part1part2 end');
    });

    it('split-node bold with text node between elements', () => {
      // TextNode("**") Elem TextNode("middle") Elem TextNode("**")
      const t1 = document.createTextNode('**');
      const e1 = document.createElement('b');
      e1.setAttribute('data-path-to-node', '0,1');
      e1.textContent = 'E1';
      const tMid = document.createTextNode(' middle ');
      const e2 = document.createElement('b');
      e2.setAttribute('data-path-to-node', '0,2');
      e2.textContent = 'E2';
      const t2 = document.createTextNode('**');

      container.append(t1, e1, tMid, e2, t2);
      fixBrokenBoldTags(container);

      const strong = container.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('E1 middle E2');
      expect(container.textContent).toBe('E1 middle E2');
    });

    it('exact issue #507 scenario: long content with injected nodes', () => {
      // Simulates: 研究**中心化探索与利用算法（Centralized ETC）**和**中心化置信上限算法（Centralized UCB）**时
      // DOM split by Gemini into:
      //   TextNode("研究**")
      //   <b data-path-to-node>中心化探索与利用算法（Centralized ETC）</b>
      //   TextNode("**和**")
      //   <b data-path-to-node>中心化置信上限算法（Centralized UCB）</b>
      //   TextNode("**时")
      const t1 = document.createTextNode('研究**');
      const e1 = document.createElement('b');
      e1.setAttribute('data-path-to-node', '0,0,1');
      e1.textContent = '中心化探索与利用算法（Centralized ETC）';
      const t2 = document.createTextNode('**和**');
      const e2 = document.createElement('b');
      e2.setAttribute('data-path-to-node', '0,0,2');
      e2.textContent = '中心化置信上限算法（Centralized UCB）';
      const t3 = document.createTextNode('**时');

      container.append(t1, e1, t2, e2, t3);
      fixBrokenBoldTags(container);

      const strongs = container.querySelectorAll('strong');
      expect(strongs.length).toBe(2);
      expect(strongs[0].textContent).toContain('Centralized ETC');
      expect(strongs[1].textContent).toContain('Centralized UCB');
      // No ** markers should remain visible
      expect(container.textContent).not.toContain('**');
      expect(container.textContent).toBe(
        '研究中心化探索与利用算法（Centralized ETC）和中心化置信上限算法（Centralized UCB）时',
      );
    });
  });
});
