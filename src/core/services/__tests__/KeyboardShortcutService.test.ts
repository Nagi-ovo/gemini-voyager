import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { KeyboardShortcutStorage } from '@/core/types/keyboardShortcut';

import { keyboardShortcutService } from '../KeyboardShortcutService';

describe('KeyboardShortcutService', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', undefined);
    localStorage.clear();
    keyboardShortcutService.destroy();
  });

  afterEach(() => {
    keyboardShortcutService.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('merges legacy shortcut config with first/last defaults', async () => {
    const legacyStorage = {
      shortcuts: {
        previous: {
          action: 'timeline:previous',
          modifiers: [],
          key: 'p',
        },
        next: {
          action: 'timeline:next',
          modifiers: [],
          key: 'n',
        },
      },
      enabled: true,
    } as unknown as KeyboardShortcutStorage;

    localStorage.setItem(StorageKeys.TIMELINE_SHORTCUTS, JSON.stringify(legacyStorage));

    await keyboardShortcutService.init();

    const { config } = keyboardShortcutService.getConfig();
    expect(config.previous.key).toBe('p');
    expect(config.next.key).toBe('n');
    expect(config.first.key).toBe('g');
    expect(config.first.sequenceLength).toBe(2);
    expect(config.last.key).toBe('G');
    expect(config.last.sequenceLength).toBe(2);
  });

  it('supports customizable repeated shortcut for timeline:last', async () => {
    await keyboardShortcutService.saveConfig({
      previous: {
        action: 'timeline:previous',
        modifiers: [],
        key: 'k',
        sequenceLength: 1,
      },
      next: {
        action: 'timeline:next',
        modifiers: [],
        key: 'j',
        sequenceLength: 1,
      },
      first: {
        action: 'timeline:first',
        modifiers: ['Shift'],
        key: 'G',
        sequenceLength: 2,
      },
      last: {
        action: 'timeline:last',
        modifiers: [],
        key: 'g',
        sequenceLength: 2,
      },
    });

    await keyboardShortcutService.init();

    const listener = vi.fn();
    const unsubscribe = keyboardShortcutService.on(listener);

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('timeline:last', expect.any(KeyboardEvent));

    unsubscribe();
  });
});
