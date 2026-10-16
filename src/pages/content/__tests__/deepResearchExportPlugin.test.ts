// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
/** Deep Research menu ownership through the packaged source, host and original admission point. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { ConversationExportService } from '@/features/export/services/ConversationExportService';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';
import { toastDriver } from '@/tests/toastDriver';

import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const ID = OFFICIAL_PLUGIN_IDS.geminiDeepResearchExport;
const SWITCH = StorageKeys.DEEP_RESEARCH_EXPORT_ENABLED;
const DOWNLOAD = '.gv-deep-research-download';
const SAVE_REPORT = '.gv-deep-research-save-report';
let harness: LifecycleHarness;
let cleanupManager: CleanupManager;
let host: PluginHost | null;

async function flush(): Promise<void> {
  for (let round = 0; round < 60; round++) await Promise.resolve();
}

function openReportMenu(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'mat-mdc-menu-panel';
  panel.setAttribute('role', 'menu');
  // These are the native report-menu markers exercised by menuButton's existing regressions.
  panel.innerHTML = `
    <div class="mat-mdc-menu-content">
      <div data-test-id="share-button-tooltip-container">
        <share-button><button role="menuitem" data-test-id="share-button"
          class="mat-mdc-menu-item share-button"><span class="mat-mdc-menu-item-text">Share</span></button></share-button>
      </div>
      <export-to-docs-button data-test-id="export-to-docs-button">
        <button role="menuitem" class="mat-mdc-menu-item menu-item-button">
          <mat-icon class="mat-icon google-symbols" fonticon="docs"></mat-icon>
          <span class="mat-mdc-menu-item-text">Export to Docs</span>
        </button>
      </export-to-docs-button>
      <copy-button data-test-id="copy-button"></copy-button>
    </div>`;
  document.body.appendChild(panel);
  return panel;
}

function expectEntries(count: number): void {
  expect(document.querySelectorAll(DOWNLOAD)).toHaveLength(count);
  expect(document.querySelectorAll(SAVE_REPORT)).toHaveLength(count);
}

const statusOf = (): string | undefined =>
  host?.getStatuses().find((entry) => entry.id === ID)?.kind;

async function start(admit = true): Promise<void> {
  const admission = createOfficialAdmission();
  if (admit) await createGeminiBuiltinStartup(admission, cleanupManager).startDeepResearchExport();
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
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = `
    <deep-research-immersive-panel>
      <div class="markdown"><h1>Solar report</h1><p>Findings</p></div>
    </deep-research-immersive-panel>`;
  harness = installLifecycleHarness();
  cleanupManager = new CleanupManager();
  host = null;
});

afterEach(async () => {
  host?.stop();
  cleanupManager.executeCleanups();
  await flush();
  // ExportDialog owns its keyboard listener independently of the menu plugin.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  harness.restore();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('Gemini Deep Research export through its registered official plugin', () => {
  it.each([
    ['missing', undefined, true],
    ['false', false, false],
    ['true', true, true],
  ] as const)(
    'uses the %s sync switch despite opposing stale plugins state',
    async (_name, value, on) => {
      if (value !== undefined) harness.storage.sync.set(SWITCH, value);
      const staleState = { [ID]: { enabled: !on, installedAt: 1, settings: {} } };
      harness.storage.local.set(StorageKeys.PLUGINS_STATE, staleState);
      await start();
      openReportMenu();
      await vi.advanceTimersByTimeAsync(150);

      expect(statusOf() === 'mounted').toBe(on);
      expectEntries(on ? 1 : 0);
      if (on) {
        expect(document.querySelector(SAVE_REPORT)?.textContent).toContain('Save Report');
      } else {
        expect(harness.ledger.openObservers()).toEqual([]);
      }
      expect(harness.storage.sync.get(SWITCH)).toBe(value);
      expect(harness.storage.local.get(StorageKeys.PLUGINS_STATE)).toEqual(staleState);
      expect(
        vi
          .mocked(chrome.storage.local.set)
          .mock.calls.some(([values]) => Object.hasOwn(values, StorageKeys.PLUGINS_STATE)),
      ).toBe(false);
    },
  );

  it('live off immediately removes both entries and off→on never duplicates them or listeners', async () => {
    await start();
    openReportMenu();
    await vi.advanceTimersByTimeAsync(150);
    expectEntries(1);
    const observerCount = harness.ledger.openObservers().length;
    const storageListenerCount = harness.ledger.openStorageListeners();
    const listenerCount = harness.ledger.openListeners({ includeDetached: true }).length;

    for (let cycle = 0; cycle < 3; cycle++) {
      setSwitch(false);
      await flush();
      // No timer advance: removing the affordance is synchronous with scope abort.
      expectEntries(0);
      expect(statusOf()).not.toBe('mounted');
      expect(harness.ledger.openObservers()).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_000);
      expectEntries(0);

      setSwitch(true);
      await flush();
      await vi.advanceTimersByTimeAsync(150);
      expect(statusOf()).toBe('mounted');
      expectEntries(1);
      expect(harness.ledger.openObservers()).toHaveLength(observerCount);
      expect(harness.ledger.openStorageListeners()).toBe(storageListenerCount);
      expect(harness.ledger.openListeners({ includeDetached: true })).toHaveLength(listenerCount);
    }
  });

  it('live deletion restores default on without writing a replacement switch', async () => {
    harness.storage.sync.set(SWITCH, false);
    await start();
    openReportMenu();
    await vi.advanceTimersByTimeAsync(150);
    expectEntries(0);

    harness.storage.sync.delete(SWITCH);
    harness.emitStorageChange({ [SWITCH]: { oldValue: false } }, 'sync');
    await flush();
    await vi.advanceTimersByTimeAsync(150);

    expect(statusOf()).toBe('mounted');
    expectEntries(1);
    expect(harness.storage.sync.has(SWITCH)).toBe(false);
  });

  it('a delayed menu injection cannot run after live off', async () => {
    await start();
    openReportMenu();
    await flush();
    await vi.advanceTimersByTimeAsync(25);
    expectEntries(0);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    setSwitch(false);
    await flush();
    await vi.advanceTimersByTimeAsync(1_000);
    expectEntries(0);
    expect(harness.ledger.openObservers()).toEqual([]);
    openReportMenu();
    await vi.advanceTimersByTimeAsync(1_000);
    expectEntries(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an accepted report export finishes and reports its result after the menu is disabled', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    );
    vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');
    type Result = Awaited<ReturnType<typeof ConversationExportService.export>>;
    let finish!: (result: Result) => void;
    const exportReport = vi.spyOn(ConversationExportService, 'export').mockReturnValue(
      new Promise<Result>((resolve) => {
        finish = resolve;
      }),
    );
    await start();
    openReportMenu();
    await vi.advanceTimersByTimeAsync(150);
    document.querySelector<HTMLElement>(SAVE_REPORT)!.click();
    await vi.dynamicImportSettled();
    await flush();
    expect(document.querySelector('.gv-export-dialog')).not.toBeNull();
    const radio = document.querySelector<HTMLInputElement>('input[value="pdf"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    document.querySelector<HTMLButtonElement>('.gv-export-dialog-btn-primary')!.click();
    await flush();
    expect(exportReport).toHaveBeenCalledOnce();
    expect(toastDriver.all()).toMatchObject([{ pending: true, role: 'status' }]);

    setSwitch(false);
    await flush();
    expectEntries(0);
    expect(statusOf()).not.toBe('mounted');
    await vi.advanceTimersByTimeAsync(500);
    expect(toastDriver.all()).toMatchObject([{ pending: true }]);

    finish({ success: true, format: 'pdf' } as Result);
    await flush();
    expect(toastDriver.messages()).toEqual(['You can now press Command + P to export PDF.']);
    expect(toastDriver.all().every((toast) => !toast.pending)).toBe(true);
    expect(exportReport).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ title: 'Solar report' }),
      expect.objectContaining({
        format: 'pdf',
        filename: 'Solar-report.pdf',
        layout: 'document',
      }),
    );
  });

  it.each([
    ['missing', undefined, 620],
    ['saved medium', 960, 960],
    ['unsupported legacy', 800, 620],
  ] as const)(
    'uses the shared %s image width in the real dialog and saves the normalized export choice',
    async (_name, savedWidth, expectedWidth) => {
      if (savedWidth !== undefined) {
        harness.storage.sync.set(StorageKeys.EXPORT_IMAGE_WIDTH, savedWidth);
      }
      const exportReport = vi.spyOn(ConversationExportService, 'export').mockResolvedValue({
        success: true,
        format: 'image',
      } as Awaited<ReturnType<typeof ConversationExportService.export>>);
      await start();
      openReportMenu();
      await vi.advanceTimersByTimeAsync(150);
      document.querySelector<HTMLElement>(SAVE_REPORT)!.click();
      await vi.dynamicImportSettled();
      await flush();
      expect(document.querySelector('.gv-export-dialog')).not.toBeNull();
      expect(harness.storage.sync.get(StorageKeys.EXPORT_IMAGE_WIDTH)).toBe(savedWidth);

      const radio = document.querySelector<HTMLInputElement>('input[value="image"]')!;
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
      document.querySelector<HTMLButtonElement>('.gv-export-dialog-btn-primary')!.click();
      await flush();

      expect(exportReport).toHaveBeenCalledOnce();
      expect(exportReport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ title: 'Solar report' }),
        expect.objectContaining({ format: 'image', imageWidth: expectedWidth }),
      );
      expect(harness.storage.sync.get(StorageKeys.EXPORT_IMAGE_WIDTH)).toBe(expectedWidth);
      await vi.advanceTimersByTimeAsync(500);
      expect(toastDriver.all()).toEqual([]);
    },
  );

  it('does nothing without admission even when explicitly enabled', async () => {
    harness.storage.sync.set(SWITCH, true);
    await start(false);
    openReportMenu();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(statusOf()).not.toBe('mounted');
    expectEntries(0);
    expect(harness.ledger.openObservers()).toEqual([]);
  });

  it('the old native start point only admits and installs no effects before PluginHost starts', async () => {
    const admission = createOfficialAdmission();
    await createGeminiBuiltinStartup(admission, cleanupManager).startDeepResearchExport();
    admission.close();
    openReportMenu();
    await flush();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(admission.stateOf(ID)).toBe('admitted');
    expectEntries(0);
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    expect(harness.ledger.openListeners()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
