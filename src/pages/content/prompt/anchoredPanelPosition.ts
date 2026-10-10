const VIEWPORT_PAD = 8;
const TRIGGER_GAP = 10;
/** Used only before the panel has been laid out and measures as zero. */
const FALLBACK_WIDTH = 320;
const FALLBACK_HEIGHT = 360;

/**
 * Where the unlocked Prompt Manager panel opens: above its trigger, right
 * edges aligned, and inside the viewport.
 *
 * The width is the panel's measured one. A capped estimate under the CSS
 * width (380 against 440) let the panel overrun the right edge by the
 * difference when the trigger sat in the corner.
 */
export function computeAnchoredPosition(
  trigger: HTMLElement,
  panel: HTMLElement,
): { top: number; left: number } {
  const anchor = trigger.getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  const width = box.width || FALLBACK_WIDTH;
  const height = box.height || FALLBACK_HEIGHT;
  const maxLeft = window.innerWidth - width - VIEWPORT_PAD;
  const left = Math.max(VIEWPORT_PAD, Math.min(maxLeft, anchor.right - width));
  const top = Math.max(VIEWPORT_PAD, anchor.top - height - TRIGGER_GAP);
  // Round down so a fractional width cannot push the right edge past the pad.
  return { top, left: Math.floor(left) };
}
