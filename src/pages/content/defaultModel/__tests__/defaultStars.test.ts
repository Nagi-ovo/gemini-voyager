import { describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { setupModelLockerTests } from './modelLockerHarness';

describe('DefaultStars', () => {
  const { startStars, buildThinkingSubmenu } = setupModelLockerTests();

  it('does not query the whole document for menu panel on unrelated DOM mutations', async () => {
    const querySelectorSpy = vi.spyOn(document, 'querySelector');

    await startStars();

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
    await startStars();

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
    await startStars();

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
    await startStars();

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

  it('confirms setting and then clearing a default in a single toast', async () => {
    await startStars();
    const list = document.createElement('mat-action-list');
    list.className = 'gds-mode-switch-menu-list';
    list.setAttribute('role', 'group');
    const item = document.createElement('button');
    item.setAttribute('role', 'menuitemradio');
    item.innerHTML = `<div class="title-and-description"><div><span class="gds-title-m">Pro</span></div></div>`;
    list.appendChild(item);
    document.body.appendChild(list);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);
    const star = () => item.querySelector<HTMLButtonElement>('.gv-default-star-btn')!;

    star().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(toastDriver.messages()).toEqual(['defaultModelSet:Pro']);

    star().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(toastDriver.messages()).toEqual(['defaultModelCleared']);

    await vi.advanceTimersByTimeAsync(3000);
    expect(toastDriver.all()).toEqual([]);
  });

  it('injects star buttons when menu items use role="menuitem" instead of "menuitemradio"', async () => {
    await startStars();

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

  it('does not inject star buttons into the settings menu (desktop-settings-menu)', async () => {
    await startStars();

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
    await startStars();

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
    await startStars();

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
    await startStars();

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
    await startStars();

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
    await startStars();

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

    await startStars();

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

  it('injects star buttons on Thinking level submenu items (Standard/Extended)', async () => {
    await startStars();

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

  it('marks only one thinking level default when the stored index and label disagree', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        // Drifted pairing: label says Extended, but the stored index points at Standard.
        // The old OR-match lit BOTH stars; the label must win and mark exactly one.
        callback({ gvDefaultThinkingLevel: { index: 0, label: 'Extended' } });
      },
    );

    await startStars();

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

    await startStars();

    const { standard, extended } = buildThinkingSubmenu('ng-menu-index-fallback');

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const standardStar = standard.querySelector<HTMLElement>('.gv-default-star-btn');
    const extendedStar = extended.querySelector<HTMLElement>('.gv-default-star-btn');
    expect(extendedStar?.classList.contains('is-default')).toBe(true);
    expect(standardStar?.classList.contains('is-default')).toBe(false);
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

    await startStars();

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

  it('treats the inline Extended thinking toggle as a thinking preference (#808)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: { id: 'e6fa609c3fa255c0', name: '3.1 Pro' },
        });
      },
    );
    const setSpy = chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>;
    setSpy.mockClear();

    await startStars();

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const pro = document.createElement('gem-menu-item');
    pro.setAttribute('role', 'menuitem');
    pro.setAttribute('data-mode-id', 'e6fa609c3fa255c0');
    pro.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">3.1 Pro</span></div></gem-menu-item-content>`;

    const extended = document.createElement('gem-menu-item');
    extended.setAttribute('role', 'menuitem');
    extended.setAttribute(
      'jslog',
      '323336;track:generic_click,impression;BardVeMetadataKey:[["e6fa609c3fa255c0",2,3]]',
    );
    extended.innerHTML = `<gem-menu-item-content class="checkmark-only"><div class="label-container"><span class="label">Extended thinking</span><span class="sublabel">Complex problem solving</span></div></gem-menu-item-content>`;

    pane.append(pro, extended);
    document.body.appendChild(pane);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    const proStar = pro.querySelector<HTMLButtonElement>('.gv-default-star-btn');
    const extendedStar = extended.querySelector<HTMLButtonElement>('.gv-default-star-btn');

    expect(proStar?.title).toBe('cancelDefaultModel');
    expect(extendedStar?.title).toBe('setAsDefaultThinkingLevel');
    expect(extendedStar?.dataset.gvDefaultKind).toBe('thinking');
    expect(extendedStar?.classList.contains('is-default')).toBe(false);

    extendedStar?.click();
    await Promise.resolve();

    const writes = setSpy.mock.calls.map(([payload]) => payload as Record<string, unknown>);
    expect(writes).toContainEqual({
      gvDefaultThinkingLevel: {
        index: 0,
        label: 'Extended thinking',
        mode: 'extended',
      },
    });
    expect(writes.some((payload) => 'gvDefaultModel' in payload)).toBe(false);
  });

  it('does not inject star on the "Thinking level" submenu opener (aria-haspopup=true, no data-mode-id)', async () => {
    await startStars();

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
});
