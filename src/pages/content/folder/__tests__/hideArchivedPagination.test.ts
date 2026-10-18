import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NativeArchivedRows } from '../nativeArchivedRows';
import { createNativePaginationNudge } from '../nativeListPagination';

const PAGE_SIZE = 20;

type Geometry = { scrollTop: number; clientHeight: number; scrollHeight: number };

/** Gemini's sidebar: an `infinite-scroller` holding the Recents rows. */
function setGeometry(scroller: HTMLElement, geometry: Geometry): void {
  for (const [key, value] of Object.entries(geometry)) {
    Object.defineProperty(scroller, key, { configurable: true, value });
  }
}

function mountSidebar(geometry: Geometry) {
  const sidebar = document.createElement('div');
  sidebar.setAttribute('data-test-id', 'overflow-container');
  const scroller = document.createElement('infinite-scroller');
  setGeometry(scroller, geometry);
  sidebar.appendChild(scroller);
  document.body.appendChild(sidebar);
  const scrolls = vi.fn();
  scroller.addEventListener('scroll', scrolls);
  return { sidebar, scroller, scrolls };
}

function loadPage(scroller: HTMLElement, firstIndex: number): HTMLElement[] {
  return Array.from({ length: PAGE_SIZE }, (_, offset) => {
    const row = document.createElement('div');
    row.setAttribute('data-test-id', 'conversation');
    row.setAttribute('jslog', `["c_${(firstIndex + offset).toString(16).padStart(16, '0')}"]`);
    scroller.appendChild(row);
    return row;
  });
}

const AT_BOTTOM: Geometry = { scrollTop: 1500, clientHeight: 800, scrollHeight: 2318 };
const COLLAPSED: Geometry = { scrollTop: 0, clientHeight: 0, scrollHeight: 0 };

/** Captures the observer callback so a test can report the sidebar's layout change. */
function captureResizeObserver(): { resize: () => void; restore: () => void } {
  const original = globalThis.ResizeObserver;
  const callbacks: ResizeObserverCallback[] = [];
  globalThis.ResizeObserver = class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      callbacks.push(callback);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      callbacks.length = 0;
    }
  };
  return {
    resize: () => [...callbacks].forEach((callback) => callback([], {} as ResizeObserver)),
    restore: () => {
      globalThis.ResizeObserver = original;
    },
  };
}

