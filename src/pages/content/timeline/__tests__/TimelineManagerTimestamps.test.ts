import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConversationIdFromUrl } from '@/core/utils/conversationIdentity';

import { TimestampService } from '../../timestamp/TimestampService';
import { TimelineManager } from '../manager';

function setElementTop(el: HTMLElement, top: number): void {
  Object.defineProperty(el, 'offsetTop', { value: top, configurable: true });
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: top,
    top,
    left: 0,
    right: 0,
    bottom: top,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('TimelineManager message timestamps', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('records timestamps only for turns that appear after startup baseline', async () => {
    const main = document.createElement('main');
    document.body.appendChild(main);

    const scrollContainer = document.createElement('div');
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    scrollContainer.scrollTop = 0;
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect);
    main.appendChild(scrollContainer);

    const container = document.createElement('div');
    scrollContainer.appendChild(container);

    const first = document.createElement('div');
    first.className = 'user';
    first.textContent = 'A';
    setElementTop(first, 0);
    container.appendChild(first);

    const second = document.createElement('div');
    second.className = 'user';
    second.textContent = 'B';
    setElementTop(second, 100);
    container.appendChild(second);

    const timelineBar = document.createElement('div');
    const trackContent = document.createElement('div');
    timelineBar.appendChild(trackContent);
    document.body.appendChild(timelineBar);

    const recordTimestamp = vi.fn().mockResolvedValue(undefined);
    const getTimestamp = vi.fn().mockReturnValue(null);
    const formatTimestamp = vi.fn().mockResolvedValue('');

    const manager = new TimelineManager();
    const internal = manager as unknown as {
      conversationContainer: HTMLElement | null;
      scrollContainer: HTMLElement | null;
      userTurnSelector: string | null;
      conversationId: string | null;
      timestampService: TimestampService | null;
      ui: { timelineBar: HTMLElement | null; trackContent: HTMLElement | null };
      activeTurnId: string | null;
      recalculateAndRenderMarkers: () => void;
      updateTimelineGeometry: () => void;
      updateIntersectionObserverTargetsFromMarkers: () => void;
      syncTimelineTrackToMain: () => void;
      updateVirtualRangeAndRender: () => void;
      updateActiveDotUI: () => void;
      scheduleScrollSync: () => void;
    };

    internal.conversationContainer = container;
    internal.scrollContainer = scrollContainer;
    internal.userTurnSelector = '.user';
    internal.conversationId = 'gemini:conv:test';
    internal.timestampService = {
      getTimestamp,
      recordTimestamp,
      formatTimestamp,
      formatAbsoluteTime: vi.fn(),
    } as unknown as TimestampService;
    internal.ui.timelineBar = timelineBar;
    internal.ui.trackContent = trackContent;
    internal.activeTurnId = null;

    internal.updateTimelineGeometry = vi.fn();
    internal.updateIntersectionObserverTargetsFromMarkers = vi.fn();
    internal.syncTimelineTrackToMain = vi.fn();
    internal.updateVirtualRangeAndRender = vi.fn();
    internal.updateActiveDotUI = vi.fn();
    internal.scheduleScrollSync = vi.fn();

    internal.recalculateAndRenderMarkers();

    expect(recordTimestamp).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(801);

    const third = document.createElement('div');
    third.className = 'user';
    third.textContent = 'C';
    setElementTop(third, 200);
    container.appendChild(third);

    internal.recalculateAndRenderMarkers();

    expect(recordTimestamp).toHaveBeenCalledTimes(1);
    expect(recordTimestamp).toHaveBeenCalledWith('gemini:conv:test', expect.stringMatching(/^u-/));
  });

  it('reuses existing timestamp nodes on reinjection', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const message = document.createElement('div');
    message.className = 'user';
    message.textContent = 'hello';
    container.appendChild(message);

    const manager = new TimelineManager();
    const internal = manager as unknown as {
      conversationId: string | null;
      timestampService: TimestampService | null;
      showMessageTimestampsEnabled: boolean;
      markers: Array<{
        id: string;
        element: HTMLElement;
        summary: string;
        n: number;
        baseN: number;
        dotElement: null;
        starred: boolean;
      }>;
      injectMessageTimestamps: () => Promise<void>;
    };

    internal.conversationId = 'gemini:conv:test';
    internal.timestampService = {
      getTimestamp: vi.fn().mockReturnValue(1234),
      formatAbsoluteTime: vi.fn().mockReturnValue('2024-01-01 00:00:01'),
    } as unknown as TimestampService;
    internal.showMessageTimestampsEnabled = true;
    internal.markers = [
      {
        id: 'u-1',
        element: message,
        summary: 'hello',
        n: 0,
        baseN: 0,
        dotElement: null,
        starred: false,
      },
    ];

    await internal.injectMessageTimestamps();
    const firstTimestamp = document.querySelector('.gv-timestamp') as HTMLElement | null;

    expect(firstTimestamp).not.toBeNull();
    expect(firstTimestamp?.textContent).toBe('2024-01-01 00:00:01');

    await internal.injectMessageTimestamps();
    const secondTimestamp = document.querySelector('.gv-timestamp') as HTMLElement | null;

    expect(secondTimestamp).toBe(firstTimestamp);
    expect(document.querySelectorAll('.gv-timestamp')).toHaveLength(1);
  });

  it('adopts draft-route timestamps for the first turn after conversation creation', async () => {
    history.replaceState({}, '', '/app/abc123');

    const main = document.createElement('main');
    document.body.appendChild(main);

    const scrollContainer = document.createElement('div');
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    scrollContainer.scrollTop = 0;
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect);
    main.appendChild(scrollContainer);

    const rowWrapper = document.createElement('div');
    rowWrapper.style.display = 'flex';
    rowWrapper.style.flexDirection = 'row';
    rowWrapper.style.justifyContent = 'flex-end';
    scrollContainer.appendChild(rowWrapper);

    const message = document.createElement('div');
    message.className = 'user';
    message.textContent = 'first turn';
    setElementTop(message, 0);
    rowWrapper.appendChild(message);

    const timelineBar = document.createElement('div');
    const trackContent = document.createElement('div');
    timelineBar.appendChild(trackContent);
    document.body.appendChild(timelineBar);

    const draftConversationId = buildConversationIdFromUrl('https://gemini.google.com/app');
    const liveTimestamps = new Map<string, Map<string, number>>([
      [draftConversationId, new Map([['u-1', Date.now()]])],
    ]);

    const timestampServiceMock = {
      getTimestamp: vi.fn((conversationId: string, turnId: string) => {
        return liveTimestamps.get(conversationId)?.get(turnId) ?? null;
      }),
      formatAbsoluteTime: vi.fn(() => '2024-01-01 00:00:01'),
      getLatestTimestampForConversation: vi.fn((conversationId: string) => {
        const values = Array.from(liveTimestamps.get(conversationId)?.values() ?? []);
        return values.length > 0 ? Math.max(...values) : null;
      }),
      adoptTimestamps: vi.fn(async (sourceConversationId: string, targetConversationId: string) => {
        const source = liveTimestamps.get(sourceConversationId);
        if (!source) return;

        liveTimestamps.set(targetConversationId, new Map(source));
        liveTimestamps.delete(sourceConversationId);
      }),
    } as unknown as TimestampService;

    const manager = new TimelineManager({ previousUrl: 'https://gemini.google.com/app' });
    const internal = manager as unknown as {
      conversationContainer: HTMLElement | null;
      scrollContainer: HTMLElement | null;
      userTurnSelector: string | null;
      conversationId: string | null;
      timestampService: TimestampService | null;
      showMessageTimestampsEnabled: boolean;
      ui: { timelineBar: HTMLElement | null; trackContent: HTMLElement | null };
      activeTurnId: string | null;
      recalculateAndRenderMarkers: () => void;
      updateTimelineGeometry: () => void;
      updateIntersectionObserverTargetsFromMarkers: () => void;
      syncTimelineTrackToMain: () => void;
      updateVirtualRangeAndRender: () => void;
      updateActiveDotUI: () => void;
      scheduleScrollSync: () => void;
    };

    message.dataset.turnId = 'u-1';
    internal.conversationContainer = scrollContainer;
    internal.scrollContainer = scrollContainer;
    internal.userTurnSelector = '.user';
    internal.conversationId = 'gemini:conv:abc123';
    internal.timestampService = timestampServiceMock;
    internal.showMessageTimestampsEnabled = true;
    internal.ui.timelineBar = timelineBar;
    internal.ui.trackContent = trackContent;
    internal.activeTurnId = null;

    internal.updateTimelineGeometry = vi.fn();
    internal.updateIntersectionObserverTargetsFromMarkers = vi.fn();
    internal.syncTimelineTrackToMain = vi.fn();
    internal.updateVirtualRangeAndRender = vi.fn();
    internal.updateActiveDotUI = vi.fn();
    internal.scheduleScrollSync = vi.fn();

    internal.recalculateAndRenderMarkers();

    const timestampEl = document.querySelector('.gv-timestamp') as HTMLElement | null;
    expect(timestampEl?.textContent).toBe('2024-01-01 00:00:01');
    expect(
      (timestampServiceMock.adoptTimestamps as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
    ).toBe(draftConversationId);
  });
});
