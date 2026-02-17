/**
 * Selection/Cursor Helpers
 *
 * Provides utilities to get/set cursor position based on pure text offset via TreeWalker.
 * This is robust against DOM re-renders as long as the text content remains consistent.
 */

/**
 * Get the current cursor position as a global text offset relative to the root element.
 */
export function getTextOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);

  // Create a range that spans from the start of the root to the cursor
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(root);
  preCaretRange.setEnd(range.endContainer, range.endOffset);

  // The length of the string in that range is our offset
  return preCaretRange.toString().length;
}

/**
 * Restore the cursor to a specific global text offset.
 */
export function setCaretPosition(root: HTMLElement, targetOffset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let currentOffset = 0;
  let found = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length || 0;

    if (currentOffset + length >= targetOffset) {
      // The target is inside this node
      const range = document.createRange();
      const relativeOffset = targetOffset - currentOffset;

      range.setStart(node, relativeOffset);
      range.collapse(true);

      selection.removeAllRanges();
      selection.addRange(range);
      found = true;
      break;
    }

    currentOffset += length;
  }

  // Fallback: If targetOffset is beyond content length, set to end
  if (!found) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
