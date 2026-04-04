import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KeyboardShortcutSettings } from '../KeyboardShortcutSettings';

const {
  initMock,
  getConfigMock,
  setEnabledMock,
  saveConfigMock,
  resetToDefaultsMock,
  formatShortcutMock,
} = vi.hoisted(() => ({
  initMock: vi.fn().mockResolvedValue(undefined),
  getConfigMock: vi.fn(),
  setEnabledMock: vi.fn().mockResolvedValue(undefined),
  saveConfigMock: vi.fn().mockResolvedValue(undefined),
  resetToDefaultsMock: vi.fn().mockResolvedValue(undefined),
  formatShortcutMock: vi.fn((shortcut: { key: string; sequenceLength?: number }) =>
    shortcut.sequenceLength === 2 ? shortcut.key.repeat(2) : shortcut.key,
  ),
}));

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock('@/core/services/KeyboardShortcutService', () => ({
  keyboardShortcutService: {
    init: initMock,
    getConfig: getConfigMock,
    setEnabled: setEnabledMock,
    saveConfig: saveConfigMock,
    resetToDefaults: resetToDefaultsMock,
    formatShortcut: formatShortcutMock,
  },
}));

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('KeyboardShortcutSettings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);

    getConfigMock.mockReturnValue({
      enabled: true,
      config: {
        previous: { action: 'timeline:previous', modifiers: [], key: 'k', sequenceLength: 1 },
        next: { action: 'timeline:next', modifiers: [], key: 'j', sequenceLength: 1 },
        first: { action: 'timeline:first', modifiers: [], key: 'g', sequenceLength: 2 },
        last: {
          action: 'timeline:last',
          modifiers: ['Shift'],
          key: 'G',
          sequenceLength: 2,
        },
      },
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('allows editing the last-node repeated shortcut and swaps conflicts', async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(<KeyboardShortcutSettings />);
    });
    await flushMicrotasks();

    const lastButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'GG',
    );
    expect(lastButton).toBeTruthy();

    await act(async () => {
      lastButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'g',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flushMicrotasks();

    expect(saveConfigMock).toHaveBeenCalledWith(
      {
        previous: { action: 'timeline:previous', modifiers: [], key: 'k', sequenceLength: 1 },
        next: { action: 'timeline:next', modifiers: [], key: 'j', sequenceLength: 1 },
        first: {
          action: 'timeline:first',
          modifiers: ['Shift'],
          key: 'G',
          sequenceLength: 2,
        },
        last: { action: 'timeline:last', modifiers: [], key: 'g', sequenceLength: 2 },
      },
      true,
    );
  });
});
