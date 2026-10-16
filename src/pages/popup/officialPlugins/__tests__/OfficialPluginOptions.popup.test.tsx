import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '@/contexts/LanguageContext';
import { StorageKeys } from '@/core/types/common';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { TRANSLATIONS } from '@/utils/translations';

import Popup from '../../Popup';
import {
  AI_STUDIO,
  GEMINI_TAB,
  browserTarget,
  emitSyncChange,
  extensionApi,
  popupRows,
  resetPopupBrowser,
} from './popupHarness';

// Keep Popup, its hooks and the packaged manifests real; replace only browser APIs.
vi.mock('webextension-polyfill', async () => ({
  default: (await import('./popupHarness')).extensionApi,
}));
vi.mock('@/core/utils/browser', async (importOriginal) => {
  const { browserTarget } = await import('./popupHarness');
  return {
    ...(await importOriginal<typeof import('@/core/utils/browser')>()),
    isSafari: () => browserTarget.safari,
  };
});

/** Rows whose controls go beyond a switch: option panels, a permission flow, a count. */
describe('official plugin rows with options', () => {
  let container: HTMLDivElement;
  let root: Root;
  let local: Record<string, unknown>;
  let sync: Record<string, unknown>;

  beforeEach(() => {
    ({ local, sync } = resetPopupBrowser());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const mount = async () => {
    await act(async () => {
      root.render(
        <LanguageProvider>
          <Popup />
        </LanguageProvider>,
      );
    });
  };
  const row = (id: string) => popupRows(container).row(id);
  const toggle = (id: string) => popupRows(container).toggle(id);
  const optionsButton = (id: string) =>
    row(id)!.querySelector<HTMLButtonElement>('button[aria-expanded]');
  const openOptions = async (id: string) => {
    await act(async () => optionsButton(id)!.click());
  };
  const drag = (input: HTMLInputElement, value: number | string) => {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        String(value),
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const pluginStateWritten = () =>
    extensionApi.storage.local.set.mock.calls.some(([updates]) =>
      Object.hasOwn(updates as object, StorageKeys.PLUGINS_STATE),
    );

  describe('rows with options', () => {
    const radio = (id: string, label: string) =>
      [...row(id)!.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
        (input) => input.closest('label')!.textContent === label,
      )!;

    it('offers Options only while the row is on, collapsed until asked', async () => {
      sync[StorageKeys.FORMULA_COPY_ENABLED] = false;
      await mount();
      expect(optionsButton(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy)).toBeNull();
      await act(async () => toggle(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy).click());
      const button = optionsButton(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy)!;
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(button.getAttribute('aria-label')).toBe(
        TRANSLATIONS.en.pluginRowOptionsFor.replace('{name}', 'Formula Copy'),
      );
      expect(
        row(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy)!.querySelector('input[type="radio"]'),
      ).toBeNull();
      await openOptions(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy);
      expect(button.getAttribute('aria-expanded')).toBe('true');
      const panel = container.querySelector(`#${button.getAttribute('aria-controls')}`)!;
      expect(panel.textContent).toContain(TRANSLATIONS.en.formulaCopyScopeNote);
      await openOptions(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy);
      expect(
        row(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy)!.querySelector('input[type="radio"]'),
      ).toBeNull();
    });

    it('shows the stored formula format and writes only the format key', async () => {
      sync[StorageKeys.FORMULA_COPY_FORMAT] = 'unicodemath';
      await mount();
      await openOptions(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy);
      const id = OFFICIAL_PLUGIN_IDS.geminiFormulaCopy;
      expect(radio(id, TRANSLATIONS.en.formulaCopyFormatUnicodeMath).checked).toBe(true);
      await act(async () => radio(id, TRANSLATIONS.en.formulaCopyFormatNotion).click());
      expect(radio(id, TRANSLATIONS.en.formulaCopyFormatNotion).checked).toBe(true);
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.FORMULA_COPY_FORMAT]: 'notion',
      });
      expect(local[StorageKeys.PLUGINS_STATE]).toBeUndefined();
    });

    it('a format stored elsewhere while the popup is open shows at once', async () => {
      await mount();
      await openOptions(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy);
      const id = OFFICIAL_PLUGIN_IDS.geminiFormulaCopy;
      expect(radio(id, TRANSLATIONS.en.formulaCopyFormatLatex).checked).toBe(true);
      await act(async () => emitSyncChange({ [StorageKeys.FORMULA_COPY_FORMAT]: 'no-dollar' }));
      expect(radio(id, TRANSLATIONS.en.formulaCopyFormatNoDollar).checked).toBe(true);
    });

    it('on AI Studio, the formula row edits the same shared switch and format', async () => {
      extensionApi.tabs.query.mockResolvedValue([{ id: 8, url: AI_STUDIO }]);
      await mount();
      const id = OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy;
      expect(toggle(id).checked).toBe(true);
      await openOptions(id);
      await act(async () => radio(id, TRANSLATIONS.en.formulaCopyFormatNotion).click());
      await act(async () => toggle(id).click());
      expect(extensionApi.storage.sync.set.mock.calls.map(([payload]) => payload)).toEqual([
        { [StorageKeys.FORMULA_COPY_FORMAT]: 'notion' },
        { [StorageKeys.FORMULA_COPY_ENABLED]: false },
      ]);
    });

    it.each([
      ['missing', undefined, true],
      ['false', false, false],
      ['true', true, true],
    ] as const)(
      'shows a %s stored highlight marker switch as the highlight runtime reads it',
      async (_label, stored, expected) => {
        sync[StorageKeys.HIGHLIGHT_ENABLED] = true;
        if (stored !== undefined) sync[StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED] = stored;
        await mount();
        await openOptions(OFFICIAL_PLUGIN_IDS.geminiHighlight);
        const markers = row(OFFICIAL_PLUGIN_IDS.geminiHighlight)!.querySelector<HTMLInputElement>(
          `input[aria-label="${TRANSLATIONS.en.showHighlightTimelineMarkers}"]`,
        )!;
        expect(markers.checked).toBe(expected);
        await act(async () => markers.click());
        expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
          [StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED]: !expected,
        });
      },
    );

    it('a search that lists a row with options opens them', async () => {
      local[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY] = TRANSLATIONS.en.formulaCopyFormatNotion;
      await mount();
      const button = optionsButton(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy)!;
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(
        radio(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy, TRANSLATIONS.en.formulaCopyFormatNotion),
      ).toBeDefined();
    });
  });

  describe('the completion notification row', () => {
    const id = OFFICIAL_PLUGIN_IDS.geminiResponseNotification;

    it('asks for permission from the click instead of writing the switch', async () => {
      await mount();
      expect(toggle(id).checked).toBe(false);
      extensionApi.runtime.sendMessage.mockClear();
      act(() => toggle(id).click());
      // Chrome may close the popup for its prompt: the intent goes out before any await.
      expect(extensionApi.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ action: 'begin' }) }),
      );
      expect(toggle(id).checked).toBe(true);
      await act(async () => {});
      expect(
        extensionApi.storage.sync.set.mock.calls.some(([payload]) =>
          Object.hasOwn(payload as object, StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED),
        ),
      ).toBe(false);
    });

    it('says on Safari that the macOS app sends the notification, while it is on', async () => {
      browserTarget.safari = true;
      sync[StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED] = true;
      await mount();
      expect(toggle(id).checked).toBe(true);
      expect(row(id)!.textContent).toContain(
        TRANSLATIONS.en.responseCompleteNotificationHintSafari,
      );
    });

    it('gives no Safari hint in other browsers', async () => {
      sync[StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED] = true;
      await mount();
      expect(row(id)!.textContent).not.toContain(
        TRANSLATIONS.en.responseCompleteNotificationHintSafari,
      );
    });
  });

  describe('the recent Gems row', () => {
    const id = OFFICIAL_PLUGIN_IDS.geminiGemsSidebar;
    const count = () => row(id)!.querySelector<HTMLInputElement>('input[type="range"]');

    it('reads a stored count of 0 as a hidden list, with the row still on', async () => {
      sync[StorageKeys.GV_GEMS_SIDEBAR_COUNT] = 0;
      await mount();
      expect(toggle(id).checked).toBe(true);
      expect(count()!.value).toBe('0');
      expect(count()!.getAttribute('aria-valuetext')).toBe(TRANSLATIONS.en.gemsSidebarCountHidden);
      expect(row(id)!.textContent).toContain(TRANSLATIONS.en.gemsSidebarCountHidden);
      expect(row(id)!.textContent).not.toMatch(/\bOff\b/);
    });

    it('saves the count on release, to its old key only', async () => {
      await mount();
      expect(count()!.getAttribute('aria-valuetext')).toBe('3');
      drag(count()!, 5);
      expect(extensionApi.storage.sync.set).not.toHaveBeenCalled();
      await act(async () => count()!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.GV_GEMS_SIDEBAR_COUNT]: 5,
      });
      expect(pluginStateWritten()).toBe(false);
    });

    it('turns off with its switch, keeping the stored count', async () => {
      sync[StorageKeys.GV_GEMS_SIDEBAR_COUNT] = 6;
      await mount();
      await act(async () => toggle(id).click());
      expect(count()).toBeNull();
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.GV_GEMS_SIDEBAR_ENABLED]: false,
      });
      expect(sync[StorageKeys.GV_GEMS_SIDEBAR_COUNT]).toBe(6);
    });
  });

  describe('the context sync row', () => {
    const id = OFFICIAL_PLUGIN_IDS.geminiContextSync;
    const port = () =>
      row(id)!.querySelector<HTMLInputElement>(
        `#${optionsButton(id)!.getAttribute('aria-controls')}-port`,
      );
    const isSyncRequest = (message: unknown) =>
      (message as { action?: string } | undefined)?.action === 'sync_to_ide';
    const syncButton = () =>
      [...row(id)!.querySelectorAll('button')].find(
        (button) => button.textContent === TRANSLATIONS.en.syncToIDE,
      );

    beforeEach(() => {
      // The local CoBridge server answers, so the panel reads the IDE as online.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    });

    it('turns on with its own switch and shows the stored port in its options', async () => {
      sync[StorageKeys.CONTEXT_SYNC_PORT] = 4000;
      await mount();
      expect(optionsButton(id)).toBeNull();
      await act(async () => toggle(id).click());
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.CONTEXT_SYNC_ENABLED]: true,
      });
      await openOptions(id);
      expect(port()!.value).toBe('4000');
    });

    it('saves a typed port to its old key', async () => {
      sync[StorageKeys.CONTEXT_SYNC_ENABLED] = true;
      await mount();
      await openOptions(id);
      expect(port()!.value).toBe('3030');
      await act(async () => drag(port()!, 5000));
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.CONTEXT_SYNC_PORT]: 5000,
      });
      expect(port()!.value).toBe('5000');
    });

    it('turned off elsewhere, it takes its Sync button away at once', async () => {
      sync[StorageKeys.CONTEXT_SYNC_ENABLED] = true;
      await mount();
      await openOptions(id);
      expect(syncButton()!.disabled).toBe(false);
      await act(async () => emitSyncChange({ [StorageKeys.CONTEXT_SYNC_ENABLED]: false }));
      expect(toggle(id).checked).toBe(false);
      expect(syncButton()).toBeUndefined();
    });

    it('a slow sync keeps its button disabled and its result across closing Options', async () => {
      sync[StorageKeys.CONTEXT_SYNC_ENABLED] = true;
      let answer: (response: unknown) => void = () => {};
      extensionApi.tabs.sendMessage.mockImplementation((_tabId: number, message: unknown) =>
        isSyncRequest(message) ? new Promise((resolve) => (answer = resolve)) : Promise.resolve(),
      );
      await mount();
      await openOptions(id);
      await act(async () => syncButton()!.click());
      expect(row(id)!.textContent).toContain(TRANSLATIONS.en.capturing);
      await openOptions(id);
      expect(syncButton()).toBeUndefined();
      await openOptions(id);
      // Reopened, and the IDE answers the probe: still the first request, not a new one.
      await act(async () => {});
      expect(syncButton()!.disabled).toBe(true);
      expect(row(id)!.textContent).toContain(TRANSLATIONS.en.capturing);
      await act(async () => syncButton()!.click());
      expect(
        extensionApi.tabs.sendMessage.mock.calls.filter(([, message]) => isSyncRequest(message)),
      ).toHaveLength(1);
      await act(async () => answer({ status: 'error', message: 'Server busy' }));
      expect(row(id)!.textContent).toContain('Server busy');
      expect(syncButton()!.disabled).toBe(false);
    });

    it('asks the Gemini tab to send its context', async () => {
      sync[StorageKeys.CONTEXT_SYNC_ENABLED] = true;
      extensionApi.tabs.sendMessage.mockResolvedValue({ status: 'success' });
      await mount();
      await openOptions(id);
      await act(async () => syncButton()!.click());
      expect(extensionApi.tabs.sendMessage).toHaveBeenCalledWith(GEMINI_TAB.id, {
        action: 'sync_to_ide',
      });
      expect(row(id)!.textContent).toContain(TRANSLATIONS.en.syncedSuccess);
    });
  });
});
