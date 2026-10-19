import { afterEach, describe, expect, it, vi } from 'vitest';

import { watchHistoryRequests } from '../historyRequestWatch';

function observerMessage(type: string, payload: unknown, source = 'gv-history-observer'): void {
  const event = new MessageEvent('message', {
    data: { source, type, payload },
    origin: window.location.origin,
  });
  Object.defineProperty(event, 'source', { value: window });
  window.dispatchEvent(event);
}

describe('watchHistoryRequests', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports loading from a page request until it has had time to render', () => {
    vi.useFakeTimers();
    const watch = watchHistoryRequests();
    expect(watch.isLoading()).toBe(false);

    observerMessage('request', { phase: 'start' });
    vi.advanceTimersByTime(8000);
    expect(watch.isLoading()).toBe(true);

    observerMessage('request', { phase: 'end' });
    vi.advanceTimersByTime(1500);
    expect(watch.isLoading()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(watch.isLoading()).toBe(false);
    watch.stop();
  });

  it('ignores captures, other sources and requests after it stops', () => {
    const watch = watchHistoryRequests();
    observerMessage('capture', { id: 'x', body: '' });
    observerMessage('request', { phase: 'start' }, 'someone-else');
    expect(watch.isLoading()).toBe(false);

    watch.stop();
    observerMessage('request', { phase: 'start' });
    expect(watch.isLoading()).toBe(false);
  });
});
