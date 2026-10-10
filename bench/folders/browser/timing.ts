/**
 * Interaction timing for the browser page. Imported before any folder module so
 * its `setTimeout` wrapper sees every timer they schedule.
 *
 * One interaction's cost is its busy time: the synchronous action plus a forced
 * style/layout pass, plus every short timer it scheduled (debounced renders and
 * their follow-ups), each also followed by a forced layout. Idle waiting, such
 * as a 200 ms search debounce, is not busy time. Long tasks come from the
 * browser's Long Tasks API and count only the ones overlapping a timed window.
 */

const nativeSetTimeout = window.setTimeout.bind(window);
const nativeClearTimeout = window.clearTimeout.bind(window);

/** Timers longer than this are not part of an interaction (retry backoffs, idle refreshes). */
const TRACKED_TIMER_MAX_MS = 1000;

const pending = new Set<number>();
let tracking = false;
let countingCallbacks = false;
let callbackBusy = 0;

function forceLayout(): void {
  // Reading layout flushes pending style and layout for the whole document,
  // shadow trees included.
  void document.documentElement.offsetHeight;
}

type TimerHandler = (...args: unknown[]) => void;

window.setTimeout = ((handler: TimerHandler | string, delay?: number, ...args: unknown[]) => {
  if (typeof handler !== 'function') return nativeSetTimeout(handler, delay, ...args);
  const tracked = tracking && (delay ?? 0) <= TRACKED_TIMER_MAX_MS;
  const id = nativeSetTimeout(() => {
    pending.delete(id);
    if (!countingCallbacks) {
      handler(...args);
      return;
    }
    const start = performance.now();
    try {
      handler(...args);
    } finally {
      forceLayout();
      callbackBusy += performance.now() - start;
    }
  }, delay);
  if (tracked) pending.add(id);
  return id;
}) as typeof window.setTimeout;

window.clearTimeout = ((id?: number) => {
  if (id !== undefined) pending.delete(id);
  nativeClearTimeout(id);
}) as typeof window.clearTimeout;

interface LongTask {
  readonly start: number;
  readonly end: number;
}

const longTasks: LongTask[] = [];
export const longTasksSupported =
  typeof PerformanceObserver !== 'undefined' &&
  PerformanceObserver.supportedEntryTypes?.includes('longtask');
if (longTasksSupported) {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      longTasks.push({ start: entry.startTime, end: entry.startTime + entry.duration });
    }
  }).observe({ type: 'longtask', buffered: true });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => nativeSetTimeout(resolve, ms));
}

/** Two frames and a task: rendering and observers from earlier work have run. */
export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await sleep(0);
}

export interface Interaction {
  /** Busy time, ms. */
  readonly busy: number;
  /** From the action to the last scheduled timer, idle waits included, ms. */
  readonly latency: number;
  readonly window: readonly [number, number];
}

/** Times `action` and everything it schedules within a second. */
export async function measureInteraction(
  action: () => unknown | Promise<unknown>,
): Promise<Interaction> {
  await settle();
  pending.clear();
  tracking = true;
  callbackBusy = 0;
  const start = performance.now();
  try {
    await action();
    forceLayout();
  } catch (error) {
    tracking = false;
    throw error;
  }
  const actionEnd = performance.now();
  countingCallbacks = true;
  const deadline = actionEnd + 5000;
  while (pending.size > 0 && performance.now() < deadline) await sleep(4);
  countingCallbacks = false;
  tracking = false;
  const end = performance.now();
  return { busy: actionEnd - start + callbackBusy, latency: end - start, window: [start, end] };
}

/** Long tasks overlapping any of `windows`; waits a frame so the observer has reported them. */
export async function countLongTasks(
  windows: readonly (readonly [number, number])[],
): Promise<number> {
  if (!longTasksSupported) return 0;
  await settle();
  return longTasks.filter((task) =>
    windows.some(([start, end]) => task.start < end && task.end > start),
  ).length;
}

/** Long tasks overlapping the time `run` took. */
export async function countLongTasksDuring<T>(
  run: () => Promise<T>,
): Promise<{ value: T; longTasks: number }> {
  const start = performance.now();
  const value = await run();
  const end = performance.now();
  return { value, longTasks: await countLongTasks([[start, end]]) };
}

/** Elements under `root`, descending into open shadow roots. */
export function countElements(root: Element | ShadowRoot | null | undefined): number {
  if (!root) return 0;
  let count = 0;
  const visit = (node: Element | ShadowRoot) => {
    for (const child of Array.from(node.children)) {
      count++;
      visit(child);
      if (child.shadowRoot) visit(child.shadowRoot);
    }
  };
  if (root instanceof Element) {
    count++;
    if (root.shadowRoot) visit(root.shadowRoot);
  }
  visit(root);
  return count;
}
