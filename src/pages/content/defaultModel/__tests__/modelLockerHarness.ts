import { afterEach, beforeEach, expect, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

export function setupModelLockerTests() {
  let stopOwner: (() => void) | null = null;

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
    stopOwner?.();
    stopOwner = null;

    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  async function dependencies() {
    const { DefaultModelPreferences } = await import('../preferences');
    const { ModelPicker } = await import('../modelPicker');
    const { createToaster } = await import('@/core/ui/toast/toaster');
    const preferences = new DefaultModelPreferences();
    await preferences.load();
    return { preferences, picker: new ModelPicker(preferences), toaster: createToaster() };
  }

  async function startStars() {
    const { DefaultStars } = await import('../defaultStars');
    const { preferences, picker, toaster } = await dependencies();
    const stars = new DefaultStars(preferences, picker, toaster);
    stars.start();
    stopOwner = () => {
      stars.stop();
      toaster.destroy();
    };
  }

  async function startAutoApply() {
    const { DefaultModelAutoApply } = await import('../autoApply');
    const { preferences, picker, toaster } = await dependencies();
    const autoApply = new DefaultModelAutoApply(preferences, picker, toaster);
    autoApply.start();
    stopOwner = () => {
      autoApply.stop();
      toaster.destroy();
    };
  }

  async function selectModel() {
    const { preferences, picker } = await dependencies();
    return picker.selectModel(preferences.model!, {
      shouldYield: () => false,
      stop: vi.fn(),
      failed: vi.fn(),
      resetFailures: vi.fn(),
      focusInput: vi.fn(),
    });
  }

  async function startManager() {
    const { default: DefaultModelManager } = await import('../modelLocker');
    const manager = DefaultModelManager.getInstance();
    await manager.init();
    stopOwner = () => manager.destroy();
  }

  function buildThinkingSubmenu(submenuId: string) {
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
  }

  function mockSyncGet(stored: Record<string, unknown>) {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (items: Record<string, unknown>) => void) => callback(stored),
    );
  }

  function changeAutoApply(enabled: boolean) {
    const onChangedAdd = chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>;
    const listener = onChangedAdd.mock.calls.at(-1)?.[0] as (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => void;
    listener({ gvDefaultModelAutoApply: { newValue: enabled } }, 'sync');
  }

  function mountPicker(name = 'Pro', id = 'pro-id') {
    const trigger = document.createElement('button');
    trigger.setAttribute('data-test-id', 'bard-mode-menu-button');
    trigger.textContent = 'Flash';
    const triggerClick = vi.spyOn(trigger, 'click');
    const panel = document.createElement('div');
    panel.className = 'mat-mdc-menu-panel gds-mode-switch-menu';
    panel.setAttribute('role', 'menu');
    const item = document.createElement('button');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('data-mode-id', id);
    item.innerHTML = `<div class="title-and-description"><div class="mode-title">${name}</div></div>`;
    const itemClick = vi.spyOn(item, 'click');
    panel.appendChild(item);
    document.body.append(trigger, panel);
    return { trigger, triggerClick, panel, item, itemClick };
  }

  async function reachFailureToast() {
    mockSyncGet({ gvDefaultModel: { id: 'missing-id', name: 'Missing Model' } });
    history.replaceState({}, '', '/app');
    const picker = mountPicker();
    await startManager();
    await vi.advanceTimersByTimeAsync(4000);
    expect(picker.triggerClick).toHaveBeenCalledTimes(3);
    expect(toastDriver.messages()).toEqual(['defaultModelAutoApplyFailed']);
    return picker;
  }

  return {
    startStars,
    startAutoApply,
    selectModel,
    startManager,
    buildThinkingSubmenu,
    mockSyncGet,
    changeAutoApply,
    mountPicker,
    reachFailureToast,
  };
}
