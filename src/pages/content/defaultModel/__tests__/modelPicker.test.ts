import { describe, expect, it, vi } from 'vitest';

import { setupModelLockerTests } from './modelLockerHarness';

describe('ModelPicker.selectModel', () => {
  const { selectModel } = setupModelLockerTests();

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

    await selectModel();

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

    await selectModel();

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

    await selectModel();

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

    await selectModel();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(thinkingItem.click).toHaveBeenCalledTimes(1);
    expect(proItem.click).toHaveBeenCalledTimes(0);
  });

  it('follows a Gemini rename on the same mode id (3.8 Flash -> 3.9 Flash)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        // Starred back when Gemini called this row "3.8 Flash".
        callback({ gvDefaultModel: { id: 'flash-slot-id', name: '3.8 Flash' } });
      },
    );
    const setSpy = chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>;
    setSpy.mockClear();

    history.replaceState({}, '', '/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    // Same slot, renamed by Google.
    const renamedItem = document.createElement('gem-menu-item');
    renamedItem.setAttribute('role', 'menuitem');
    renamedItem.setAttribute('data-mode-id', 'flash-slot-id');
    renamedItem.classList.add('selected');
    renamedItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3.9 Flash</span></div>
      </gem-menu-item-content>
    `;
    renamedItem.click = vi.fn();

    pane.appendChild(renamedItem);
    document.body.appendChild(pane);

    await selectModel();

    await vi.advanceTimersByTimeAsync(1500);

    expect(renamedItem.click).toHaveBeenCalledTimes(0);

    const writes = setSpy.mock.calls.map(([payload]) => payload as Record<string, unknown>);
    expect(writes).toContainEqual({
      gvDefaultModel: { id: 'flash-slot-id', name: '3.9 Flash', pill: 'Flash' },
    });
  });

  it('never learns a trigger label that is not the model own short form', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({ gvDefaultModel: { id: 'pro-id', name: '3.1 Pro' } });
      },
    );
    const setSpy = chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>;
    setSpy.mockClear();

    history.replaceState({}, '', '/app');

    // A trigger that disagrees with the selected row (stale render or a layout
    // we do not model): learning "Flash" for 3.1 Pro would teach the fast path
    // to confirm the wrong model forever.
    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const proItem = document.createElement('gem-menu-item');
    proItem.setAttribute('role', 'menuitem');
    proItem.setAttribute('data-mode-id', 'pro-id');
    proItem.classList.add('selected');
    proItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3.1 Pro</span></div>
      </gem-menu-item-content>
    `;
    proItem.click = vi.fn();

    pane.appendChild(proItem);
    document.body.appendChild(pane);

    await selectModel();

    await vi.advanceTimersByTimeAsync(1500);

    const writes = setSpy.mock.calls.map(([payload]) => payload as Record<string, unknown>);
    expect(writes.some((payload) => 'gvDefaultModel' in payload)).toBe(false);
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

    await selectModel();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(proItem.click).toHaveBeenCalledTimes(1);
    expect(flashItem.click).toHaveBeenCalledTimes(0);
  });
});
