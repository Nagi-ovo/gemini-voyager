import { attachShadowSurface } from '../shadowHost';
import { FLOATING_PANEL_CLASS } from './shared';

export const POPOVER_LAYER_HOST_CLASS = 'gv-folder-tree-popover-layer';

/**
 * Comes after the tree's stylesheet, whose `:host` rules paint a panel card.
 * The host is a 0×0 fixed box at the viewport origin that takes no clicks. It
 * must not become a containing block (transform, filter, contain…), or the
 * fixed menu inside would be placed and clipped by it again.
 */
export const POPOVER_LAYER_HOST_CSS = `
:host,
:host([data-gv-scheme]) {
  position: fixed !important;
  inset: 0 auto auto 0 !important;
  z-index: 2147483647 !important;
  display: block !important;
  width: 0 !important;
  height: 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  resize: none !important;
  overflow: visible !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  transform: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  perspective: none !important;
  contain: none !important;
  will-change: auto !important;
  pointer-events: none !important;
}

.${FLOATING_PANEL_CLASS}__context-menu {
  pointer-events: auto;
}
`;

export type PopoverLayer = {
  /** The body-level host; events that pass through it are inside the layer. */
  host: HTMLElement;
  /** Where popovers render, inside the host's shadow root. */
  container: HTMLElement;
  destroy: () => void;
};

/**
 * A shadow surface on `document.body` for the tree's popovers, styled by the
 * tree's `css` and mirroring the page scheme and direction like the tree's own
 * host. A tree inside a transformed or scrolling container would otherwise
 * place and clip its fixed menu by that container.
 */
export function mountPopoverLayer(css: string): PopoverLayer {
  const host = document.createElement('div');
  host.className = POPOVER_LAYER_HOST_CLASS;
  const surface = attachShadowSurface(host, `${css}\n${POPOVER_LAYER_HOST_CSS}`);
  const container = document.createElement('div');
  surface.root.appendChild(container);
  document.body.appendChild(host);
  return {
    host,
    container,
    destroy: () => {
      surface.disconnect();
      host.remove();
    },
  };
}
