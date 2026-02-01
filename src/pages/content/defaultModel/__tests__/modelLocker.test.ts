import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('DefaultModelManager (default model locker)', () => {
  let destroyManager: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({});
      },
    );

    (chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_items: unknown, callback: () => void) => {
        callback();
      },
    );

    (chrome.storage.sync.remove as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: () => void) => {
        callback();
      },
    );

    (
      chrome as unknown as {
        i18n?: { getMessage: (key: string, substitutions?: string[]) => string };
      }
    ).i18n = {
      getMessage: (key: string, substitutions?: string[]) =>
        substitutions?.length ? `${key}:${substitutions.join(',')}` : key,
    };

    document.body.innerHTML = '';
    history.replaceState({}, '', '/');
  });

  afterEach(() => {
    destroyManager?.();
    destroyManager = null;

    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('does not query the whole document for menu panel on unrelated DOM mutations', async () => {
    const querySelectorSpy = vi.spyOn(document, 'querySelector');

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // Trigger a burst of DOM mutations that are unrelated to the menu panel.
    for (let i = 0; i < 50; i++) {
      const div = document.createElement('div');
      div.textContent = `node-${i}`;
      document.body.appendChild(div);
    }

    await Promise.resolve(); // flush MutationObserver microtasks
    await vi.runAllTimersAsync();

    const selectors = querySelectorSpy.mock.calls.map((call) => call[0]);
    expect(selectors).not.toContain('.mat-mdc-menu-panel');
    expect(selectors).not.toContain('.mat-mdc-menu-panel[role="menu"]');
  });

  it('injects star buttons even when menu items render after the panel is added', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const menuPanel = document.createElement('div');
    menuPanel.className = 'mat-mdc-menu-panel';
    menuPanel.setAttribute('role', 'menu');
    document.body.appendChild(menuPanel);

    await Promise.resolve(); // observer sees panel
    await vi.advanceTimersByTimeAsync(60); // initial delayed injection attempt

    // Render menu item after panel exists (common in Gemini).
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitemradio');
    item.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">Model A</div>
      </div>
    `;
    menuPanel.appendChild(item);

    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();
  });
});
