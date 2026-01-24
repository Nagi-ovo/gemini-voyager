import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const timelineManagerSpies = {
  constructed: vi.fn(),
  init: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
};

vi.mock('../manager', () => {
  class TimelineManager {
    init = timelineManagerSpies.init;
    destroy = timelineManagerSpies.destroy;
    constructor() {
      timelineManagerSpies.constructed();
    }
  }

  return { TimelineManager };
});

describe('Timeline bootstrap', () => {
  beforeEach(async () => {
    vi.resetModules();
    timelineManagerSpies.constructed.mockClear();
    timelineManagerSpies.init.mockClear();
    timelineManagerSpies.destroy.mockClear();

    document.body.innerHTML = '<main></main>';
    history.replaceState({}, '', '/app');
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
  });

  it('startTimeline initializes only once when body already exists', async () => {
    const { startTimeline } = await import('../index');

    startTimeline();
    expect(timelineManagerSpies.constructed).toHaveBeenCalledTimes(1);
    expect(timelineManagerSpies.init).toHaveBeenCalledTimes(1);

    // Trigger DOM mutations; should not re-initialize
    document.body.appendChild(document.createElement('div'));
    await Promise.resolve();

    expect(timelineManagerSpies.constructed).toHaveBeenCalledTimes(1);
    expect(timelineManagerSpies.init).toHaveBeenCalledTimes(1);
  });
});
