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

  it('injects star buttons into compact bottom-sheet mode switch list', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const mobileList = document.createElement('mat-action-list');
    mobileList.className = 'gds-mode-switch-menu-list';
    mobileList.setAttribute('role', 'group');

    const item = document.createElement('button');
    item.setAttribute('role', 'menuitemradio');
    item.innerHTML = `
      <div class="title-and-description">
        <div>
          <span class="gds-title-m">Pro</span>
          <span class="gds-body-m">Advanced math and code</span>
        </div>
      </div>
    `;
    mobileList.appendChild(item);
    document.body.appendChild(mobileList);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);

    expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();
  });

  it('injects star buttons when menu items use role="menuitem" instead of "menuitemradio"', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const menuPanel = document.createElement('div');
    menuPanel.className = 'mat-mdc-menu-panel gds-mode-switch-menu';
    menuPanel.setAttribute('role', 'menu');

    const item = document.createElement('button');
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-mode-id', 'e051ce1aa80aa576');
    item.classList.add('bard-mode-list-button');
    item.innerHTML = `
      <span class="mat-mdc-menu-item-text">
        <div class="title-and-check">
          <div class="title-and-description">
            <div>
              <span class="gds-label-l">思考</span>
              <span class="mode-desc gds-body-s">解决复杂问题</span>
            </div>
          </div>
        </div>
      </span>
    `;
    menuPanel.appendChild(item);
    document.body.appendChild(menuPanel);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);

    expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();
  });

  it('auto-locks model when menu uses role="menuitem" variant', async () => {
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

    history.replaceState({}, '', '/u/0/app?hl=zh');

    const selectorBtn = document.createElement('button');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = '快速';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const menuPanel = document.createElement('div');
    menuPanel.className = 'mat-mdc-menu-panel gds-mode-switch-menu';
    menuPanel.setAttribute('role', 'menu');

    const fastItem = document.createElement('button');
    fastItem.setAttribute('role', 'menuitem');
    fastItem.setAttribute('data-mode-id', '56fdd199312815e2');
    fastItem.classList.add('bard-mode-list-button', 'is-selected');
    fastItem.innerHTML = `
      <span class="mat-mdc-menu-item-text">
        <div class="title-and-description">
          <div><span class="gds-label-l">快速</span></div>
        </div>
      </span>
    `;
    fastItem.click = vi.fn();

    const thinkingItem = document.createElement('button');
    thinkingItem.setAttribute('role', 'menuitem');
    thinkingItem.setAttribute('data-mode-id', 'e051ce1aa80aa576');
    thinkingItem.classList.add('bard-mode-list-button');
    thinkingItem.innerHTML = `
      <span class="mat-mdc-menu-item-text">
        <div class="title-and-description">
          <div><span class="gds-label-l">思考</span></div>
        </div>
      </span>
    `;
    thinkingItem.click = vi.fn();

    menuPanel.appendChild(fastItem);
    menuPanel.appendChild(thinkingItem);
    document.body.appendChild(menuPanel);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(thinkingItem.click).toHaveBeenCalledTimes(1);
    expect(fastItem.click).toHaveBeenCalledTimes(0);
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

  it('locks by id in compact bottom-sheet layout using jslog metadata fallback', async () => {
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

    history.replaceState({}, '', '/u/0/app?hl=zh');

    const selectorBtn = document.createElement('button');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = '快速';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const mobileList = document.createElement('mat-action-list');
    mobileList.className = 'gds-mode-switch-menu-list';
    mobileList.setAttribute('role', 'group');

    const fastItem = document.createElement('button');
    fastItem.setAttribute('role', 'menuitemradio');
    fastItem.setAttribute(
      'jslog',
      '242569;track:generic_click;BardVeMetadataKey:[null,null,null,null,["56fdd199312815e2"]]',
    );
    fastItem.innerHTML = `
      <div class="title-and-description">
        <div>
          <span class="gds-title-m">快速</span>
          <span class="gds-body-m">快速回答</span>
        </div>
      </div>
    `;
    fastItem.click = vi.fn();

    const thinkingItem = document.createElement('button');
    thinkingItem.setAttribute('role', 'menuitemradio');
    thinkingItem.setAttribute('aria-checked', 'false');
    thinkingItem.setAttribute(
      'jslog',
      '242569;track:generic_click;BardVeMetadataKey:[null,null,null,null,["e051ce1aa80aa576"]]',
    );
    thinkingItem.innerHTML = `
      <div class="title-and-description">
        <div>
          <span class="gds-title-m">思考</span>
          <span class="gds-body-m">解决复杂问题</span>
        </div>
      </div>
    `;
    thinkingItem.click = vi.fn();

    const proItem = document.createElement('button');
    proItem.setAttribute('role', 'menuitemradio');
    proItem.setAttribute(
      'jslog',
      '242569;track:generic_click;BardVeMetadataKey:[null,null,null,null,["e6fa609c3fa255c0"]]',
    );
    proItem.innerHTML = `
      <div class="title-and-description">
        <div>
          <span class="gds-title-m">Pro</span>
          <span class="gds-body-m">使用 3.1 Pro 处理高阶数学和代码任务</span>
        </div>
      </div>
    `;
    proItem.click = vi.fn();

    mobileList.appendChild(fastItem);
    mobileList.appendChild(thinkingItem);
    mobileList.appendChild(proItem);
    document.body.appendChild(mobileList);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(thinkingItem.click).toHaveBeenCalledTimes(1);
    expect(proItem.click).toHaveBeenCalledTimes(0);
  });

  it('focuses chat input after auto-switching model', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({ gvDefaultModel: 'Pro' });
      },
    );

    history.replaceState({}, '', '/u/0/app?hl=en');

    const selectorBtn = document.createElement('button');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const menuPanel = document.createElement('div');
    menuPanel.className = 'mat-mdc-menu-panel';
    menuPanel.setAttribute('role', 'menu');

    const flashItem = document.createElement('button');
    flashItem.setAttribute('role', 'menuitemradio');
    flashItem.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">Flash</div>
      </div>
    `;
    flashItem.click = vi.fn();

    const proItem = document.createElement('button');
    proItem.setAttribute('role', 'menuitemradio');
    proItem.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">Pro</div>
      </div>
    `;
    proItem.click = vi.fn();

    menuPanel.appendChild(flashItem);
    menuPanel.appendChild(proItem);
    document.body.appendChild(menuPanel);

    const main = document.createElement('main');
    const richTextarea = document.createElement('rich-textarea');
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');
    input.setAttribute('role', 'textbox');
    const focusSpy = vi.spyOn(input, 'focus').mockImplementation(() => {});
    richTextarea.appendChild(input);
    main.appendChild(richTextarea);
    document.body.appendChild(main);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(1500);

    expect(proItem.click).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalled();
  });

  it('does not focus chat input when target model is already selected', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({ gvDefaultModel: 'Pro' });
      },
    );

    history.replaceState({}, '', '/u/0/app?hl=en');

    const selectorBtn = document.createElement('button');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const menuPanel = document.createElement('div');
    menuPanel.className = 'mat-mdc-menu-panel';
    menuPanel.setAttribute('role', 'menu');

    const proItem = document.createElement('button');
    proItem.setAttribute('role', 'menuitemradio');
    proItem.setAttribute('aria-checked', 'true');
    proItem.innerHTML = `
      <div class="title-and-description">
        <div class="mode-title">Pro</div>
      </div>
    `;
    proItem.click = vi.fn();

    menuPanel.appendChild(proItem);
    document.body.appendChild(menuPanel);

    const main = document.createElement('main');
    const richTextarea = document.createElement('rich-textarea');
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');
    input.setAttribute('role', 'textbox');
    const focusSpy = vi.spyOn(input, 'focus').mockImplementation(() => {});
    richTextarea.appendChild(input);
    main.appendChild(richTextarea);
    document.body.appendChild(main);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(1500);

    expect(proItem.click).toHaveBeenCalledTimes(0);
    expect(focusSpy).not.toHaveBeenCalled();
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

  it('does not inject star buttons into the settings menu (desktop-settings-menu)', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // Simulate the Gemini settings/profile dropdown (has class desktop-settings-menu)
    const settingsMenu = document.createElement('div');
    settingsMenu.className = 'mat-mdc-menu-panel collapsed desktop-settings-menu ia-redesign';
    settingsMenu.setAttribute('role', 'menu');

    const settingsItem = document.createElement('a');
    settingsItem.setAttribute('role', 'menuitem');
    settingsItem.innerHTML = `
      <span class="mat-mdc-menu-item-text">
        <div class="menu-entry-with-badge">
          <span class="gds-label-l">个人使用场景</span>
        </div>
      </span>
    `;
    settingsMenu.appendChild(settingsItem);

    const themeItem = document.createElement('button');
    themeItem.setAttribute('role', 'menuitem');
    themeItem.innerHTML = `
      <span class="mat-mdc-menu-item-text">
        <span class="gds-label-l">主题</span>
      </span>
    `;
    settingsMenu.appendChild(themeItem);

    document.body.appendChild(settingsMenu);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    // Star buttons should NOT be injected into settings menu items
    expect(settingsItem.querySelector('.gv-default-star-btn')).toBeNull();
    expect(themeItem.querySelector('.gv-default-star-btn')).toBeNull();
  });

  it('does not inject star buttons into the theme submenu (menuitemradio without model markers)', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // Simulate the Gemini theme picker submenu (has menuitemradio but no model markers)
    const themeMenu = document.createElement('div');
    themeMenu.className = 'mat-mdc-menu-panel';
    themeMenu.setAttribute('role', 'menu');

    const systemItem = document.createElement('button');
    systemItem.setAttribute('role', 'menuitemradio');
    systemItem.setAttribute('aria-checked', 'false');
    systemItem.innerHTML = `
      <span class="mat-mdc-menu-item-text">
        <span class="menu-item-title-with-trailing-component">
          <span class="gds-label-l">系统</span>
        </span>
      </span>
    `;
    themeMenu.appendChild(systemItem);

    const darkItem = document.createElement('button');
    darkItem.setAttribute('role', 'menuitemradio');
    darkItem.setAttribute('aria-checked', 'true');
    darkItem.innerHTML = `
      <span class="mat-mdc-menu-item-text">
        <span class="menu-item-title-with-trailing-component">
          <span class="gds-label-l">深色</span>
        </span>
      </span>
    `;
    themeMenu.appendChild(darkItem);

    document.body.appendChild(themeMenu);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    // Star buttons should NOT be injected into theme menu items
    expect(systemItem.querySelector('.gv-default-star-btn')).toBeNull();
    expect(darkItem.querySelector('.gv-default-star-btn')).toBeNull();
  });

  it('injects star buttons into the 2026 redesigned overlay (gem-menu-item + .label-container)', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const container = document.createElement('div');
    container.className = 'container';

    const item = document.createElement('gem-menu-item');
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-mode-id', 'e6fa609c3fa255c0');
    item.innerHTML = `
      <gem-menu-item-content class="checkmark-only">
        <div class="leading-container"></div>
        <div class="label-container">
          <span class="label">3.1 Pro</span>
          <div class="sublabel">Advanced math &amp; code</div>
        </div>
        <div class="trailing-container"></div>
      </gem-menu-item-content>
    `;

    container.appendChild(item);
    pane.appendChild(container);
    document.body.appendChild(pane);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();
  });

  it('auto-locks in the 2026 redesigned overlay layout (.selected, .label, .cdk-overlay-pane)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: {
            id: 'e6fa609c3fa255c0',
            name: '3.1 Pro',
          },
        });
      },
    );

    history.replaceState({}, '', '/u/0/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const container = document.createElement('div');
    container.className = 'container';

    const flashItem = document.createElement('gem-menu-item');
    flashItem.setAttribute('role', 'menuitem');
    flashItem.setAttribute('data-mode-id', '56fdd199312815e2');
    flashItem.classList.add('selected');
    flashItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3 Flash</span></div>
      </gem-menu-item-content>
    `;
    flashItem.click = vi.fn();

    const proItem = document.createElement('gem-menu-item');
    proItem.setAttribute('role', 'menuitem');
    proItem.setAttribute('data-mode-id', 'e6fa609c3fa255c0');
    proItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3.1 Pro</span></div>
      </gem-menu-item-content>
    `;
    proItem.click = vi.fn();

    container.appendChild(flashItem);
    container.appendChild(proItem);
    pane.appendChild(container);
    document.body.appendChild(pane);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(proItem.click).toHaveBeenCalledTimes(1);
    expect(flashItem.click).toHaveBeenCalledTimes(0);
  });

  it('does not re-click an already-selected item in the 2026 redesign (.selected class)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: {
            id: 'e6fa609c3fa255c0',
            name: '3.1 Pro',
          },
        });
      },
    );

    history.replaceState({}, '', '/u/0/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    selectorBtn.textContent = 'Flash'; // trigger label may not match the chosen model
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    const container = document.createElement('div');
    container.className = 'container';

    const proItem = document.createElement('gem-menu-item');
    proItem.setAttribute('role', 'menuitem');
    proItem.setAttribute('data-mode-id', 'e6fa609c3fa255c0');
    proItem.classList.add('selected');
    proItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3.1 Pro</span></div>
      </gem-menu-item-content>
    `;
    proItem.click = vi.fn();

    container.appendChild(proItem);
    pane.appendChild(container);
    document.body.appendChild(pane);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(1500);

    expect(proItem.click).toHaveBeenCalledTimes(0);
  });

  it('injects star buttons on Thinking level submenu items (Standard/Extended)', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // Main menu pane (containing the trigger row)
    const mainPane = document.createElement('div');
    mainPane.className = 'cdk-overlay-pane';
    const mainContainer = document.createElement('div');
    mainContainer.className = 'container';

    const thinkingRow = document.createElement('gem-menu-item');
    thinkingRow.setAttribute('role', 'menuitem');
    thinkingRow.setAttribute('value', 'thinking_level');
    thinkingRow.setAttribute('aria-haspopup', 'true');
    thinkingRow.setAttribute('aria-controls', 'ng-menu-test-thinking');
    thinkingRow.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">Thinking level</span></div>
      </gem-menu-item-content>
    `;
    mainContainer.appendChild(thinkingRow);
    mainPane.appendChild(mainContainer);
    document.body.appendChild(mainPane);

    // Submenu pane (Standard/Extended)
    const submenuPane = document.createElement('div');
    submenuPane.className = 'cdk-overlay-pane';
    const submenuList = document.createElement('div');
    submenuList.id = 'ng-menu-test-thinking';
    submenuList.setAttribute('role', 'menu');

    const standard = document.createElement('gem-menu-item');
    standard.setAttribute('role', 'menuitem');
    standard.classList.add('selected');
    standard.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">Standard</span></div>
      </gem-menu-item-content>
    `;
    const extended = document.createElement('gem-menu-item');
    extended.setAttribute('role', 'menuitem');
    extended.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">Extended</span></div>
      </gem-menu-item-content>
    `;
    submenuList.appendChild(standard);
    submenuList.appendChild(extended);
    submenuPane.appendChild(submenuList);
    document.body.appendChild(submenuPane);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    expect(standard.querySelector('.gv-default-star-btn')).not.toBeNull();
    expect(extended.querySelector('.gv-default-star-btn')).not.toBeNull();
  });

  it('fast-path: trigger pill short label ("Pro") matches stored long name ("3.1 Pro")', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: { id: 'e6fa609c3fa255c0', name: '3.1 Pro' },
          gvDefaultThinkingLevel: { index: 0, label: 'Standard' },
        });
      },
    );

    history.replaceState({}, '', '/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    // Trigger pill shows the short label that Gemini uses, not the menu's long name.
    selectorBtn.textContent = 'Pro';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(3000);

    // Must NOT have re-clicked the trigger; the user already has Pro + Standard.
    expect(selectorBtn.click).toHaveBeenCalledTimes(0);
  });

  it('fast-path: trigger pill text matches stored model + thinking level → no menu click', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (key: unknown, callback: (items: Record<string, unknown>) => void) => {
        if (key === 'gvDefaultModel' || (Array.isArray(key) && key.includes('gvDefaultModel'))) {
          callback({
            gvDefaultModel: { id: 'e6fa609c3fa255c0', name: '3.1 Pro' },
            gvDefaultThinkingLevel: { index: 1, label: 'Extended' },
          });
          return;
        }
        if (
          key === 'gvDefaultThinkingLevel' ||
          (Array.isArray(key) && key.includes('gvDefaultThinkingLevel'))
        ) {
          callback({ gvDefaultThinkingLevel: { index: 1, label: 'Extended' } });
          return;
        }
        callback({});
      },
    );

    history.replaceState({}, '', '/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    // Two-line trigger pill: model on line 1, thinking level on line 2
    selectorBtn.textContent = '3.1 Pro\nExtended';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(1500);

    expect(selectorBtn.click).toHaveBeenCalledTimes(0);
  });

  it('auto-locks Thinking level by opening submenu and clicking the target item', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultThinkingLevel: { index: 1, label: 'Extended' },
        });
      },
    );

    history.replaceState({}, '', '/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    selectorBtn.textContent = 'Flash'; // No thinking-level line → not at Extended
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    // Main pane with thinking row
    const mainPane = document.createElement('div');
    mainPane.className = 'cdk-overlay-pane';
    const modelItem = document.createElement('gem-menu-item');
    modelItem.setAttribute('role', 'menuitem');
    modelItem.setAttribute('data-mode-id', '56fdd199312815e2');
    modelItem.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">3 Flash</span></div></gem-menu-item-content>`;
    const thinkingRow = document.createElement('gem-menu-item');
    thinkingRow.setAttribute('role', 'menuitem');
    thinkingRow.setAttribute('value', 'thinking_level');
    thinkingRow.setAttribute('aria-haspopup', 'true');
    thinkingRow.setAttribute('aria-controls', 'ng-menu-thinking-2');
    thinkingRow.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">Thinking level</span></div></gem-menu-item-content>`;
    thinkingRow.click = vi.fn();
    mainPane.appendChild(modelItem);
    mainPane.appendChild(thinkingRow);
    document.body.appendChild(mainPane);

    // Submenu pane
    const submenuPane = document.createElement('div');
    submenuPane.className = 'cdk-overlay-pane';
    const submenuList = document.createElement('div');
    submenuList.id = 'ng-menu-thinking-2';

    const standard = document.createElement('gem-menu-item');
    standard.setAttribute('role', 'menuitem');
    standard.classList.add('selected');
    standard.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">Standard</span></div></gem-menu-item-content>`;
    standard.click = vi.fn();

    const extended = document.createElement('gem-menu-item');
    extended.setAttribute('role', 'menuitem');
    extended.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">Extended</span></div></gem-menu-item-content>`;
    extended.click = vi.fn();

    submenuList.appendChild(standard);
    submenuList.appendChild(extended);
    submenuPane.appendChild(submenuList);
    document.body.appendChild(submenuPane);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // First tick (1s) — should detect thinking mismatch and call thinkingRow.click() and extended.click()
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(thinkingRow.click).toHaveBeenCalledTimes(1);
    expect(extended.click).toHaveBeenCalledTimes(1);
    expect(standard.click).toHaveBeenCalledTimes(0);
  });

  it('does not inject star on the "Thinking level" submenu opener (aria-haspopup=true, no data-mode-id)', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    const container = document.createElement('div');
    container.className = 'container';

    const modelItem = document.createElement('gem-menu-item');
    modelItem.setAttribute('role', 'menuitem');
    modelItem.setAttribute('data-mode-id', 'e6fa609c3fa255c0');
    modelItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3.1 Pro</span></div>
      </gem-menu-item-content>
    `;

    // Submenu trigger row — has a label, has role=menuitem, but no data-mode-id and aria-haspopup="true".
    const thinkingLevel = document.createElement('gem-menu-item');
    thinkingLevel.setAttribute('role', 'menuitem');
    thinkingLevel.setAttribute('aria-haspopup', 'true');
    thinkingLevel.setAttribute('aria-expanded', 'false');
    thinkingLevel.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">Thinking level</span><div class="sublabel">Standard</div></div>
        <div class="trailing-container"><gem-icon>arrow_right</gem-icon></div>
      </gem-menu-item-content>
    `;

    container.appendChild(modelItem);
    container.appendChild(thinkingLevel);
    pane.appendChild(container);
    document.body.appendChild(pane);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    expect(modelItem.querySelector('.gv-default-star-btn')).not.toBeNull();
    expect(thinkingLevel.querySelector('.gv-default-star-btn')).toBeNull();
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