describe('hide-archived and Gemini pagination (#1040)', () => {
  let hiding: boolean;
  let filed: (id: string) => boolean;
  let nudge: ReturnType<typeof createNativePaginationNudge>;
  let sidebar: HTMLElement;

  const archivedRows = () =>
    new NativeArchivedRows({
      getSidebar: () => sidebar,
      isHidingArchived: () => hiding,
      isInFolders: (id) => filed(id),
      onRowHidden: (row) => nudge.rowHidden(row),
    });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    hiding = true;
    filed = () => true;
    nudge = createNativePaginationNudge();
  });

  afterEach(() => {
    nudge.cancel();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('loads older chats when a newly loaded page is entirely filed in folders', () => {
    const mounted = mountSidebar(AT_BOTTOM);
    sidebar = mounted.sidebar;
    const rows = archivedRows();

    rows.applyAll(loadPage(mounted.scroller, 0));
    vi.advanceTimersToNextFrame();

    expect(mounted.scrolls).toHaveBeenCalledTimes(1);
  });

  it('loads older chats when hidden rows leave nothing to scroll', () => {
    const mounted = mountSidebar({ scrollTop: 0, clientHeight: 800, scrollHeight: 640 });
    sidebar = mounted.sidebar;

    archivedRows().applyAll(loadPage(mounted.scroller, 0));
    vi.advanceTimersToNextFrame();

    expect(mounted.scrolls).toHaveBeenCalledTimes(1);
  });

  it('stops asking once Gemini adds no more rows to hide', () => {
    const mounted = mountSidebar(AT_BOTTOM);
    sidebar = mounted.sidebar;
    const rows = archivedRows();
    const page = loadPage(mounted.scroller, 0);
    rows.applyAll(page);
    vi.advanceTimersToNextFrame();

    // The end of the list: a later sweep sees only rows it already hid.
    rows.applyAll(page);
    vi.advanceTimersToNextFrame();

    expect(mounted.scrolls).toHaveBeenCalledTimes(1);
  });

  it('leaves Gemini alone while the user is still above its load threshold', () => {
    const mounted = mountSidebar({ scrollTop: 0, clientHeight: 800, scrollHeight: 4000 });
    sidebar = mounted.sidebar;

    archivedRows().applyAll(loadPage(mounted.scroller, 0));
    vi.advanceTimersToNextFrame();

    expect(mounted.scrolls).not.toHaveBeenCalled();
  });

  it('leaves Gemini alone when the new rows are not filed in folders', () => {
    const mounted = mountSidebar(AT_BOTTOM);
    sidebar = mounted.sidebar;
    filed = () => false;

    archivedRows().applyAll(loadPage(mounted.scroller, 0));
    vi.advanceTimersToNextFrame();

    expect(mounted.scrolls).not.toHaveBeenCalled();
  });

  it('leaves Gemini alone when hide-archived is off', () => {
    const mounted = mountSidebar(AT_BOTTOM);
    sidebar = mounted.sidebar;
    hiding = false;

    archivedRows().applyAll(loadPage(mounted.scroller, 0));
    vi.advanceTimersToNextFrame();

    expect(mounted.scrolls).not.toHaveBeenCalled();
  });

  it('asks nothing after the folder runtime is torn down', () => {
    const mounted = mountSidebar(AT_BOTTOM);
    sidebar = mounted.sidebar;

    archivedRows().applyAll(loadPage(mounted.scroller, 0));
    nudge.cancel();
    vi.advanceTimersToNextFrame();

    expect(mounted.scrolls).not.toHaveBeenCalled();
  });

  it('loads older chats when the sidebar reopens after a page was hidden while collapsed', () => {
    const observer = captureResizeObserver();
    try {
      const mounted = mountSidebar(COLLAPSED);
      sidebar = mounted.sidebar;
      const rows = archivedRows();
      const page = loadPage(mounted.scroller, 0);
      rows.applyAll(page);
      vi.advanceTimersToNextFrame();
      expect(mounted.scrolls).not.toHaveBeenCalled();

      // Reopened: the sweep finds the rows already hidden, so only the layout change can ask.
      setGeometry(mounted.scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 640 });
      rows.applyAll(page);
      vi.advanceTimersToNextFrame();
      observer.resize();

      expect(mounted.scrolls).toHaveBeenCalledTimes(1);
    } finally {
      observer.restore();
    }
  });

  it('asks nothing when the folder runtime is torn down before the sidebar reopens', () => {
    const observer = captureResizeObserver();
    try {
      const mounted = mountSidebar(COLLAPSED);
      sidebar = mounted.sidebar;
      archivedRows().applyAll(loadPage(mounted.scroller, 0));
      vi.advanceTimersToNextFrame();

      nudge.cancel();
      setGeometry(mounted.scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 640 });
      observer.resize();

      expect(mounted.scrolls).not.toHaveBeenCalled();
    } finally {
      observer.restore();
    }
  });

  it('asks once when the sidebar reopens just as another page is hidden', () => {
    const observer = captureResizeObserver();
    try {
      const mounted = mountSidebar(COLLAPSED);
      sidebar = mounted.sidebar;
      const rows = archivedRows();
      rows.applyAll(loadPage(mounted.scroller, 0));
      vi.advanceTimersToNextFrame();

      setGeometry(mounted.scroller, { scrollTop: 0, clientHeight: 800, scrollHeight: 640 });
      rows.applyAll(loadPage(mounted.scroller, PAGE_SIZE));
      vi.advanceTimersToNextFrame();
      observer.resize();

      expect(mounted.scrolls).toHaveBeenCalledTimes(1);
    } finally {
      observer.restore();
    }
  });
});

