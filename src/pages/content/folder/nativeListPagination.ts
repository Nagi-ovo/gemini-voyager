/** Gemini's sidebar scroller; it emits its "load older chats" request from its own scroll listener. */
const NATIVE_LIST_SCROLLER_SELECTOR = 'infinite-scroller';

// Gemini asks for the next Recents page only on a scroll past its bottomScrollThreshold
// of 90% (#1040), so a page we hide entirely adds no height and no scroll ever follows.
const GEMINI_BOTTOM_THRESHOLD_PERCENT = 90;

function hasLayout(scroller: HTMLElement): boolean {
  return scroller.scrollHeight > 0 && scroller.clientHeight > 0;
}

function wouldRequestNextPage(scroller: HTMLElement): boolean {
  const { scrollTop, clientHeight, scrollHeight } = scroller;
  // Rows hidden out of a short list leave nothing to scroll, so the user cannot ask either.
  if (scrollHeight <= clientHeight) return true;
  return ((scrollTop + clientHeight) / scrollHeight) * 100 > GEMINI_BOTTOM_THRESHOLD_PERCENT;
}

export type NativePaginationNudge = {
  /** A native row was just hidden; re-asks Gemini for older chats once per frame if it would. */
  rowHidden: (row: HTMLElement) => void;
  /** Drops pending requests, including one waiting for the sidebar to reopen (folder teardown). */
  cancel: () => void;
};

/**
 * Repeats the scroll Gemini would have seen had the hidden rows stayed visible,
 * so hide-archived cannot strand the Recents list at a bottom it never extends.
 * It acts only after rows are newly hidden: once Gemini has no older chats to
 * add, nothing new is hidden and nothing is dispatched.
 */
export function createNativePaginationNudge(): NativePaginationNudge {
  const scrollers = new Set<HTMLElement>();
  const awaitingLayout = new Set<HTMLElement>();
  let frame: number | null = null;
  let layoutObserver: ResizeObserver | null = null;

  const request = (scroller: HTMLElement): void => {
    if (wouldRequestNextPage(scroller)) scroller.dispatchEvent(new Event('scroll'));
  };

  const stopWatchingLayout = (): void => {
    layoutObserver?.disconnect();
    layoutObserver = null;
    awaitingLayout.clear();
  };

  const stopAwaiting = (scroller: HTMLElement): void => {
    if (!awaitingLayout.delete(scroller)) return;
    layoutObserver?.unobserve(scroller);
    if (awaitingLayout.size === 0) stopWatchingLayout();
  };

  // A scroller Gemini replaced while collapsed may never resize again, so sweep it here.
  const dropDetached = (): void => {
    for (const scroller of awaitingLayout) {
      if (!scroller.isConnected) stopAwaiting(scroller);
    }
  };

  const onLayout = (): void => {
    dropDetached();
    for (const scroller of awaitingLayout) {
      if (!hasLayout(scroller)) continue;
      stopAwaiting(scroller);
      request(scroller);
    }
  };

  // Rows hidden while the sidebar is collapsed are already marked when it reopens,
  // so no later hide re-asks: keep that request until the scroller can be measured.
  const waitForLayout = (scroller: HTMLElement): void => {
    if (awaitingLayout.has(scroller)) return;
    awaitingLayout.add(scroller);
    layoutObserver ??= new ResizeObserver(onLayout);
    layoutObserver.observe(scroller);
  };

  const flush = (): void => {
    frame = null;
    const pending = [...scrollers];
    scrollers.clear();
    dropDetached();
    for (const scroller of pending) {
      if (!scroller.isConnected) continue;
      if (hasLayout(scroller)) {
        stopAwaiting(scroller);
        request(scroller);
      } else {
        waitForLayout(scroller);
      }
    }
  };

  return {
    rowHidden: (row) => {
      const scroller = row.closest<HTMLElement>(NATIVE_LIST_SCROLLER_SELECTOR);
      if (!scroller) return;
      scrollers.add(scroller);
      frame ??= window.requestAnimationFrame(flush);
    },
    cancel: () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      scrollers.clear();
      stopWatchingLayout();
    },
  };
}
