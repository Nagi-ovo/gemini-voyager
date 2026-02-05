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
});
