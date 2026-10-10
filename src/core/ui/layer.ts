/**
 * Body-level Voyager layers: one module owns their stacking and dismissal.
 *
 * Every layer is a shadow host on `document.body` carrying `data-gv-layer`, so a
 * page surface can tell a press on Voyager's own confirm or toast from a press
 * outside it without knowing any class name. Popovers sit on a stack and only
 * the top one takes Escape, Tab and outside presses; each follows its anchor and
 * closes once the anchor leaves the page or the viewport. Toast hosts are marked
 * but never stacked: they take no Escape, outside press or focus.
 */
import { SHADOW_RTL_ATTR, attachShadowSurface } from '@/pages/content/folder/shadowHost';

import tokensCss from './tokens.css?raw';

export const LAYER_ATTR = 'data-gv-layer';
export type LayerKind = 'popover' | 'toast';

/**
 * Did this event pass through any Voyager layer, toasts included? Read it during
 * dispatch: the composed path is empty afterwards. An outside-press handler that
 * closes a panel or a selection checks this first, so answering the panel's own
 * confirm, or pressing its toast, does not close it.
 */
export function isVoyagerLayerEvent(event: Event): boolean {
  return event
    .composedPath()
    .some((node) => node instanceof Element && node.hasAttribute(LAYER_ATTR));
}

export type LayerHost = {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  /** Remove the host and stop mirroring the page. Idempotent. */
  remove: () => void;
};

/** Mount a shadow host for a layer of `kind`, styled by the shared tokens and `css`. */
export function mountLayerHost(kind: LayerKind, css: string): LayerHost {
  const host = document.createElement('div');
  host.setAttribute(LAYER_ATTR, kind);
  const surface = attachShadowSurface(host, `${tokensCss}\n${css}`);
  document.body.appendChild(host);
  let removed = false;
  return {
    host,
    root: surface.root,
    remove: () => {
      if (removed) return;
      removed = true;
      surface.disconnect();
      host.remove();
    },
  };
}

/** Where an anchored popover opens; `beside` means the anchor's inline-end side. */
export type PopoverSide = 'below' | 'above' | 'beside';
/** Which inline edge of the anchor a `below`/`above` popover lines up with. */
export type PopoverAlign = 'start' | 'end';

export type PopoverOptions = {
  /** Omitted when no control asked: the popover then sits centred in the viewport. */
  anchor?: HTMLElement;
  side: PopoverSide;
  /** Default `start`; `beside` ignores it. */
  align?: PopoverAlign;
  css: string;
  /** The owner's lifetime; aborting dismisses the popover. */
  signal?: AbortSignal;
  /**
   * A press on the anchor is not an outside press: the anchor's own click
   * closes the popover, as a menu button does, instead of closing and reopening it.
   */
  anchorToggles?: boolean;
  /**
   * The stack closed the popover: Escape, an outside press, abort, or its anchor
   * leaving the page or the viewport.
   */
  onDismiss: () => void;
};

export type Popover = {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  /** Close without calling onDismiss. Idempotent. */
  close: () => void;
};

type Entry = {
  layer: LayerHost;
  anchor: HTMLElement | null;
  anchorToggles: boolean;
  place: () => void;
  close: () => void;
  dismiss: () => void;
};

const stack: Entry[] = [];
let detachWatcher: MutationObserver | null = null;

const GAP = 8;
const VIEWPORT_PAD = 8;

const topEntry = (): Entry | undefined => stack[stack.length - 1];

function focusableIn(root: ShadowRoot): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled])'),
  );
}

function onPointerDown(event: Event): void {
  const top = topEntry();
  if (!top) return;
  const path = event.composedPath();
  if (path.includes(top.layer.host)) return;
  if (top.anchorToggles && top.anchor && path.includes(top.anchor)) return;
  top.dismiss();
}

function onKeyDown(event: KeyboardEvent): void {
  const top = topEntry();
  if (!top) return;
  if (event.key === 'Escape') {
    // Capture phase on window: answering the popover must not also close the
    // panel or dialog behind it.
    event.preventDefault();
    event.stopPropagation();
    top.dismiss();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = focusableIn(top.layer.root);
  if (focusable.length === 0) return;
  const active = top.layer.root.activeElement;
  const index = active instanceof HTMLElement ? focusable.indexOf(active) : -1;
  const next = event.shiftKey
    ? index <= 0
      ? focusable.length - 1
      : index - 1
    : index === focusable.length - 1
      ? 0
      : index + 1;
  event.preventDefault();
  focusable[next].focus({ preventScroll: true });
}

function viewportSize(): { width: number; height: number } {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight,
  };
}

/** Re-place the popover beside its anchor, or dismiss it once the anchor is out of sight. */
function follow(entry: Entry): void {
  if (!entry.anchor) {
    entry.place();
    return;
  }
  const rect = entry.anchor.getBoundingClientRect();
  const view = viewportSize();
  const visible =
    entry.anchor.isConnected &&
    (rect.width > 0 || rect.height > 0) &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < view.height &&
    rect.left < view.width;
  if (visible) entry.place();
  else entry.dismiss();
}

