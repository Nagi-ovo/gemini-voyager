import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';

vi.mock('../../../../utils/i18n', () => ({
  initI18n: vi.fn().mockResolvedValue(undefined),
  getTranslationSync: (key: string) => key,
}));

type SyncSettingsListener = (changes: Record<string, { newValue: unknown }>, area: string) => void;

type TimelinePosition = {
  version?: number;
  topPercent?: number;
  leftPercent?: number;
  top?: number;
  left?: number;
};

type TimelineManagerInternal = {
  destroyed: boolean;
  ui: {
    timelineBar: HTMLElement | null;
    tooltip: HTMLElement | null;
    slider?: HTMLElement | null;
    sliderHandle?: HTMLElement | null;
  };
  scrollContainer: HTMLElement | null;
  savedTimelinePosition: TimelinePosition | null;
  draggable: boolean;
  resizing: boolean;
  sliderDragging: boolean;
  barDragging: boolean;
  onResizeMove: ((ev: PointerEvent) => void) | null;
  onResizeUp: ((ev: PointerEvent) => void) | null;
  onSyncSettingsChanged: SyncSettingsListener | null;
  registerSyncSettingsListener: () => void;
  reapplyPosition: () => void;
  startResize: (ev: PointerEvent) => void;
  setupEventListeners: () => void;
  findCriticalElements: () => Promise<boolean>;
  historyTimestampStore: { stop: () => void } | null;
  historyTimestampUnsubscribe: (() => void) | null;
};

function asInternal(manager: TimelineManager): TimelineManagerInternal {
  return manager as unknown as TimelineManagerInternal;
}

