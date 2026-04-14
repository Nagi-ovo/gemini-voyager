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
      gemsHide: 'Hide Gems',
      gemsShow: 'Show Gems',
      notebooksHide: 'Hide Notebooks',
      notebooksShow: 'Show Notebooks',
    };

    return translations[key] || key;
  },
}));

describe('gemsHider', () => {
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

  function createLegacyGemsSection(): HTMLElement {
    const host = document.createElement('div');
    const container = document.createElement('div');
    container.className = 'gems-list-container';

    const arrowIcon = document.createElement('div');
    arrowIcon.setAttribute('data-test-id', 'arrow-icon');
    container.appendChild(arrowIcon);

    host.appendChild(container);
    document.body.appendChild(host);

    return container;
  }

  function createNotebookSection(): HTMLElement {
    const host = document.createElement('project-sidenav-list');
    const container = document.createElement('div');
    container.className = 'project-sidenav-container';

    const entry = document.createElement('side-nav-entry-button');
    entry.setAttribute('data-test-id', 'project-management-button');

    const arrowIcon = document.createElement('div');
    arrowIcon.setAttribute('data-test-id', 'arrow-icon');
    entry.appendChild(arrowIcon);

    container.appendChild(entry);
    host.appendChild(container);
    document.body.appendChild(host);

    return container;
  }

  async function startFeature(): Promise<void> {
    const { startGemsHider } = await import('../index');
    cleanup = startGemsHider();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    await Promise.resolve();
  }

  it('initializes separate hide controls for gems and notebooks', async () => {
    localState[StorageKeys.GEMS_HIDDEN] = true;
    localState[StorageKeys.NOTEBOOKS_HIDDEN] = false;

    const gems = createLegacyGemsSection();
    const notebooks = createNotebookSection();

    await startFeature();

    expect(document.querySelectorAll('.gv-sidebar-section-toggle-btn')).toHaveLength(2);
    expect(gems.querySelector('.gv-sidebar-section-toggle-btn')?.getAttribute('title')).toBe(
      'Hide Gems',
    );
    expect(notebooks.querySelector('.gv-sidebar-section-toggle-btn')?.getAttribute('title')).toBe(
      'Hide Notebooks',
    );
    const notebookPeekBar = document.querySelector<HTMLDivElement>(
      '[data-gv-sidebar-section-id="notebooks"].gv-sidebar-section-peek-bar',
    );
    expect(notebookPeekBar?.getAttribute('title')).toBe('Show Notebooks');
    notebookPeekBar?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.getElementById('gv-sidebar-section-tooltip')?.textContent).toBe(
      'Show Notebooks',
    );
    expect(
      document.getElementById('gv-sidebar-section-tooltip')?.classList.contains('gv-visible'),
    ).toBe(true);
    expect(gems.classList.contains('gv-sidebar-section-hidden')).toBe(true);
    expect(notebooks.classList.contains('gv-sidebar-section-hidden')).toBe(false);
  });

  it('persists notebook hidden state without affecting gems', async () => {
    const gems = createLegacyGemsSection();
    const notebooks = createNotebookSection();

    await startFeature();

    const notebookToggle = notebooks.querySelector<HTMLButtonElement>(
      '.gv-sidebar-section-toggle-btn',
    );
    expect(notebookToggle).not.toBeNull();

    const result = notebookToggle?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(result).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(localState[StorageKeys.NOTEBOOKS_HIDDEN]).toBe(true);
    expect(localState[StorageKeys.GEMS_HIDDEN]).toBeUndefined();
    expect(notebooks.classList.contains('gv-sidebar-section-hidden')).toBe(true);
    expect(gems.classList.contains('gv-sidebar-section-hidden')).toBe(false);
  });

  it('processes notebook sections added after initialization', async () => {
    await startFeature();

    const notebooks = createNotebookSection();
    await Promise.resolve();

    expect(notebooks.querySelector('.gv-sidebar-section-toggle-btn')).not.toBeNull();
    expect(document.querySelectorAll('.gv-sidebar-section-toggle-btn')).toHaveLength(1);
  });
});
