import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Timeline bootstrap', () => {
  let stop: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    document.body.innerHTML = '<main></main>';

    history.replaceState({}, '', '/app');
  });

  afterEach(() => {
    stop?.();
    stop = null;
  });

  it('startTimeline initializes only once when body already exists', async () => {
    const managerModule = await import('../manager');
    const initSpy = vi
      .spyOn(managerModule.TimelineManager.prototype, 'init')
      .mockResolvedValue(undefined);
    const { startTimeline } = await import('../index');

    stop = startTimeline();
    expect(initSpy).toHaveBeenCalledTimes(1);

    // Trigger DOM mutations; should not re-initialize
    document.body.appendChild(document.createElement('div'));
    await Promise.resolve();

    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it('stopping the timeline leaves the page-lifetime history and shortcut services running', async () => {
    const managerModule = await import('../manager');
    vi.spyOn(managerModule.TimelineManager.prototype, 'init').mockResolvedValue(undefined);
    const historyModule = await import('../../timestamp/historyTimestamps');
    const shortcutModule = await import('@/core/services/KeyboardShortcutService');
    const stopHistory = vi.spyOn(historyModule.historyTimestampStore, 'stop');
    const destroyShortcuts = vi.spyOn(shortcutModule.keyboardShortcutService, 'destroy');
    const { startTimeline } = await import('../index');

    stop = startTimeline();
    stop();

    expect(stopHistory).not.toHaveBeenCalled();
    expect(destroyShortcuts).not.toHaveBeenCalled();
  });
});
