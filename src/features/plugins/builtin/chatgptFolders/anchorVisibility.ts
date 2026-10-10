/**
 * Whether an element is actually on screen, for a guide that must point at it.
 * Being connected is not enough: ChatGPT's sidebar scrolls and collapses, and an
 * element can sit outside its scroll viewport or the window, or be hidden.
 */

/** Sub-pixel layout rounding is not offscreen. */
const TOLERANCE_PX = 1;

const CLIPPING = new Set(['hidden', 'scroll', 'auto', 'clip']);

interface Box {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** The parent, crossing out of a shadow root to its host. */
function parentOf(node: Element): Element | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function insideX(inner: Box, outer: Box): boolean {
  return inner.left >= outer.left - TOLERANCE_PX && inner.right <= outer.right + TOLERANCE_PX;
}

function insideY(inner: Box, outer: Box): boolean {
  return inner.top >= outer.top - TOLERANCE_PX && inner.bottom <= outer.bottom + TOLERANCE_PX;
}

/**
 * True when `element` is laid out, not hidden, and wholly inside the window and
 * every ancestor that clips its overflow (such as the sidebar's scroll area).
 * Reads layout only.
 */
export function isOnScreen(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.isConnected) return false;
  // Opacity is left out: a sidebar fading in would fail the check with no later
  // event to re-check it.
  if (
    typeof element.checkVisibility === 'function' &&
    !element.checkVisibility({ visibilityProperty: true })
  ) {
    return false;
  }
  if (view.getComputedStyle(element).visibility === 'hidden') return false;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const windowBox: Box = { top: 0, left: 0, right: view.innerWidth, bottom: view.innerHeight };
  if (!insideX(rect, windowBox) || !insideY(rect, windowBox)) return false;

  for (let node = parentOf(element); node; node = parentOf(node)) {
    const style = view.getComputedStyle(node);
    if (style.display === 'none') return false;
    const clipsX = CLIPPING.has(style.overflowX);
    const clipsY = CLIPPING.has(style.overflowY);
    if (!clipsX && !clipsY) continue;
    const box = node.getBoundingClientRect();
    if ((clipsX && !insideX(rect, box)) || (clipsY && !insideY(rect, box))) return false;
  }
  return true;
}
