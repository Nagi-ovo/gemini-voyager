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
    await vi.advanceTimersByTimeAsync(100); // Use a finite time advance to avoid infinite setInterval loop

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
    await vi.advanceTimersByTimeAsync(500); // Use a finite time advance to avoid infinite setInterval loop

    expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();
  });

  it('locks to Pro without matching "pro" inside "problems" (Thinking description)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({ gvDefaultModel: 'Pro' });
      },
    );

    history.replaceState({}, '', '/u/0/app?hl=zh&pageId=none');

    const selectorBtn = document.createElement('button');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = 'Thinking';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const menuPanel = document.createElement('div');
    menuPanel.className = 'mat-mdc-menu-panel';
    menuPanel.setAttribute('role', 'menu');

    const thinkingItem = document.createElement('button');
    thinkingItem.setAttribute('role', 'menuitemradio');
    thinkingItem.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">Thinking</div>
      </div>
      <span class="mode-desc">Solves complex problems</span>
    `;
    thinkingItem.click = vi.fn();

    const proItem = document.createElement('button');
    proItem.setAttribute('role', 'menuitemradio');
    proItem.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">Pro</div>
      </div>
      <span class="mode-desc">Thinks longer for advanced math &amp; code</span>
    `;
    proItem.click = vi.fn();

    menuPanel.appendChild(thinkingItem);
    menuPanel.appendChild(proItem);
    document.body.appendChild(menuPanel);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // Wait for the first interval tick (1s) and then the menu handling delay (500ms).
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(proItem.click).toHaveBeenCalledTimes(1);
    expect(thinkingItem.click).toHaveBeenCalledTimes(0);
  });

  it('locks by data-mode-id so it works across languages (e.g. Japanese titles)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: {
            id: 'e051ce1aa80aa576',
            name: 'Thinking',
          },
        });
      },
    );

    history.replaceState({}, '', '/u/1/app?hl=zh&pageId=none');

    const selectorBtn = document.createElement('button');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = 'Pro';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const menuPanel = document.createElement('div');
    menuPanel.className = 'mat-mdc-menu-panel';
    menuPanel.setAttribute('role', 'menu');

    const fastItem = document.createElement('button');
    fastItem.setAttribute('role', 'menuitemradio');
    fastItem.setAttribute('data-mode-id', '56fdd199312815e2');
    fastItem.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">高速モード</div>
      </div>
    `;
    fastItem.click = vi.fn();

    const thinkingItem = document.createElement('button');
    thinkingItem.setAttribute('role', 'menuitemradio');
    thinkingItem.setAttribute('data-mode-id', 'e051ce1aa80aa576');
    thinkingItem.setAttribute('aria-checked', 'false');
    thinkingItem.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">思考モード</div>
      </div>
      <span class="mode-desc">複雑な問題を解決</span>
    `;
    thinkingItem.click = vi.fn();

    const proItem = document.createElement('button');
    proItem.setAttribute('role', 'menuitemradio');
    proItem.setAttribute('data-mode-id', 'e6fa609c3fa255c0');
    proItem.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">Pro</div>
      </div>
    `;
    proItem.click = vi.fn();

    menuPanel.appendChild(fastItem);
    menuPanel.appendChild(thinkingItem);
    menuPanel.appendChild(proItem);
    document.body.appendChild(menuPanel);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(thinkingItem.click).toHaveBeenCalledTimes(1);
    expect(proItem.click).toHaveBeenCalledTimes(0);
  });

  it('skips auto-selection when default model is Flash (Gemini default)', async () => {
    // Set default model to Flash (by ID)
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: {
            id: '56fdd199312815e2', // Flash model ID
            name: 'Flash',
          },
        });
      },
    );

    history.replaceState({}, '', '/u/0/app?hl=en');

    const selectorBtn = document.createElement('button');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // Wait for the interval tick and menu handling delay
    await vi.advanceTimersByTimeAsync(1500);

    // Since Flash is the default model, no click should be triggered
    expect(selectorBtn.click).toHaveBeenCalledTimes(0);
  });

  it('skips auto-selection when default model name contains "flash" (case insensitive)', async () => {
    // Set default model to Flash (by name)
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({ gvDefaultModel: '2.0 Flash' });
      },
    );

    history.replaceState({}, '', '/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // Wait for the interval tick and menu handling delay
    await vi.advanceTimersByTimeAsync(1500);

    // Since Flash is the default model, no click should be triggered
    expect(selectorBtn.click).toHaveBeenCalledTimes(0);
  });

  it('stops retrying after consecutive failures when target model is not found', async () => {
    // Set default model to a model that won't be found
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: {
            id: 'nonexistent-model-id',
            name: 'Nonexistent Model',
          },
        });
      },
    );

    history.replaceState({}, '', '/u/2/app?hl=zh');

    const selectorBtn = document.createElement('button');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = 'Flash'; // Current model is Flash, not the target
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    // Create menu panel with items that don't include the target model
    const menuPanel = document.createElement('div');
    menuPanel.className = 'mat-mdc-menu-panel';
    menuPanel.setAttribute('role', 'menu');

    const flashItem = document.createElement('button');
    flashItem.setAttribute('role', 'menuitemradio');
    flashItem.setAttribute('data-mode-id', '56fdd199312815e2');
    flashItem.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">Flash</div>
      </div>
    `;
    flashItem.click = vi.fn();

    menuPanel.appendChild(flashItem);
    document.body.appendChild(menuPanel);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // Advance timers for 3 retry attempts (1 second each) + initial delay
    // Each attempt should open the menu and fail to find the target
    await vi.advanceTimersByTimeAsync(4000);

    // The selector button should have been clicked at most 3 times (maxConsecutiveFailures)
    // because after 3 consecutive failures, it should stop retrying
    expect((selectorBtn.click as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(
      3,
    );
  });
});
