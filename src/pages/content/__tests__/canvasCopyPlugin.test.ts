// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
/** Canvas copy through its real packaged source, host, storage feed and startup admission. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { CANVAS_MARKDOWN_BUTTON_CLASS } from '../canvasExport/menuInjection';
import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

vi.mock('@/utils/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/i18n')>()),
  getCurrentLanguage: vi.fn(async () => 'en'),
  getTranslation: vi.fn(async (key: string) => {
    if (key === 'canvasExportCopyMarkdown') return 'Copy as Markdown';
    if (key === 'canvasExportCopyMarkdownTooltip') return 'Copy Canvas content as Markdown';
    return key;
  }),
}));

const ID = OFFICIAL_PLUGIN_IDS.geminiCanvasCopy;
const SWITCH = StorageKeys.CANVAS_COPY_ENABLED;
const NATIVE_ITEM = `
  <button class="mat-mdc-menu-item" role="menuitem">
    <mat-icon>share</mat-icon><span class="mat-mdc-menu-item-text">Share</span>
  </button>`;
let harness: LifecycleHarness;
let cleanupManager: CleanupManager;
let host: PluginHost | null;

async function flush(): Promise<void> {
  for (let round = 0; round < 60; round++) await Promise.resolve();
}

function canvasMenu(withNativeItem = true): HTMLElement {
  document.body.innerHTML = `
    <immersive-editor><div class="ProseMirror"><h1>Canvas draft</h1><p>A paragraph.</p></div></immersive-editor>
    <share-button data-test-id="consolidated-share-button">
      <button aria-haspopup="menu" aria-expanded="true" aria-controls="canvas-share-menu">Share</button>
    </share-button>
    <div id="canvas-share-menu" class="mat-mdc-menu-panel" role="menu">
      <div class="mat-mdc-menu-content">${withNativeItem ? NATIVE_ITEM : ''}</div>
    </div>`;
  return document.getElementById('canvas-share-menu')!;
}

const buttons = (): NodeListOf<HTMLElement> =>
  document.querySelectorAll(`.${CANVAS_MARKDOWN_BUTTON_CLASS}`);
const statusOf = (): string | undefined =>
  host?.getStatuses().find((entry) => entry.id === ID)?.kind;

async function start(admit = true): Promise<void> {
  const admission = createOfficialAdmission();
  if (admit) await createGeminiBuiltinStartup(admission, cleanupManager).startCanvasCopy();
  admission.close();
  host = new PluginHost({
    url: location.href,
    sources: [new BuiltinPluginSource()],
    doc: document,
    admission,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  await flush();
}

function setSwitch(enabled: boolean): void {
  harness.storage.sync.set(SWITCH, enabled);
  harness.emitStorageChange({ [SWITCH]: { newValue: enabled } }, 'sync');
}

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = '';
  canvasMenu();
  harness = installLifecycleHarness();
  cleanupManager = new CleanupManager();
  host = null;
});

afterEach(async () => {
  host?.stop();
  cleanupManager.executeCleanups();
  await flush();
  harness.restore();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('Gemini Canvas copy through its registered official plugin', () => {
  it.each([
    ['missing', undefined, true],
    ['false', false, false],
    ['true', true, true],
  ] as const)(
    'preserves the %s sync-key behavior despite stale plugins state',
    async (_name, value, on) => {
      if (value !== undefined) harness.storage.sync.set(SWITCH, value);
      const staleState = { [ID]: { enabled: !on, installedAt: 1, settings: {} } };
      harness.storage.local.set(StorageKeys.PLUGINS_STATE, staleState);

      await start();
      await vi.advanceTimersByTimeAsync(150);

      expect(statusOf() === 'mounted').toBe(on);
      expect(buttons()).toHaveLength(on ? 1 : 0);
      if (on) expect(buttons()[0].textContent).toContain('Copy as Markdown');
      else expect(harness.ledger.openObservers()).toEqual([]);
      expect(harness.storage.sync.get(SWITCH)).toBe(value);
      expect(harness.storage.local.get(StorageKeys.PLUGINS_STATE)).toEqual(staleState);
      expect(
        vi
          .mocked(chrome.storage.local.set)
          .mock.calls.some(([values]) => Object.hasOwn(values, StorageKeys.PLUGINS_STATE)),
      ).toBe(false);
    },
  );

  it('removes the open menu button on live off and restores exactly one on re-enable', async () => {
    await start();
    await vi.advanceTimersByTimeAsync(150);
    expect(buttons()).toHaveLength(1);
    const observerCount = harness.ledger.openObservers().length;
    const listenerCount = harness.ledger.openStorageListeners();

    setSwitch(false);
    await flush();
    // No timer advance: a popup change removes an already-visible menu action immediately.
    expect(buttons()).toHaveLength(0);
    expect(statusOf()).not.toBe('mounted');
    expect(harness.ledger.openObservers()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(buttons()).toHaveLength(0);

    setSwitch(true);
    await flush();
    await vi.advanceTimersByTimeAsync(150);
    expect(statusOf()).toBe('mounted');
    expect(buttons()).toHaveLength(1);
    expect(harness.ledger.openObservers()).toHaveLength(observerCount);
    expect(harness.ledger.openStorageListeners()).toBe(listenerCount);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(buttons()).toHaveLength(1);
  });

  it('restores default on when the sync key is removed live without persisting a replacement', async () => {
    harness.storage.sync.set(SWITCH, false);
    await start();
    expect(buttons()).toHaveLength(0);

    harness.storage.sync.delete(SWITCH);
    harness.emitStorageChange({ [SWITCH]: { oldValue: false } }, 'sync');
    await flush();
    await vi.advanceTimersByTimeAsync(150);

    expect(statusOf()).toBe('mounted');
    expect(buttons()).toHaveLength(1);
    expect(harness.storage.sync.has(SWITCH)).toBe(false);
  });

  it('does not inject after host teardown while the native menu item is still pending', async () => {
    const panel = canvasMenu(false);
    await start();
    await vi.advanceTimersByTimeAsync(40);
    expect(statusOf()).toBe('mounted');
    expect(buttons()).toHaveLength(0);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    host!.stop();
    await flush();
    panel.querySelector('.mat-mdc-menu-content')!.innerHTML = NATIVE_ITEM;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(buttons()).toHaveLength(0);
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does nothing if the page never reaches its admission point even with an explicit on', async () => {
    harness.storage.sync.set(SWITCH, true);
    await start(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(statusOf()).not.toBe('mounted');
    expect(buttons()).toHaveLength(0);
    expect(harness.ledger.openObservers()).toEqual([]);
  });

  it('only admits at the old native start point and leaves injection to PluginHost', async () => {
    const admission = createOfficialAdmission();
    await createGeminiBuiltinStartup(admission, cleanupManager).startCanvasCopy();
    admission.close();
    await flush();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(admission.stateOf(ID)).toBe('admitted');
    expect(buttons()).toHaveLength(0);
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
