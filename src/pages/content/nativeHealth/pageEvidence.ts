/**
 * Evidence that the page should contain a feature's anchor, gathered without the anchor's own
 * selectors. When Gemini renames its turn elements every turn-based owner misses at once, so
 * "the owner found zero turns" cannot also serve as proof that turns exist. These checks read
 * only the route and the amount of rendered text, and they run once, at verdict time.
 */

/** Rendered non-whitespace characters a loaded conversation shows beyond Gemini's own chrome. */
export const MIN_CONVERSATION_TEXT_CHARS = 200;

/**
 * Controls, the composer and Voyager's own UI do not count as conversation content. A loading or
 * failed conversation route still shows buttons, a model picker and a disclaimer.
 */
const NON_CONTENT_SELECTOR = [
  'button',
  '[role="button"]',
  '[contenteditable]',
  'textarea',
  'input',
  'select',
  'script',
  'style',
  'noscript',
  '[class*="gv-"]',
  '.gemini-timeline-bar',
].join(',');

/**
 * True when Gemini's main region shows substantial text, as a loaded conversation does. Without
 * a main region the answer is false: an unknown layout is no proof that turns should exist.
 */
export function hasRenderedConversationContent(doc: Document = document): boolean {
  const main = doc.querySelector('main') ?? doc.querySelector('[role="main"]');
  if (!main) return false;
  const walker = doc.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  let count = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest(NON_CONTENT_SELECTOR)) continue;
    count += (node.textContent ?? '').replace(/\s+/g, '').length;
    if (count >= MIN_CONVERSATION_TEXT_CHARS) return true;
  }
  return false;
}
