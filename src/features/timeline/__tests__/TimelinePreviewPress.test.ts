import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelinePreviewPress } from '../TimelinePreviewPress';

let press: TimelinePreviewPress | null = null;

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  press?.destroy();
  press = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('preview long-press failures', () => {
  it.each(['throw', 'reject'] as const)(
    'still suppresses navigation when the star callback fails by %s',
    async (failure) => {
      const list = document.createElement('div');
      list.innerHTML = '<div class="timeline-preview-item" data-turn-id="turn-1"></div>';
      document.body.appendChild(list);
      const item = list.firstElementChild as HTMLElement;
      const error = new Error('star storage unavailable');
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      press = new TimelinePreviewPress(list, (turnId) => {
        item.textContent = `starred ${turnId}`;
        if (failure === 'throw') throw error;
        return Promise.reject(error);
      });

      item.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      vi.advanceTimersByTime(550);
      expect(item.textContent).toBe('starred turn-1');
      expect(item.classList.contains('holding')).toBe(false);
      await Promise.resolve();
      expect(logged).toHaveBeenCalledExactlyOnceWith(
        '[TimelinePreviewPanel] Failed to toggle star:',
        error,
      );
      window.dispatchEvent(new MouseEvent('pointerup'));
      const click = new MouseEvent('click', { cancelable: true });
      expect(press.consumeClick('turn-1', click)).toBe(true);
      expect(click.defaultPrevented).toBe(true);
    },
  );
});
