import { Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  },
}));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => {
    const translations: Record<string, string> = {
      recentsHide: 'Hide recent items',
      recentsShow: 'Show recent items',
      sidebarCollapseNudgeTitle: 'Collapsed sections are still here',
      sidebarCollapseNudgeBody:
        'A slim bar stays in the sidebar. Click it anytime to expand this section again.',
      sidebarCollapseNudgeDismiss: 'Got it',
    };

    return translations[key] || key;
  },
}));

describe('recentsHider', () => {
  let cleanup: (() => void) | null = null;
  let localState: Record<string, boolean>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'gemini.google.com',
      },
      writable: true,
      configurable: true,
    });

    localState = {};
    (
      chrome.storage as unknown as {
        local: {
          get: Mock;
          set: Mock;
        };
      }
    ).local = {
      get: vi
        .fn()
        .mockImplementation(
          (
            defaults: Record<string, boolean>,
            callback: (result: Record<string, boolean>) => void,
          ) => {
            const key = Object.keys(defaults)[0];
            callback({
              [key]: Object.prototype.hasOwnProperty.call(localState, key)
                ? localState[key]
                : defaults[key],
            });
          },
        ),
      set: vi.fn().mockImplementation((update: Record<string, boolean>, callback?: () => void) => {
        Object.assign(localState, update);
        callback?.();
      }),
    };
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.useRealTimers();
  });

  function createRecentsSection(): HTMLElement {
    const recents = document.createElement('div');
    recents.className = 'my-stuff-recents-preview';
    document.body.appendChild(recents);
    return recents;
  }

  async function startFeature(): Promise<void> {
    const { startRecentsHider } = await import('../index');
    cleanup = startRecentsHider();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    await Promise.resolve();
  }

  async function flushAsyncWork(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  it('shows the shared first-use nudge when My Stuff is hidden', async () => {
    const recents = createRecentsSection();

    await startFeature();

    const toggle = recents.querySelector<HTMLButtonElement>('.gv-recents-toggle-btn');
    const peekBar = document.querySelector<HTMLDivElement>('.gv-recents-peek-bar');

    expect(toggle?.getAttribute('title')).toBe('Hide recent items');
    expect(peekBar?.getAttribute('title')).toBe('Show recent items');
    expect(peekBar?.getAttribute('data-tooltip')).toBe('Show recent items');

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushAsyncWork();

    expect(localState[StorageKeys.RECENTS_HIDDEN]).toBe(true);
    expect(localState[StorageKeys.SIDEBAR_COLLAPSE_NUDGE_SHOWN]).toBe(true);
    expect(recents.classList.contains('gv-recents-hidden')).toBe(true);
    expect(peekBar?.classList.contains('gv-visible')).toBe(true);
    expect(document.querySelector('.gv-sidebar-collapse-nudge')?.textContent).toContain(
      'A slim bar stays in the sidebar.',
    );
  });
});