function stubPointerCapture(el: HTMLElement): void {
  (el as HTMLElement & { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
}

/** Build a manager with enough DOM wired up to run setupEventListeners(). */
function setupInteractiveManager(): {
  manager: TimelineManager;
  internal: TimelineManagerInternal;
  bar: HTMLElement;
  handle: HTMLElement;
} {
  const manager = new TimelineManager();
  const internal = asInternal(manager);

  const bar = document.createElement('div');
  stubPointerCapture(bar);
  document.body.appendChild(bar);

  const slider = document.createElement('div');
  const handle = document.createElement('div');
  stubPointerCapture(handle);
  slider.appendChild(handle);
  document.body.appendChild(slider);

  const scroll = document.createElement('div');
  document.body.appendChild(scroll);

  internal.ui.timelineBar = bar;
  internal.ui.slider = slider;
  internal.ui.sliderHandle = handle;
  internal.scrollContainer = scroll;
  internal.setupEventListeners();

  return { manager, internal, bar, handle };
}

describe('TimelineManager lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('sync settings listener (H4)', () => {
    it('registers a stored listener reference and removes it on destroy', () => {
      const manager = new TimelineManager();
      const internal = asInternal(manager);

      internal.registerSyncSettingsListener();
      const listener = internal.onSyncSettingsChanged;
      expect(listener).toBeTypeOf('function');
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalledWith(listener);

      // Re-registration is a no-op (no duplicate listeners)
      internal.registerSyncSettingsListener();
      expect(internal.onSyncSettingsChanged).toBe(listener);
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);

      manager.destroy();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
      expect(internal.onSyncSettingsChanged).toBeNull();
    });

    it('does not register after destroy', () => {
      const manager = new TimelineManager();
      const internal = asInternal(manager);

      manager.destroy();
      internal.registerSyncSettingsListener();

      expect(internal.onSyncSettingsChanged).toBeNull();
      expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
    });

    it('updates the cached timeline position from sync storage changes', () => {
      const manager = new TimelineManager();
      const internal = asInternal(manager);

      internal.registerSyncSettingsListener();
      const listener = internal.onSyncSettingsChanged!;

      const position = { version: 2, topPercent: 12, leftPercent: 34 };
      listener({ geminiTimelinePosition: { newValue: position } }, 'sync');
      expect(internal.savedTimelinePosition).toEqual(position);

      // Non-sync areas are ignored
      listener({ geminiTimelinePosition: { newValue: null } }, 'local');
      expect(internal.savedTimelinePosition).toEqual(position);

      // Clearing the stored position clears the cache
      listener({ geminiTimelinePosition: { newValue: null } }, 'sync');
      expect(internal.savedTimelinePosition).toBeNull();

      manager.destroy();
    });
  });

  describe('destroyed flag (H5)', () => {
    it('init after destroy is a no-op', async () => {
      const manager = new TimelineManager();
      manager.destroy();

      await manager.init();

      expect(document.querySelector('.gemini-timeline-bar')).toBeNull();
    });

    it('does not inject UI when init resumes after a mid-flight destroy', async () => {
      const manager = new TimelineManager();
      const internal = asInternal(manager);

      let resolveFind: ((value: boolean) => void) | null = null;
      internal.findCriticalElements = () =>
        new Promise<boolean>((resolve) => {
          resolveFind = resolve;
        });

      const initPromise = manager.init();
      await vi.waitFor(() => expect(resolveFind).toBeTypeOf('function'));

      // SPA navigation destroys the instance while init is still awaiting
      manager.destroy();
      resolveFind!(true);
      await initPromise;

      expect(document.querySelector('.gemini-timeline-bar')).toBeNull();
      expect(internal.ui.timelineBar).toBeNull();
    });
  });

  describe('shared history timestamp lifecycle', () => {
    it('unsubscribes the manager without stopping the page-lifetime store', () => {
      const manager = new TimelineManager();
      const internal = asInternal(manager);
      const unsubscribe = vi.fn();
      const stop = vi.fn();
      internal.historyTimestampStore = { stop };
      internal.historyTimestampUnsubscribe = unsubscribe;

      manager.destroy();

      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(stop).not.toHaveBeenCalled();
      expect(internal.historyTimestampUnsubscribe).toBeNull();
      expect(internal.historyTimestampStore).toBeNull();
    });
  });

  describe('drag state machines handle pointercancel (M6)', () => {
    it('ends bar-width resize on pointercancel', () => {
      const { manager, internal, bar } = setupInteractiveManager();

      internal.startResize({
        pointerId: 1,
        clientX: 50,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as PointerEvent);
      expect(internal.resizing).toBe(true);
      expect(bar.classList.contains('timeline-resizing')).toBe(true);

      window.dispatchEvent(new Event('pointercancel'));

      expect(internal.resizing).toBe(false);
      expect(bar.classList.contains('timeline-resizing')).toBe(false);
      expect(internal.onResizeMove).toBeNull();
      expect(internal.onResizeUp).toBeNull();

      manager.destroy();
    });

    it('ends slider drag on pointercancel', () => {
      const { manager, internal, handle } = setupInteractiveManager();

      handle.dispatchEvent(new Event('pointerdown'));
      expect(internal.sliderDragging).toBe(true);

      window.dispatchEvent(new Event('pointercancel'));
      expect(internal.sliderDragging).toBe(false);

      manager.destroy();
    });

    it('ends bar position drag on pointercancel', () => {
      const { manager, internal, bar } = setupInteractiveManager();
      internal.draggable = true;

      bar.dispatchEvent(new Event('pointerdown'));
      expect(internal.barDragging).toBe(true);

      window.dispatchEvent(new Event('pointercancel'));
      expect(internal.barDragging).toBe(false);

      manager.destroy();
    });
  });

  describe('position reapply cache (M4)', () => {
    it('reapplies position from the in-memory cache without reading storage', () => {
      const manager = new TimelineManager();
      const internal = asInternal(manager);

      const bar = document.createElement('div');
      document.body.appendChild(bar);
      internal.ui.timelineBar = bar;
      internal.savedTimelinePosition = { version: 2, topPercent: 10, leftPercent: 20 };

      internal.reapplyPosition();

      expect(chrome.storage.sync.get).not.toHaveBeenCalled();
      expect(bar.style.top).not.toBe('');
      expect(bar.style.left).not.toBe('');

      manager.destroy();
    });

    it('does nothing without a cached position', () => {
      const manager = new TimelineManager();
      const internal = asInternal(manager);

      const bar = document.createElement('div');
      document.body.appendChild(bar);
      internal.ui.timelineBar = bar;
      internal.savedTimelinePosition = null;

      internal.reapplyPosition();

      expect(chrome.storage.sync.get).not.toHaveBeenCalled();
      expect(bar.style.top).toBe('');
      expect(bar.style.left).toBe('');

      manager.destroy();
    });
  });
});
