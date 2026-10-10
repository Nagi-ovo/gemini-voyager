import { type VirtualElement, autoUpdate, computePosition, flip, shift } from '@floating-ui/dom';

const VIEWPORT_PADDING = 8;

type MenuAnchor = { x: number; y: number; anchor?: { width: number; height: number } };

/**
 * Keeps a `position: fixed` menu inside the viewport: below its anchor and
 * aligned to its start edge (mirrored in RTL), flipped above when there is no
 * room below, and shifted off the edges. It follows window resizes and
 * scrolls until the returned stop runs. A menu without layout (hidden, or
 * jsdom) stays where its style puts it.
 */
export function positionMenu(menu: HTMLElement, at: MenuAnchor): () => void {
  if (!menu.offsetWidth || !menu.offsetHeight) return () => {};
  const width = at.anchor?.width ?? 0;
  const height = at.anchor?.height ?? 0;
  // The anchor as it was when the menu opened: a pointer, or the button's box
  // whose bottom-start corner is `x`, `y`.
  const reference: VirtualElement = {
    getBoundingClientRect: () => DOMRect.fromRect({ x: at.x, y: at.y - height, width, height }),
  };
  let live = true;
  const update = () => {
    void computePosition(reference, menu, {
      strategy: 'fixed',
      placement: 'bottom-start',
      middleware: [flip({ padding: VIEWPORT_PADDING }), shift({ padding: VIEWPORT_PADDING })],
    }).then(({ x, y }) => {
      // A position computed for a menu that has since closed must not land.
      if (!live) return;
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    });
  };
  const stop = autoUpdate(reference, menu, update);
  return () => {
    live = false;
    stop();
  };
}
