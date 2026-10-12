import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { startSelectionToolbarHost } from '../../selectionToolbar/host';
import { startHighlightAction } from '../highlightAction';
import { HighlightManager } from '../manager';

const RECT = { top: 200, bottom: 210, left: 100, right: 110, width: 10, height: 10 };
const SAVED_PALETTE = ['#abcdef', 'green', '#123456', 'pink', '#c084fc'];

/** Deliver one change to every storage listener still registered, as the browser does. */
function emitStorageChange(changes: Record<string, { newValue?: unknown }>): void {
  const removed = new Set(
    vi.mocked(chrome.storage.onChanged.removeListener).mock.calls.map(([listener]) => listener),
  );
  vi.mocked(chrome.storage.onChanged.addListener)
    .mock.calls.map(([listener]) => listener)
    .filter((listener) => !removed.has(listener))
    .forEach((listener) => listener(changes as never, 'sync'));
}

function selectAnswer(): void {
  const text = document.getElementById('assistant')?.firstChild;
  if (!(text instanceof Text)) throw new Error('Expected answer text');
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 6);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup'));
  vi.advanceTimersByTime(250);
}

async function flushPromises(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}

describe('highlight action sub-settings', () => {
  const stops: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(HighlightManager.prototype, 'init').mockResolvedValue();
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...RECT, x: 0, y: 0, toJSON: () => ({}) }),
    });
    document.body.innerHTML = `
      <main>
        <div class="conversation-container" id="1111111111111111">
          <div class="user-query-bubble-with-background">Question</div>
          <model-response><message-content><p id="assistant">Answer text</p></message-content></model-response>
        </div>
      </main>
    `;
  });

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it.each([false, true])(
    'startup and a later slot edit preserve a palette without yellow and a non-first default (live markers: %s)',
    async (liveMarkers) => {
      let answer: () => void = () => {};
      // The polyfill answers `browser.storage` from the callback chrome is given.
      vi.mocked(chrome.storage.sync.get).mockImplementationOnce(((
        _keys: unknown,
        callback: (items: Record<string, unknown>) => void,
      ) => {
        answer = () =>
          callback({
            [StorageKeys.HIGHLIGHT_DEFAULT_COLOR]: 'pink',
            [StorageKeys.HIGHLIGHT_COLOR_PALETTE]: SAVED_PALETTE,
            [StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED]: true,
          });
      }) as never);
      const setMarkers = vi.spyOn(HighlightManager.prototype, 'setTimelineMarkersEnabled');
      const createFromRange = vi
        .spyOn(HighlightManager.prototype, 'createFromRange')
        .mockResolvedValue(true);
      stops.push(startSelectionToolbarHost());
      stops.unshift(startHighlightAction());

      if (liveMarkers)
        emitStorageChange({
          [StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED]: { newValue: false },
        });
      answer();
      await flushPromises();

      // The live switch is newer than the read; the colors it did not touch come from the read.
      expect(setMarkers).toHaveBeenLastCalledWith(!liveMarkers);
      selectAnswer();
      const slots = [...document.querySelectorAll<HTMLElement>('[data-highlight-slot]')];
      expect(slots.map((slot) => slot.dataset.highlightColor)).toEqual(SAVED_PALETTE);
      expect(
        document.querySelector<HTMLElement>('.gv-highlight-color-option[aria-pressed="true"]')
          ?.dataset.highlightColor,
      ).toBe('pink');
      document.querySelector<HTMLButtonElement>('[data-highlight-slot="2"]')!.click();
      const input = document.querySelector<HTMLInputElement>('.gv-highlight-custom-color')!;
      input.value = '#987654';
      input.dispatchEvent(new Event('change'));
      await flushPromises();
      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [StorageKeys.HIGHLIGHT_COLOR_PALETTE]: ['#abcdef', 'green', '#987654', 'pink', '#c084fc'],
        }),
        expect.any(Function),
      );
      document.querySelector<HTMLButtonElement>('[data-highlight-slot="3"]')!.click();
      document.querySelector<HTMLButtonElement>('.gv-highlight-action')!.click();
      await flushPromises();
      expect(createFromRange).toHaveBeenCalledWith(expect.any(Range), 'pink');
    },
  );
});