describe('hide-archived pagination when Gemini drops a request (#1040)', () => {
  let nudge: ReturnType<typeof createNativePaginationNudge>;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'setTimeout',
        'clearTimeout',
        'Date',
      ],
    });
    nudge = createNativePaginationNudge();
  });

  afterEach(() => {
    nudge.cancel();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  /** Gemini's listener: it ignores scrolls while still loading, then appends a visible page below the user. */
  function geminiBusyFor(scroller: HTMLElement, busyMs: number): () => number {
    const busyUntil = Date.now() + busyMs;
    let loads = 0;
    scroller.addEventListener('scroll', () => {
      if (Date.now() < busyUntil) return;
      loads += 1;
      setGeometry(scroller, {
        scrollTop: AT_BOTTOM.scrollTop + 900,
        clientHeight: AT_BOTTOM.clientHeight,
        scrollHeight: AT_BOTTOM.scrollHeight + 900,
      });
    });
    return () => loads;
  }

  function hideFiledPage(sidebar: HTMLElement, scroller: HTMLElement): void {
    new NativeArchivedRows({
      getSidebar: () => sidebar,
      isHidingArchived: () => true,
      isInFolders: () => true,
      onRowHidden: (row) => nudge.rowHidden(row),
    }).applyAll(loadPage(scroller, 0));
    vi.advanceTimersToNextFrame();
  }

  it('loads older chats when Gemini ignores the first request while still loading', () => {
    const { sidebar, scroller } = mountSidebar(AT_BOTTOM);
    const loads = geminiBusyFor(scroller, 500);

    hideFiledPage(sidebar, scroller);
    expect(loads()).toBe(0);
    vi.advanceTimersByTime(1000);

    expect(loads()).toBe(1);
  });

  it('stops asking once the list grows', () => {
    const { sidebar, scroller, scrolls } = mountSidebar(AT_BOTTOM);
    geminiBusyFor(scroller, 0);

    hideFiledPage(sidebar, scroller);
    vi.advanceTimersByTime(20_000);

    expect(scrolls).toHaveBeenCalledTimes(1);
  });

  it('keeps asking when only the sidebar grows taller while the list still cannot scroll', () => {
    const { sidebar, scroller, scrolls } = mountSidebar({
      scrollTop: 0,
      clientHeight: 800,
      scrollHeight: 800,
    });

    hideFiledPage(sidebar, scroller);
    setGeometry(scroller, { scrollTop: 0, clientHeight: 900, scrollHeight: 900 });
    vi.advanceTimersByTime(300);

    expect(scrolls).toHaveBeenCalledTimes(2);
  });

  it('keeps asking when only the sidebar grows shorter while the user stays at the bottom', () => {
    const { sidebar, scroller, scrolls } = mountSidebar(AT_BOTTOM);

    hideFiledPage(sidebar, scroller);
    setGeometry(scroller, { ...AT_BOTTOM, clientHeight: 700 });
    vi.advanceTimersByTime(300);

    expect(scrolls).toHaveBeenCalledTimes(2);
  });

  it('asks again when the sidebar reopens after collapsing before Gemini took the request', () => {
    const observer = captureResizeObserver();
    try {
      const { sidebar, scroller, scrolls } = mountSidebar(AT_BOTTOM);
      hideFiledPage(sidebar, scroller);

      setGeometry(scroller, COLLAPSED);
      vi.advanceTimersByTime(300);
      expect(scrolls).toHaveBeenCalledTimes(1);

      setGeometry(scroller, AT_BOTTOM);
      observer.resize();

      expect(scrolls).toHaveBeenCalledTimes(2);
    } finally {
      observer.restore();
    }
  });

  it('gives up after a few tries when Gemini has no older chats', () => {
    const { sidebar, scroller, scrolls } = mountSidebar(AT_BOTTOM);

    hideFiledPage(sidebar, scroller);
    vi.advanceTimersByTime(60_000);
    const asked = scrolls.mock.calls.length;
    vi.advanceTimersByTime(60_000);

    expect(asked).toBeGreaterThan(1);
    expect(asked).toBeLessThanOrEqual(6);
    expect(scrolls).toHaveBeenCalledTimes(asked);
  });

  it('stops retrying after the folder runtime is torn down', () => {
    const { sidebar, scroller, scrolls } = mountSidebar(AT_BOTTOM);

    hideFiledPage(sidebar, scroller);
    nudge.cancel();
    vi.advanceTimersByTime(60_000);

    expect(scrolls).toHaveBeenCalledTimes(1);
  });
});
