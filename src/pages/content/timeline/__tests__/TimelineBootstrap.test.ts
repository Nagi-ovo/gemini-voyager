import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

async function flush(): Promise<void> {
  for (let round = 0; round < 12; round++) await Promise.resolve();
}

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
    await flush();
    expect(initSpy).toHaveBeenCalledTimes(1);

    // Trigger DOM mutations; should not re-initialize
    document.body.appendChild(document.createElement('div'));
    await Promise.resolve();

    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it('stopping the timeline leaves the page-lifetime history and shortcut services running', async () => {
    const managerModule = await import('../manager');
    const init = vi
      .spyOn(managerModule.TimelineManager.prototype, 'init')
      .mockResolvedValue(undefined);
    const historyModule = await import('../../timestamp/historyTimestamps');
    const shortcutModule = await import('@/core/services/KeyboardShortcutService');
    const stopHistory = vi.spyOn(historyModule.historyTimestampStore, 'stop');
    const destroyShortcuts = vi.spyOn(shortcutModule.keyboardShortcutService, 'destroy');
    const { startTimeline } = await import('../index');

    stop = startTimeline();
    await flush();
    expect(init).toHaveBeenCalledOnce();
    stop();

    expect(stopHistory).not.toHaveBeenCalled();
    expect(destroyShortcuts).not.toHaveBeenCalled();
  });

  it('closing the rail during the initial setting read beats the older enabled value', async () => {
    const managerModule = await import('../manager');
    const init = vi
      .spyOn(managerModule.TimelineManager.prototype, 'init')
      .mockResolvedValue(undefined);
    let answer!: (value: Record<string, unknown>) => void;
    (chrome.storage.sync.get as unknown as Mock).mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        answer = resolve;
      }),
    );
    const listener = vi.spyOn(chrome.storage.onChanged, 'addListener');
    const { startTimeline } = await import('../index');
    stop = startTimeline();
    const onChange = listener.mock.calls.at(-1)![0];
    onChange({ [StorageKeys.GV_TIMELINE_ENABLED]: { newValue: false } }, 'sync');
    answer({ [StorageKeys.GV_TIMELINE_ENABLED]: true });
    await flush();
    expect(init).not.toHaveBeenCalled();

    onChange({ [StorageKeys.GV_TIMELINE_ENABLED]: { newValue: true } }, 'sync');
    expect(init).toHaveBeenCalledOnce();
  });
});
