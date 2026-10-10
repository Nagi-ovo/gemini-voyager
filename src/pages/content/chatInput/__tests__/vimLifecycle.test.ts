import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_keys: Record<string, unknown>, callback: (items: Record<string, unknown>) => void) => {
      callback({ [StorageKeys.INPUT_VIM_MODE]: true });
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Vim rendering lifecycle', () => {
  it('cancels a missing-HUD retry when stopped', async () => {
    document.body.innerHTML = '';
    const { startInputVimMode } = await import('../vimMode');
    const stop = await startInputVimMode();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    document.body.innerHTML =
      '<rich-textarea><textarea id="question-input"></textarea></rich-textarea>';
    vi.advanceTimersByTime(6000);
    expect(document.querySelector('.gv-input-vim-hud')).toBeNull();
  });

  it('pauses and re-enables one command listener and removes pending cursor/send work on stop', async () => {
    document.body.innerHTML = '<form><textarea id="question-input">hello</textarea></form>';
    const input = document.querySelector('textarea')!;
    input.focus = vi.fn();
    input.getBoundingClientRect = () => ({ width: 300, height: 40, top: 0, left: 0 }) as DOMRect;
    input.selectionStart = input.selectionEnd = 1;
    const { startInputVimMode } = await import('../vimMode');
    const stop = await startInputVimMode({ composerSelector: '#question-input' });
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];
    const key = (value: string) => {
      const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      return event;
    };
    key('Escape');
    key('x');
    expect(input.value).toBe('hllo');
    listener({ [StorageKeys.INPUT_VIM_MODE]: { newValue: false } }, 'sync');
    expect(key('x').defaultPrevented).toBe(false);
    expect(input.dataset.gvVimMode).toBeUndefined();
    listener({ [StorageKeys.INPUT_VIM_MODE]: { newValue: true } }, 'sync');
    expect(document.querySelectorAll('.gv-input-vim-hud')).toHaveLength(1);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(input.dataset.gvVimMode).toBe('insert');
    key('Escape');
    key('x');
    expect(input.value).toBe('hlo');
    key('Enter');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    stop();
    // Textarea selection events have their own jsdom timers. Drain them too.
    vi.advanceTimersByTime(6000);
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('.gv-input-vim-hud')).toBeNull();
    expect(document.querySelector('.gv-input-vim-cursor')).toBeNull();
    expect(document.querySelector('.gv-input-vim-hud-composer-mount')).toBeNull();
    expect(key('x').defaultPrevented).toBe(false);
  });
});
