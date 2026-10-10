import { describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { setupModelLockerTests } from './modelLockerHarness';

describe('DefaultModelAutoApply model enforcement', () => {
  const { startAutoApply } = setupModelLockerTests();

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

    await startAutoApply();

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

    await startAutoApply();

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

    await startAutoApply();

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

    await startAutoApply();

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

    await startAutoApply();

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

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(1500);

    expect(selectorBtn.click).toHaveBeenCalledTimes(1);
    expect(targetFlashItem.click).toHaveBeenCalledTimes(1);
    expect(currentFlashItem.click).toHaveBeenCalledTimes(0);
  });

  it('learns the trigger label of an already-selected Flash variant (one confirming open)', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({ gvDefaultModel: { id: 'flash-38-id', name: '3.8 Flash' } });
      },
    );
    const setSpy = chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>;
    setSpy.mockClear();

    history.replaceState({}, '', '/app');

    // Gemini labels the trigger with the short form, so the stored full name
    // can never be confirmed from the pill alone.
    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const flashItem = document.createElement('gem-menu-item');
    flashItem.setAttribute('role', 'menuitem');
    flashItem.setAttribute('data-mode-id', 'flash-38-id');
    flashItem.classList.add('selected');
    flashItem.innerHTML = `
      <gem-menu-item-content>
        <div class="label-container"><span class="label">3.8 Flash</span></div>
      </gem-menu-item-content>
    `;
    flashItem.click = vi.fn();

    pane.appendChild(flashItem);
    document.body.appendChild(pane);

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(1500);

    // The picker opens once to read Gemini's own selected row, and the row is
    // never clicked because it is already the current model.
    expect(selectorBtn.click).toHaveBeenCalledTimes(1);
    expect(flashItem.click).toHaveBeenCalledTimes(0);

    const writes = setSpy.mock.calls.map(([payload]) => payload as Record<string, unknown>);
    expect(writes).toContainEqual({
      gvDefaultModel: { id: 'flash-38-id', name: '3.8 Flash', pill: 'Flash' },
    });

    await vi.advanceTimersByTimeAsync(6000);
    expect(selectorBtn.click).toHaveBeenCalledTimes(1);
  });

  it('fast-path: a learned trigger label confirms a Flash variant without opening the picker', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
        callback({
          gvDefaultModel: { id: 'flash-38-id', name: '3.8 Flash', pill: 'Flash' },
        });
      },
    );

    history.replaceState({}, '', '/app');

    const selectorBtn = document.createElement('button');
    selectorBtn.setAttribute('data-test-id', 'bard-mode-menu-button');
    selectorBtn.textContent = 'Flash';
    selectorBtn.click = vi.fn();
    document.body.appendChild(selectorBtn);

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(6000);

    expect(selectorBtn.click).not.toHaveBeenCalled();
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

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(1500);

    expect(proItem.click).toHaveBeenCalledTimes(0);
    expect(selectorBtn.click).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(selectorBtn.click).toHaveBeenCalledTimes(1);
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

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(3000);

    expect(selectorBtn.click).not.toHaveBeenCalled();
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

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(3000);

    // Must NOT have re-clicked the trigger; the user already has Pro + Standard.
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

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(3000);

    // Must NOT have re-clicked the trigger — fast-path should recognise "Pro" === "3.1 Pro".
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

    await startAutoApply();

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

    await startAutoApply();

    await vi.advanceTimersByTimeAsync(5000);

    const clicksAfterBackoff = (proItem.click as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(selectorBtn.textContent).toBe('Flash');
    expect(clicksAfterBackoff).toBeGreaterThan(0);
    expect(clicksAfterBackoff).toBeLessThanOrEqual(3);
    expect(toastDriver.messages()).toEqual(['defaultModelAutoApplyFailed']);

    await vi.advanceTimersByTimeAsync(25000);
    expect((proItem.click as ReturnType<typeof vi.fn>).mock.calls.length).toBe(clicksAfterBackoff);
  });
});
