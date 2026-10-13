import { type Mock, afterEach, beforeEach, expect, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { toastDriver } from '@/tests/toastDriver';

type SyncGet = (
  keys: unknown,
  callback?: (items: Record<string, unknown>) => void,
) => Promise<Record<string, unknown>>;

export function setupModelLockerTests() {
  let stopOwner: (() => void | Promise<void>) | null = null;
  let syncStored: Record<string, unknown> = {};
  const storageListeners = new Set<Parameters<typeof chrome.storage.onChanged.addListener>[0]>();

  async function flush(): Promise<void> {
    for (let round = 0; round < 100; round++) await Promise.resolve();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();

    syncStored = {};
    storageListeners.clear();
    vi.mocked(chrome.storage.onChanged.addListener).mockImplementation((listener) => {
      storageListeners.add(listener);
    });
    vi.mocked(chrome.storage.onChanged.removeListener).mockImplementation((listener) => {
      storageListeners.delete(listener);
    });
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({}));
    mockSyncGet(syncStored);

    (chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(syncStored, items);
        callback?.();
        return Promise.resolve();
      },
    );

    (chrome.storage.sync.remove as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (keys: string | string[], callback?: () => void) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete syncStored[key];
        callback?.();
        return Promise.resolve();
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

  afterEach(async () => {
    await stopOwner?.();
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
      isCurrent: () => true,
      shouldYield: () => false,
      stop: vi.fn(),
      failed: vi.fn(),
      resetFailures: vi.fn(),
      focusInput: vi.fn(),
    });
  }

  async function startManager() {
    const { PluginHost } = await import('@/features/plugins/runtime/PluginHost');
    const { createOfficialAdmission } =
      await import('@/features/plugins/runtime/officialAdmission');
    const { getNativeHandler, registerNativeHandler } =
      await import('@/features/plugins/runtime/nativeHandlers');
    const { OFFICIAL_PLUGIN_IDS } = await import('@/features/plugins/sites/featureOwners');
    const { BuiltinPluginSource } = await import('@/features/plugins/sources/BuiltinPluginSource');
    const { activateGeminiDefaultModel } = await import('../pluginHandler');
    const { CleanupManager } = await import('@/core/utils/cleanupManager');
    const { createGeminiBuiltinStartup } = await import('../../geminiBuiltinStartup');
    const cleanup = new CleanupManager();
    if (!getNativeHandler(OFFICIAL_PLUGIN_IDS.geminiDefaultModel))
      registerNativeHandler(OFFICIAL_PLUGIN_IDS.geminiDefaultModel, {
        activate: activateGeminiDefaultModel,
      });
    const admission = createOfficialAdmission();
    await createGeminiBuiltinStartup(admission, cleanup).startDefaultModel();
    admission.close();
    const host = new PluginHost({
      url: `https://gemini.google.com${location.pathname}${location.search}`,
      sources: [new BuiltinPluginSource()],
      admission,
      doc: document,
      isTopFrame: true,
      requestCatalogRefresh: () => {},
    });
    const stop = async () => {
      host.stop();
      cleanup.executeCleanups();
      await flush();
    };
    stopOwner = stop;
    const ready = host.start().then(flush);
    await ready;
    return { stop, ready };
  }

  function holdCleanupRead(oldValue: boolean): () => void {
    const get = chrome.storage.sync.get as unknown as Mock<SyncGet>;
    const original = get.getMockImplementation()!;
    let release = () => {};
    let held = false;
    get.mockImplementation((keys: unknown, callback?: (items: Record<string, unknown>) => void) => {
      if (!held && keys === StorageKeys.DEFAULT_MODEL_AUTO_APPLY) {
        held = true;
        return new Promise<Record<string, unknown>>((resolve) => {
          release = () => resolve({ [StorageKeys.DEFAULT_MODEL_AUTO_APPLY]: oldValue });
        });
      }
      return original(keys, callback);
    });
    return () => release();
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
    syncStored = stored;
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback?: (items: Record<string, unknown>) => void) => {
        const snapshot = { ...syncStored };
        callback?.(snapshot);
        return Promise.resolve(snapshot);
      },
    );
  }

  async function changeAutoApply(enabled: boolean, area: 'sync' | 'local' = 'sync') {
    if (area === 'sync') syncStored.gvDefaultModelAutoApply = enabled;
    for (const listener of storageListeners)
      listener({ gvDefaultModelAutoApply: { newValue: enabled } }, area);
    await flush();
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
    holdCleanupRead,
    buildThinkingSubmenu,
    mockSyncGet,
    changeAutoApply,
    mountPicker,
    reachFailureToast,
  };
}
