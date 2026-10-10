import { describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { setupModelLockerTests } from './modelLockerHarness';

describe('DefaultModelAutoApply thinking enforcement', () => {
  const { startAutoApply } = setupModelLockerTests();

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

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(3000);

    expect(selectorBtn.click).not.toHaveBeenCalled();
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

    await startAutoApply();

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

    const mountSubmenu = vi.fn(() => {
      if (!document.body.contains(submenuPane)) {
        document.body.appendChild(submenuPane);
      }
    });
    thinkingRow.addEventListener('mouseover', mountSubmenu);

    await startAutoApply();

    // First tick (1s) — should detect thinking mismatch and call thinkingRow.click() and extended.click()
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    expect(thinkingRow.click).toHaveBeenCalledTimes(1);
    expect(mountSubmenu).toHaveBeenCalled();
    expect(extended.click).toHaveBeenCalledTimes(1);
    expect(standard.click).toHaveBeenCalledTimes(0);
  });

  it('auto-locks the inline Extended thinking toggle without a Standard submenu (#808)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultThinkingLevel: {
            index: 0,
            label: 'Extended thinking',
            mode: 'extended',
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

    const mainPane = document.createElement('div');
    mainPane.className = 'cdk-overlay-pane';
    const modelItem = document.createElement('gem-menu-item');
    modelItem.setAttribute('role', 'menuitem');
    modelItem.setAttribute('data-mode-id', '56fdd199312815e2');
    modelItem.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">3.5 Flash</span></div></gem-menu-item-content>`;
    const extended = document.createElement('gem-menu-item');
    extended.setAttribute('role', 'menuitem');
    extended.setAttribute(
      'jslog',
      '323336;track:generic_click,impression;BardVeMetadataKey:[["56fdd199312815e2",2,3]]',
    );
    extended.innerHTML = `<gem-menu-item-content class="checkmark-only"><div class="label-container"><span class="label">Extended thinking</span></div></gem-menu-item-content>`;
    extended.click = vi.fn();
    mainPane.append(modelItem, extended);
    document.body.appendChild(mainPane);

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(1500);

    expect(extended.click).toHaveBeenCalledTimes(1);
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

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(5000);
    const clicksAfterBackoff = (extended.click as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(clicksAfterBackoff).toBeGreaterThan(0);
    expect(clicksAfterBackoff).toBeLessThanOrEqual(3);
    expect(toastDriver.messages()).toEqual(['defaultModelAutoApplyFailed']);

    await vi.advanceTimersByTimeAsync(10000);
    expect((extended.click as ReturnType<typeof vi.fn>).mock.calls.length).toBe(clicksAfterBackoff);
  });
});