function onScroll(event: Event): void {
  const target = event.target;
  // Gemini auto-scrolls the chat while a reply streams, so a scroll that moves
  // the anchor must not close its confirm while the anchor is still in view.
  for (const entry of [...stack].reverse()) {
    if (target instanceof Document || (target instanceof Node && target.contains(entry.anchor))) {
      follow(entry);
    }
  }
}

function onResize(): void {
  for (const entry of [...stack].reverse()) follow(entry);
}

// Keyboard navigation swaps the conversation without a press or a scroll; a
// confirm whose anchor left the page would otherwise answer for the wrong one.
function onMutations(): void {
  for (const entry of [...stack].reverse()) {
    if (entry.anchor && !entry.anchor.isConnected) entry.dismiss();
  }
}

function listen(on: boolean): void {
  const method = on ? 'addEventListener' : 'removeEventListener';
  window[method]('pointerdown', onPointerDown, true);
  window[method]('keydown', onKeyDown as EventListener, true);
  window[method]('scroll', onScroll, true);
  window[method]('resize', onResize);
  detachWatcher?.disconnect();
  detachWatcher = null;
  if (on) {
    detachWatcher = new MutationObserver(onMutations);
    detachWatcher.observe(document.documentElement, { childList: true, subtree: true });
  }
}

/** Viewport coordinates for a box of `size` next to `anchor`, clamped on both axes. */
function placeNear(
  anchor: DOMRect,
  size: { width: number; height: number },
  side: PopoverSide,
  align: PopoverAlign,
  rtl: boolean,
): { left: number; top: number } {
  const { width: viewWidth, height: viewHeight } = viewportSize();
  let left: number;
  let top: number;

  if (side === 'beside') {
    const after = rtl ? anchor.left - GAP - size.width : anchor.right + GAP;
    const before = rtl ? anchor.right + GAP : anchor.left - GAP - size.width;
    const fitsAfter = rtl ? after >= VIEWPORT_PAD : after + size.width <= viewWidth - VIEWPORT_PAD;
    left = fitsAfter ? after : before;
    top = anchor.top + anchor.height / 2 - size.height / 2;
  } else {
    const alignRight = (align === 'end') !== rtl;
    left = alignRight ? anchor.right - size.width : anchor.left;
    const below = anchor.bottom + GAP;
    const above = anchor.top - GAP - size.height;
    const fitsBelow = below + size.height <= viewHeight - VIEWPORT_PAD;
    const fitsAbove = above >= VIEWPORT_PAD;
    top = side === 'below' ? (fitsBelow || !fitsAbove ? below : above) : fitsAbove ? above : below;
  }

  const maxLeft = Math.max(VIEWPORT_PAD, viewWidth - size.width - VIEWPORT_PAD);
  const maxTop = Math.max(VIEWPORT_PAD, viewHeight - size.height - VIEWPORT_PAD);
  return {
    left: Math.round(Math.min(Math.max(left, VIEWPORT_PAD), maxLeft)),
    top: Math.round(Math.min(Math.max(top, VIEWPORT_PAD), maxTop)),
  };
}

function placeCentred(size: { width: number; height: number }): { left: number; top: number } {
  const { width: viewWidth, height: viewHeight } = viewportSize();
  return {
    left: Math.round(Math.max(VIEWPORT_PAD, (viewWidth - size.width) / 2)),
    top: Math.round(Math.max(VIEWPORT_PAD, (viewHeight - size.height) / 2)),
  };
}

/**
 * Open a popover next to `anchor` and push it on the stack. The caller renders
 * into `root`, then calls the returned `place()` once the content is in.
 */
export function openPopover(options: PopoverOptions): Popover & { place: () => void } {
  // Without an anchor, focus goes back where it was: a centred popover must not strand it on body.
  const opener = document.activeElement;
  const returnFocus =
    options.anchor ?? (opener instanceof HTMLElement && opener !== document.body ? opener : null);
  const layer = mountLayerHost('popover', options.css);

  const close = (): void => {
    const index = stack.indexOf(entry);
    if (index === -1) return;
    stack.splice(index, 1);
    if (stack.length === 0) listen(false);
    options.signal?.removeEventListener('abort', dismiss);
    const active = document.activeElement;
    const heldFocus = active === layer.host || active === document.body || active === null;
    layer.remove();
    if (heldFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  };

  const dismiss = (): void => {
    if (!stack.includes(entry)) return;
    close();
    options.onDismiss();
  };

  const place = (): void => {
    const rect = layer.host.getBoundingClientRect();
    const size = { width: rect.width, height: rect.height };
    const { left, top } = options.anchor
      ? placeNear(
          options.anchor.getBoundingClientRect(),
          size,
          options.side,
          options.align ?? 'start',
          layer.host.hasAttribute(SHADOW_RTL_ATTR),
        )
      : placeCentred(size);
    layer.host.style.left = `${left}px`;
    layer.host.style.top = `${top}px`;
  };

  const entry: Entry = {
    layer,
    anchor: options.anchor ?? null,
    anchorToggles: options.anchorToggles === true,
    place,
    close,
    dismiss,
  };
  if (stack.length === 0) listen(true);
  stack.push(entry);
  options.signal?.addEventListener('abort', dismiss, { once: true });

  return { host: layer.host, root: layer.root, close, place };
}
