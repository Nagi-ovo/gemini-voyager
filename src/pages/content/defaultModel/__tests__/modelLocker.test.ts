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

  it('skips sidebar subtree scans when Gemini renders conversation rows', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const sidebar = document.createElement('div');
    sidebar.setAttribute('data-test-id', 'overflow-container');
    const querySelectorSpy = vi.spyOn(sidebar, 'querySelector');
    const querySelectorAllSpy = vi.spyOn(sidebar, 'querySelectorAll');

    for (let i = 0; i < 20; i++) {
      const row = document.createElement('gem-nav-list-item');
      row.setAttribute('data-test-id', 'conversation');
      row.textContent = `Conversation ${i}`;
      sidebar.appendChild(row);
    }
    document.body.appendChild(sidebar);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    expect(querySelectorSpy).not.toHaveBeenCalled();
    expect(querySelectorAllSpy).not.toHaveBeenCalled();
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

  it('does not auto-switch model after the user starts typing in the chat input', async () => {
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

    input.textContent = 'hello';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(1500);

    expect(selectorBtn.click).not.toHaveBeenCalled();
    expect(proItem.click).not.toHaveBeenCalled();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('does not auto-switch model during recent chat-input key activity', async () => {
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

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));

    await vi.advanceTimersByTimeAsync(1500);

    expect(selectorBtn.click).not.toHaveBeenCalled();
    expect(proItem.click).not.toHaveBeenCalled();
    expect(focusSpy).not.toHaveBeenCalled();
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

  it('does not skip specific Flash variants when the trigger only says Flash', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: {
            id: 'flash-35-id',
            name: '3.5 Flash',
          },
        });
      },
    );

    history.replaceState({}, '', '/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const currentFlashItem = document.createElement('gem-menu-item');
    currentFlashItem.setAttribute('role', 'menuitem');
    currentFlashItem.setAttribute('data-mode-id', 'flash-lite-id');
    currentFlashItem.classList.add('selected');
    currentFlashItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3.1 Flash-Lite</span></div>
      </gem-menu-item-content>
    `;
    currentFlashItem.click = vi.fn();

    const targetFlashItem = document.createElement('gem-menu-item');
    targetFlashItem.setAttribute('role', 'menuitem');
    targetFlashItem.setAttribute('data-mode-id', 'flash-35-id');
    targetFlashItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3.5 Flash</span></div>
      </gem-menu-item-content>
    `;
    targetFlashItem.click = vi.fn();

    pane.append(currentFlashItem, targetFlashItem);
    document.body.appendChild(pane);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(1500);

    expect(selectorBtn.click).toHaveBeenCalledTimes(1);
    expect(targetFlashItem.click).toHaveBeenCalledTimes(1);
    expect(currentFlashItem.click).toHaveBeenCalledTimes(0);
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

  it('does not inject star buttons into Gemini table options menu DOM', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    document.body.insertAdjacentHTML(
      'beforeend',
      `
        <div class="cdk-overlay-container">
          <div class="cdk-global-overlay-wrapper" dir="ltr">
            <div class="cdk-overlay-pane">
              <gem-menu role="menu" class="mat-mdc-menu-panel">
                <gem-menu-item role="menuitem" jslog="121782;track:deadbeefcafebabe">
                  <gem-menu-item-content>
                    <div class="leading-container">
                      <gem-icon>
                        <mat-icon class="mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font" fonticon="content_copy" role="img"></mat-icon>
                      </gem-icon>
                    </div>
                    <div class="label-container"><span class="label"><span>复制表格</span></span></div>
                    <div class="trailing-container"></div>
                  </gem-menu-item-content>
                </gem-menu-item>
                <gem-menu-item role="menuitem" jslog="121783;track:0123456789abcdef">
                  <gem-menu-item-content>
                    <div class="leading-container">
                      <gem-icon>
                        <mat-icon class="mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font" fonticon="open_in_new" role="img"></mat-icon>
                      </gem-icon>
                    </div>
                    <div class="label-container"><span class="label"><span>在表格中打开</span></span></div>
                    <div class="trailing-container"></div>
                  </gem-menu-item-content>
                </gem-menu-item>
              </gem-menu>
            </div>
          </div>
        </div>
      `,
    );

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const pane = document.querySelector<HTMLElement>('.cdk-overlay-pane');
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('gem-menu-item[role="menuitem"]'),
    );
    expect(pane).not.toBeNull();
    expect(items).toHaveLength(2);
    expect(pane?.querySelector('.gv-default-star-btn')).toBeNull();
    expect(items.map((item) => item.textContent?.trim())).toEqual(['复制表格', '在表格中打开']);
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

  it('reveals only the star owned by the hovered menu item', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const parent = document.createElement('gem-menu-item');
    parent.setAttribute('role', 'menuitem');
    parent.setAttribute('data-mode-id', 'parent-model-id');
    parent.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">Parent Model</span></div>
      </gem-menu-item-content>
    `;

    const child = document.createElement('gem-menu-item');
    child.setAttribute('role', 'menuitem');
    child.setAttribute('data-mode-id', 'child-model-id');
    child.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">Child Model</span></div>
      </gem-menu-item-content>
    `;

    parent.appendChild(child);
    pane.appendChild(parent);
    document.body.appendChild(pane);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const starForLabel = (labelText: string) => {
      const label = Array.from(pane.querySelectorAll<HTMLElement>('.label')).find(
        (el) => el.textContent === labelText,
      );
      return label
        ?.closest('.gv-title-wrapper')
        ?.querySelector<HTMLElement>('.gv-default-star-btn');
    };

    const parentStar = starForLabel('Parent Model');
    const childStar = starForLabel('Child Model');
    expect(parentStar).toBeTruthy();
    expect(childStar).toBeTruthy();

    parent.dispatchEvent(new MouseEvent('mouseenter'));

    expect(parentStar?.classList.contains('is-owner-hovered')).toBe(true);
    expect(childStar?.classList.contains('is-owner-hovered')).toBe(false);
  });

  it('injects star buttons when the CDK position wrapper is the added node', async () => {
    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const wrapper = document.createElement('div');
    wrapper.className = 'cdk-overlay-connected-position-bounding-box';

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const item = document.createElement('gem-menu-item');
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-mode-id', 'e6fa609c3fa255c0');
    item.innerHTML = `
      <gem-menu-item-content class="checkmark-only">
        <div class="label-container">
          <span class="label">3.1 Pro</span>
        </div>
      </gem-menu-item-content>
    `;

    pane.appendChild(item);
    wrapper.appendChild(pane);
    document.body.appendChild(wrapper);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();
  });

  it('injects star buttons when a populated child is added inside an existing CDK pane', async () => {
    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    document.body.appendChild(pane);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const container = document.createElement('div');
    container.className = 'container';

    const item = document.createElement('gem-menu-item');
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-mode-id', 'e6fa609c3fa255c0');
    item.innerHTML = `
      <gem-menu-item-content class="checkmark-only">
        <div class="label-container">
          <span class="label">3.1 Pro</span>
        </div>
      </gem-menu-item-content>
    `;

    container.appendChild(item);
    pane.appendChild(container);

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
    expect(selectorBtn.click).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(selectorBtn.click).toHaveBeenCalledTimes(1);
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

  const buildThinkingSubmenu = (submenuId: string) => {
    const mainPane = document.createElement('div');
    mainPane.className = 'cdk-overlay-pane';
    const thinkingRow = document.createElement('gem-menu-item');
    thinkingRow.setAttribute('role', 'menuitem');
    thinkingRow.setAttribute('value', 'thinking_level');
    thinkingRow.setAttribute('aria-haspopup', 'true');
    thinkingRow.setAttribute('aria-controls', submenuId);
    thinkingRow.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">Thinking level</span></div>
      </gem-menu-item-content>
    `;
    mainPane.appendChild(thinkingRow);
    document.body.appendChild(mainPane);

    const submenuPane = document.createElement('div');
    submenuPane.className = 'cdk-overlay-pane';
    const submenuList = document.createElement('div');
    submenuList.id = submenuId;
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
    submenuList.append(standard, extended);
    submenuPane.appendChild(submenuList);
    document.body.appendChild(submenuPane);

    return { standard, extended };
  };

  it('marks only one thinking level default when the stored index and label disagree', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        // Drifted pairing: label says Extended, but the stored index points at Standard.
        // The old OR-match lit BOTH stars; the label must win and mark exactly one.
        callback({ gvDefaultThinkingLevel: { index: 0, label: 'Extended' } });
      },
    );

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const { standard, extended } = buildThinkingSubmenu('ng-menu-double-star');

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const standardStar = standard.querySelector<HTMLElement>('.gv-default-star-btn');
    const extendedStar = extended.querySelector<HTMLElement>('.gv-default-star-btn');
    expect(standardStar).not.toBeNull();
    expect(extendedStar).not.toBeNull();
    expect(extendedStar?.classList.contains('is-default')).toBe(true);
    expect(standardStar?.classList.contains('is-default')).toBe(false);
  });

  it('falls back to the stored index when the stored thinking label matches no row', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        // Label from a previous UI language no longer matches any row → index wins.
        callback({ gvDefaultThinkingLevel: { index: 1, label: 'Reasoning' } });
      },
    );

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const { standard, extended } = buildThinkingSubmenu('ng-menu-index-fallback');

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const standardStar = standard.querySelector<HTMLElement>('.gv-default-star-btn');
    const extendedStar = extended.querySelector<HTMLElement>('.gv-default-star-btn');
    expect(extendedStar?.classList.contains('is-default')).toBe(true);
    expect(standardStar?.classList.contains('is-default')).toBe(false);
  });

  it('never enforces the page-default Standard thinking level (no picker churn)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        // Standard is Gemini's built-in default thinking level. Even when the
        // user has starred it, locking to it is a no-op that must never open the
        // picker — that churn was the "flashes open on an already-correct chat" bug.
        callback({
          gvDefaultModel: 'Flash',
          gvDefaultThinkingLevel: { index: 0, label: 'Standard' },
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

    await vi.advanceTimersByTimeAsync(3000);

    expect(selectorBtn.click).not.toHaveBeenCalled();
  });

  it('does not open the picker while the trigger pill is still empty (no load-time flash)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({ gvDefaultModel: { id: 'e6fa609c3fa255c0', name: '3.1 Pro' } });
      },
    );

    history.replaceState({}, '', '/app');

    // Trigger button exists but its label has not painted yet (early load). A
    // blind menu-open here — then finding Pro already selected and closing —
    // was the intermittent flash that left a focus ring on the pill.
    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    selectorBtn.textContent = '';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(3000);

    expect(selectorBtn.click).not.toHaveBeenCalled();
  });

  it('treats inline Thinking level choices as thinking stars, not model stars', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: { id: 'flash-model-id', name: '3.5 Flash' },
          gvDefaultThinkingLevel: { index: 0, label: 'Standard' },
        });
      },
    );

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const modelItem = document.createElement('gem-menu-item');
    modelItem.setAttribute('role', 'menuitem');
    modelItem.setAttribute('data-mode-id', 'flash-model-id');
    modelItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3.5 Flash</span></div>
      </gem-menu-item-content>
    `;

    const thinkingRow = document.createElement('gem-menu-item');
    thinkingRow.setAttribute('role', 'menuitem');
    thinkingRow.setAttribute('value', 'thinking_level');
    thinkingRow.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container">
          <span class="label">Thinking level</span>
          <span class="sublabel">Standard</span>
        </div>
      </gem-menu-item-content>
    `;

    const standard = document.createElement('gem-menu-item');
    standard.setAttribute('role', 'menuitem');
    standard.setAttribute('data-mode-id', 'flash-model-id');
    standard.classList.add('selected');
    standard.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">Standard</span></div>
      </gem-menu-item-content>
    `;

    const extended = document.createElement('gem-menu-item');
    extended.setAttribute('role', 'menuitem');
    extended.setAttribute('data-mode-id', 'flash-model-id');
    extended.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">Extended</span></div>
      </gem-menu-item-content>
    `;

    thinkingRow.append(standard, extended);
    pane.append(modelItem, thinkingRow);
    document.body.appendChild(pane);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const modelStar = modelItem.querySelector<HTMLElement>('.gv-default-star-btn');
    const standardStar = standard.querySelector<HTMLElement>('.gv-default-star-btn');
    const extendedStar = extended.querySelector<HTMLElement>('.gv-default-star-btn');

    expect(modelStar?.title).toBe('cancelDefaultModel');
    expect(standardStar?.title).toBe('cancelDefaultThinkingLevel');
    expect(extendedStar?.title).toBe('setAsDefaultThinkingLevel');
    expect(standardStar?.classList.contains('is-default')).toBe(true);
    expect(extendedStar?.classList.contains('is-default')).toBe(false);
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

  it('fast-path: button found via .input-area-switch-label still skips menu click (#756)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: { id: 'e6fa609c3fa255c0', name: '3.1 Pro' },
        });
      },
    );

    history.replaceState({}, '', '/app');

    // Use .input-area-switch-label instead of data-test-id="bard-mode-menu-button"
    // to verify the shared findSelectorButton() helper covers all selectors.
    const selectorBtn = document.createElement('div');
    selectorBtn.className = 'input-area-switch-label';
    selectorBtn.textContent = 'Pro';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(3000);

    // Must NOT have re-clicked the trigger — fast-path should recognise "Pro" === "3.1 Pro".
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

    const mountSubmenu = vi.fn(() => {
      if (!document.body.contains(submenuPane)) {
        document.body.appendChild(submenuPane);
      }
    });
    thinkingRow.addEventListener('mouseover', mountSubmenu);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    // First tick (1s) — should detect thinking mismatch and call thinkingRow.click() and extended.click()
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(thinkingRow.click).toHaveBeenCalledTimes(1);
    expect(mountSubmenu).toHaveBeenCalled();
    expect(extended.click).toHaveBeenCalledTimes(1);
    expect(standard.click).toHaveBeenCalledTimes(0);
  });

  it('backs off when Thinking level clicks do not move the pill', async () => {
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
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

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
    thinkingRow.setAttribute('aria-controls', 'ng-menu-thinking-loop');
    thinkingRow.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">Thinking level</span></div></gem-menu-item-content>`;
    thinkingRow.click = vi.fn();
    mainPane.append(modelItem, thinkingRow);
    document.body.appendChild(mainPane);

    const submenuPane = document.createElement('div');
    submenuPane.className = 'cdk-overlay-pane';
    const submenuList = document.createElement('div');
    submenuList.id = 'ng-menu-thinking-loop';
    const standard = document.createElement('gem-menu-item');
    standard.setAttribute('role', 'menuitem');
    standard.classList.add('selected');
    standard.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">Standard</span></div></gem-menu-item-content>`;
    const extended = document.createElement('gem-menu-item');
    extended.setAttribute('role', 'menuitem');
    extended.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">Extended</span></div></gem-menu-item-content>`;
    extended.click = vi.fn();
    submenuList.append(standard, extended);
    submenuPane.appendChild(submenuList);
    document.body.appendChild(submenuPane);

    const { default: DefaultModelManager } = await import('../modelLocker');
    await DefaultModelManager.getInstance().init();
    destroyManager = () => DefaultModelManager.getInstance().destroy();

    await vi.advanceTimersByTimeAsync(5000);
    const clicksAfterBackoff = (extended.click as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(clicksAfterBackoff).toBeGreaterThan(0);
    expect(clicksAfterBackoff).toBeLessThanOrEqual(3);
    expect(document.querySelectorAll('.gv-default-model-fail-toast').length).toBe(1);

    await vi.advanceTimersByTimeAsync(10000);
    expect((extended.click as ReturnType<typeof vi.fn>).mock.calls.length).toBe(clicksAfterBackoff);
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

  it('stops retrying when clicks do not move the pill (quota-exhausted model) — #761', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: { id: 'e6fa609c3fa255c0', name: '3.1 Pro' },
        });
      },
    );

    history.replaceState({}, '', '/u/0/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    // The pill stays on "Flash" no matter how many times Pro is clicked.
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    const container = document.createElement('div');
    container.className = 'container';

    const proItem = document.createElement('gem-menu-item');
    proItem.setAttribute('role', 'menuitem');
    proItem.setAttribute('data-mode-id', 'e6fa609c3fa255c0');
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

    await vi.advanceTimersByTimeAsync(5000);

    const clicksAfterBackoff = (proItem.click as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(selectorBtn.textContent).toBe('Flash');
    expect(clicksAfterBackoff).toBeGreaterThan(0);
    expect(clicksAfterBackoff).toBeLessThanOrEqual(3);
    expect(document.querySelectorAll('.gv-default-model-fail-toast').length).toBe(1);

    await vi.advanceTimersByTimeAsync(25000);
    expect((proItem.click as ReturnType<typeof vi.fn>).mock.calls.length).toBe(clicksAfterBackoff);
  });

  describe('auto-apply kill switch', () => {
    function mockSyncGet(stored: Record<string, unknown>) {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_keys: unknown, callback: (items: Record<string, unknown>) => void) => callback(stored),
      );
    }

    it('does not start the lock loop when gvDefaultModelAutoApply is false', async () => {
      mockSyncGet({
        gvDefaultModel: { id: 'mid-1', name: 'Model 1' },
        gvDefaultModelAutoApply: false,
      });

      history.replaceState({}, '', '/app');

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      // Wait for the init-time checkAndLockModel to settle.
      await vi.advanceTimersByTimeAsync(200);

      const internal = instance as unknown as { checkTimer: number | null };
      expect(internal.checkTimer).toBeNull();
    });

    it('resumes the lock loop after gvDefaultModelAutoApply flips from false to true via storage change', async () => {
      mockSyncGet({
        gvDefaultModel: { id: 'mid-2', name: 'Model 2' },
        gvDefaultModelAutoApply: false,
      });

      history.replaceState({}, '', '/app');

      const onChangedAdd = chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>;
      onChangedAdd.mockClear();

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      await vi.advanceTimersByTimeAsync(200);
      const internal = instance as unknown as { checkTimer: number | null };
      expect(internal.checkTimer).toBeNull();

      // Simulate the popup flipping the toggle ON.
      const listener = onChangedAdd.mock.calls[0]?.[0] as
        | ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
        | undefined;
      expect(listener).toBeTypeOf('function');
      listener!({ gvDefaultModelAutoApply: { newValue: true } }, 'sync');

      // Trigger a fresh navigation so checkAndLockModel runs again.
      history.pushState({}, '', '/app');
      await vi.advanceTimersByTimeAsync(200);

      expect(internal.checkTimer).not.toBeNull();
    });

    it('skips star button injection when the toggle is off at init time', async () => {
      mockSyncGet({
        gvDefaultModelAutoApply: false,
      });

      const { default: DefaultModelManager } = await import('../modelLocker');
      await DefaultModelManager.getInstance().init();
      destroyManager = () => DefaultModelManager.getInstance().destroy();

      const menuPanel = document.createElement('div');
      menuPanel.className = 'mat-mdc-menu-panel';
      menuPanel.setAttribute('role', 'menu');
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitemradio');
      item.innerHTML = `
        <div class="title-and-description">
          <div class="mode-title">Model A</div>
        </div>
      `;
      menuPanel.appendChild(item);
      document.body.appendChild(menuPanel);

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);

      expect(item.querySelector('.gv-default-star-btn')).toBeNull();
    });

    it('sweeps already-injected star buttons when the toggle flips off', async () => {
      mockSyncGet({
        gvDefaultModel: { id: 'mid-x', name: 'Model X' },
        // flag absent → enabled
      });

      const onChangedAdd = chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>;
      onChangedAdd.mockClear();

      const { default: DefaultModelManager } = await import('../modelLocker');
      await DefaultModelManager.getInstance().init();
      destroyManager = () => DefaultModelManager.getInstance().destroy();

      const menuPanel = document.createElement('div');
      menuPanel.className = 'mat-mdc-menu-panel';
      menuPanel.setAttribute('role', 'menu');
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitemradio');
      item.innerHTML = `
        <div class="title-and-description">
          <div class="mode-title">Model X</div>
        </div>
      `;
      menuPanel.appendChild(item);
      document.body.appendChild(menuPanel);

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
      expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();

      const listener = onChangedAdd.mock.calls[0]?.[0] as
        | ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
        | undefined;
      listener!({ gvDefaultModelAutoApply: { newValue: false } }, 'sync');

      expect(item.querySelector('.gv-default-star-btn')).toBeNull();
    });

    it('renders a failure toast once after maxConsecutiveFailures threshold is crossed', async () => {
      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      // Drive the consecutive-failure counter through the helper directly —
      // the runtime path that increments it is exercised by other tests
      // (e.g. the "stops retrying after consecutive failures" case in the
      // outer describe), but we want a focused assertion on the toast UI.
      const internal = instance as unknown as {
        consecutiveFailures: number;
        maxConsecutiveFailures: number;
        maybeNotifyAutoApplyFailure: () => void;
      };

      internal.consecutiveFailures = internal.maxConsecutiveFailures;
      internal.maybeNotifyAutoApplyFailure();

      const toasts = document.querySelectorAll('.gv-default-model-fail-toast');
      expect(toasts.length).toBe(1);

      // Calling again must NOT stack a second toast.
      internal.maybeNotifyAutoApplyFailure();
      expect(document.querySelectorAll('.gv-default-model-fail-toast').length).toBe(1);
    });

    it('toast action button sends gv.openPopup runtime message', async () => {
      const sendMessageMock = vi.fn().mockResolvedValue({ ok: true });
      (
        chrome as unknown as { runtime: { sendMessage: typeof sendMessageMock } }
      ).runtime.sendMessage = sendMessageMock;

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      const internal = instance as unknown as {
        consecutiveFailures: number;
        maxConsecutiveFailures: number;
        maybeNotifyAutoApplyFailure: () => void;
      };
      internal.consecutiveFailures = internal.maxConsecutiveFailures;
      internal.maybeNotifyAutoApplyFailure();

      const button = document.querySelector(
        '.gv-default-model-fail-toast button',
      ) as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      button!.click();

      // Let the click handler's microtask run.
      await Promise.resolve();
      await Promise.resolve();

      expect(sendMessageMock).toHaveBeenCalledWith({ type: 'gv.openPopup' });
    });

    it('toast falls back to manual-open text when openPopup is rejected', async () => {
      const sendMessageMock = vi.fn().mockResolvedValue({ ok: false });
      (
        chrome as unknown as { runtime: { sendMessage: typeof sendMessageMock } }
      ).runtime.sendMessage = sendMessageMock;

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      const internal = instance as unknown as {
        consecutiveFailures: number;
        maxConsecutiveFailures: number;
        maybeNotifyAutoApplyFailure: () => void;
      };
      internal.consecutiveFailures = internal.maxConsecutiveFailures;
      internal.maybeNotifyAutoApplyFailure();

      const toast = document.querySelector('.gv-default-model-fail-toast') as HTMLElement;
      const button = toast.querySelector('button') as HTMLButtonElement;
      const textSpan = toast.querySelector('span') as HTMLSpanElement;

      button.click();
      await Promise.resolve();
      await Promise.resolve();

      // Button removed, fallback text rendered (i18n mock returns the key as the message).
      expect(toast.querySelector('button')).toBeNull();
      expect(textSpan.textContent).toBe('defaultModelAutoApplyFailedFallback');
    });

    it('observer ignores menu mutations when the toggle is off (no scheduled injection)', async () => {
      mockSyncGet({ gvDefaultModelAutoApply: false });

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      // Mounting a menu panel that would normally trigger the inject path.
      const menuPanel = document.createElement('div');
      menuPanel.className = 'mat-mdc-menu-panel';
      menuPanel.setAttribute('role', 'menu');
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitemradio');
      item.innerHTML = `
        <div class="title-and-description">
          <div class="mode-title">Pro</div>
        </div>
      `;
      menuPanel.appendChild(item);
      document.body.appendChild(menuPanel);

      // Generous wait: the retry loop would normally tick up to 10× 50ms.
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1000);

      // Hard expectation: zero stars, zero pending injection state.
      expect(menuPanel.querySelectorAll('.gv-default-star-btn').length).toBe(0);
      const internal = instance as unknown as {
        menuPanelInjectAttempts: WeakMap<HTMLElement, number>;
      };
      expect(internal.menuPanelInjectAttempts.get(menuPanel) ?? 0).toBe(0);
    });

    it('panel-level sweep removes stars whose owning item is orphaned', async () => {
      mockSyncGet({ gvDefaultModel: { id: 'mid-z', name: 'Pro' } });

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      // Build a panel where a stale item carries an old star, alongside a
      // fresh item that hasn't been injected yet. Simulates Gemini's view
      // recycling leaving the previous item element attached.
      const menuPanel = document.createElement('div');
      menuPanel.className = 'mat-mdc-menu-panel';
      menuPanel.setAttribute('role', 'menu');

      // Stale item — not in the current items list (e.g. removed role) but
      // still attached as a sibling, carrying an old star.
      const staleItem = document.createElement('div');
      staleItem.setAttribute('data-stale', 'true');
      // No role attribute → won't match MODE_ITEM_SELECTOR
      const staleStar = document.createElement('button');
      staleStar.className = 'gv-default-star-btn';
      staleItem.appendChild(staleStar);
      menuPanel.appendChild(staleItem);

      // Fresh item — matches the selector, no star yet.
      const freshItem = document.createElement('div');
      freshItem.setAttribute('role', 'menuitemradio');
      freshItem.innerHTML = `
        <div class="title-and-description">
          <div class="mode-title">Pro</div>
        </div>
      `;
      menuPanel.appendChild(freshItem);
      document.body.appendChild(menuPanel);

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);

      // After injection: stale star gone, exactly one fresh star on freshItem.
      expect(staleItem.querySelector('.gv-default-star-btn')).toBeNull();
      expect(menuPanel.querySelectorAll('.gv-default-star-btn').length).toBe(1);
      expect(freshItem.querySelector('.gv-default-star-btn')).not.toBeNull();
    });

    it('off-state observer sweeps stale stars in a reattached detached overlay pane', async () => {
      mockSyncGet({ gvDefaultModelAutoApply: false });

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      // Build a detached pane carrying a stale star, then attach it.
      // Simulates a CDK overlay pane that was detached at toggle-off time
      // (so the storage-onChanged sweep missed it) and now comes back into
      // the document when the user reopens the model menu.
      const stalePane = document.createElement('div');
      stalePane.className = 'cdk-overlay-pane';
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitemradio');
      item.innerHTML = `
        <div class="title-and-description">
          <div class="mode-title">Pro</div>
        </div>
      `;
      const staleStar = document.createElement('button');
      staleStar.className = 'gv-default-star-btn is-default';
      item.appendChild(staleStar);
      stalePane.appendChild(item);

      // Attach to DOM — observer should fire and sweep.
      document.body.appendChild(stalePane);

      // Flush the MutationObserver microtask + any delayed work.
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(100);

      expect(stalePane.querySelector('.gv-default-star-btn')).toBeNull();
    });

    it('off-state click on a stale star does not write to storage', async () => {
      const setSpy = chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>;
      const removeSpy = chrome.storage.sync.remove as unknown as ReturnType<typeof vi.fn>;

      mockSyncGet({
        gvDefaultModel: { id: 'mid-pro', name: 'Pro' },
        gvDefaultModelAutoApply: false,
      });

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      // Manually plant a stale star whose click handler was bound during
      // a prior on-session (we approximate that by calling handleStarClick
      // directly on a freshly constructed button).
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('data-mode-id', 'mid-flash');
      item.innerHTML = `
        <div class="title-and-description">
          <div class="mode-title">Flash</div>
        </div>
      `;
      const btn = document.createElement('button');
      btn.className = 'gv-default-star-btn';
      item.appendChild(btn);
      document.body.appendChild(item);

      setSpy.mockClear();
      removeSpy.mockClear();

      // Invoke the click path directly via the private method, simulating
      // the closure captured before the kill switch flipped off.
      const internal = instance as unknown as {
        handleStarClick: (name: string, b: HTMLElement) => Promise<void>;
      };
      await internal.handleStarClick('Flash', btn);

      // The stale star should be evicted from the DOM and no storage I/O
      // should have happened.
      expect(item.querySelector('.gv-default-star-btn')).toBeNull();
      expect(setSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('sweeps the failure toast when the toggle flips off', async () => {
      mockSyncGet({});
      const onChangedAdd = chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>;
      onChangedAdd.mockClear();

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      const internal = instance as unknown as {
        consecutiveFailures: number;
        maxConsecutiveFailures: number;
        maybeNotifyAutoApplyFailure: () => void;
      };
      internal.consecutiveFailures = internal.maxConsecutiveFailures;
      internal.maybeNotifyAutoApplyFailure();
      expect(document.querySelector('.gv-default-model-fail-toast')).not.toBeNull();

      const listener = onChangedAdd.mock.calls[0]?.[0] as
        | ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
        | undefined;
      listener!({ gvDefaultModelAutoApply: { newValue: false } }, 'sync');

      expect(document.querySelector('.gv-default-model-fail-toast')).toBeNull();
    });

    it('aborts an in-flight lock loop when the toggle flips off', async () => {
      mockSyncGet({
        gvDefaultModel: { id: 'mid-3', name: 'Model 3' },
        // flag absent → enabled by default
      });

      history.replaceState({}, '', '/app');

      const onChangedAdd = chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>;
      onChangedAdd.mockClear();

      const { default: DefaultModelManager } = await import('../modelLocker');
      const instance = DefaultModelManager.getInstance();
      await instance.init();
      destroyManager = () => instance.destroy();

      await vi.advanceTimersByTimeAsync(200);
      const internal = instance as unknown as { checkTimer: number | null };
      expect(internal.checkTimer).not.toBeNull();

      const listener = onChangedAdd.mock.calls[0]?.[0] as
        | ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
        | undefined;
      listener!({ gvDefaultModelAutoApply: { newValue: false } }, 'sync');

      expect(internal.checkTimer).toBeNull();
    });
  });
});
