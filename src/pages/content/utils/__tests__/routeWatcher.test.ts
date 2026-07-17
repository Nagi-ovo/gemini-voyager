import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchRouteChanges } from '../routeWatcher';

describe('watchRouteChanges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/app/one');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares one fallback interval across subscribers', () => {
    const intervalSpy = vi.spyOn(window, 'setInterval');
    const stopFirst = watchRouteChanges(vi.fn());
    const stopSecond = watchRouteChanges(vi.fn());

    expect(intervalSpy).toHaveBeenCalledTimes(1);

    stopFirst();
    stopSecond();
  });

  it('notifies subscribers once when the route changes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = watchRouteChanges(first);
    const stopSecond = watchRouteChanges(second);

    window.history.replaceState({}, '', '/app/two');
    vi.advanceTimersByTime(400);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({
        previousHref: expect.stringContaining('/app/one'),
        currentHref: expect.stringContaining('/app/two'),
      }),
    );

    stopFirst();
    stopSecond();
  });
});
