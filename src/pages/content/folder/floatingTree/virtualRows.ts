import {
  type Range,
  Virtualizer,
  defaultRangeExtractor,
  elementScroll,
  measureElement,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  windowScroll,
} from '@tanstack/virtual-core';

/** Trees up to this many rows render every row; longer ones render what is in view. */
export const VIRTUALIZE_AFTER_ROWS = 150;
/** Rows a tree renders while its scroller has no size: hidden, or not attached yet. */
const UNMEASURED_ROWS = 40;
const OVERSCAN = 8;

type Scroller = Element | Window;

/** A rendered row, by index, with its offset from the top of the list. */
export type RowSlot = { index: number; top: number; size: number };

export type RowWindow = {
  slots: RowSlot[];
  /** The height of every row together; spacers fill what is not rendered. */
  total: number;
  /** Slots carry real offsets; false while nothing could be measured. */
  measured: boolean;
};

const SCROLLABLE = /(auto|scroll|overlay)/;

/**
 * The element that scrolls the list: the nearest ancestor that scrolls
 * vertically, through shadow hosts, so a tree mounted inline in a page's
 * sidebar scrolls with that sidebar. The window when nothing else scrolls.
 */
export function findScroller(list: Element): Scroller {
  let node: Node | null = list.parentNode;
  while (node) {
    if (node instanceof ShadowRoot) {
      node = node.host;
      continue;
    }
    if (!(node instanceof Element)) break;
    if (node === document.documentElement || node === document.body) break;
    if (SCROLLABLE.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentNode;
  }
  return window;
}

/** Where the list starts inside its scroller's content, so ranges line up with scroll offsets. */
function listOffset(list: Element, scroller: Scroller): number {
  const top = list.getBoundingClientRect().top;
  if (scroller instanceof Window) return top + scroller.scrollY;
  return top - scroller.getBoundingClientRect().top - scroller.clientTop + scroller.scrollTop;
}

export type RowVirtualizer = {
  /** Sets what the next window reads; call during render. */
  configure: (options: {
    count: number;
    estimateSize: (index: number) => number;
    rowKey: (index: number) => string;
    /** Rows that stay rendered out of view: the focused row and any open name field. */
    pinned: readonly number[];
  }) => void;
  window: () => RowWindow;
  /** After a render: finds the scroller and the list's offset in it; re-renders if either moved. */
  attach: (list: HTMLElement | null) => void;
  /** Ref for each rendered row, which carries `data-index`. */
  measure: (element: Element | null) => void;
  destroy: () => void;
};

/**
 * Windowing over the scroller that already scrolls the tree (the panel body,
 * or the page sidebar for inline trees): no second scrollbar. Rows stay in
 * normal flow between spacers, so margins and the stylesheet still apply.
 */
export function createRowVirtualizer(onChange: () => void): RowVirtualizer {
  let scroller: Scroller | null = null;
  let scrollMargin = 0;
  let count = 0;
  let pinned: readonly number[] = [];
  let destroyed = false;
  let observer: ResizeObserver | null = null;
  let observedList: HTMLElement | null = null;

  const rangeExtractor = (range: Range): number[] => {
    const indexes = defaultRangeExtractor(range);
    if (!pinned.length) return indexes;
    return [...new Set([...indexes, ...pinned])]
      .filter((index) => index >= 0 && index < range.count)
      .sort((a, b) => a - b);
  };

  const virtualizer = new Virtualizer<Scroller, Element>({
    count: 0,
    getScrollElement: () => scroller,
    estimateSize: () => 32,
    scrollToFn: (offset, options, instance) =>
      instance.scrollElement instanceof Window
        ? windowScroll(offset, options, instance as Virtualizer<Window, Element>)
        : elementScroll(offset, options, instance as Virtualizer<Element, Element>),
    observeElementRect: (instance, cb) =>
      instance.scrollElement instanceof Window
        ? observeWindowRect(instance as Virtualizer<Window, Element>, cb)
        : observeElementRect(instance as Virtualizer<Element, Element>, cb),
    observeElementOffset: (instance, cb) =>
      instance.scrollElement instanceof Window
        ? observeWindowOffset(instance as Virtualizer<Window, Element>, cb)
        : observeElementOffset(instance as Virtualizer<Element, Element>, cb),
  });
  const unmount = virtualizer._didMount();
  let options = virtualizer.options;

  const setOptions = (next: Partial<typeof options>) => {
    options = { ...options, ...next };
    virtualizer.setOptions(options);
  };

  return {
    configure: ({ count: nextCount, estimateSize, rowKey, pinned: nextPinned }) => {
      count = nextCount;
      pinned = nextPinned;
      setOptions({
        count,
        estimateSize,
        getItemKey: rowKey,
        rangeExtractor,
        overscan: OVERSCAN,
        scrollMargin,
        // A row without layout (jsdom, a hidden panel) keeps its estimate.
        measureElement: (element, entry, instance) => {
          const size = measureElement(element, entry, instance);
          return size > 0 ? size : estimateSize(instance.indexFromElement(element));
        },
        onChange: () => {
          if (!destroyed) onChange();
        },
      });
    },

    window: () => {
      const items = virtualizer.getVirtualItems();
      if (items.length || !count) {
        return {
          slots: items.map((item) => ({
            index: item.index,
            top: item.start - scrollMargin,
            size: item.size,
          })),
          total: virtualizer.getTotalSize(),
          measured: true,
        };
      }
      const indexes = new Set<number>();
      for (let index = 0; index < Math.min(count, UNMEASURED_ROWS); index++) indexes.add(index);
      for (const index of pinned) if (index < count) indexes.add(index);
      return {
        slots: [...indexes].sort((a, b) => a - b).map((index) => ({ index, top: 0, size: 0 })),
        total: 0,
        measured: false,
      };
    },

    attach: (list) => {
      if (destroyed) return;
      if (list !== observedList) {
        observer?.disconnect();
        observer = null;
        observedList = list;
        // Attaching, showing or resizing the tree changes its scroller or offset.
        if (list && typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(() => {
            if (!destroyed) onChange();
          });
          observer.observe(list);
        }
      }
      const nextScroller = list?.isConnected ? findScroller(list) : null;
      const nextMargin = list && nextScroller ? Math.round(listOffset(list, nextScroller)) : 0;
      const moved = nextScroller !== scroller || nextMargin !== scrollMargin;
      scroller = nextScroller;
      scrollMargin = nextMargin;
      if (moved) setOptions({ scrollMargin });
      virtualizer._willUpdate();
      if (moved) onChange();
    },

    measure: (element) => virtualizer.measureElement(element),

    destroy: () => {
      destroyed = true;
      observer?.disconnect();
      observer = null;
      observedList = null;
      scroller = null;
      unmount();
    },
  };
}
