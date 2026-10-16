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

  describe("AI Studio's sidebar width row", () => {
    const id = OFFICIAL_PLUGIN_IDS.aistudioSidebarWidth;
    const width = () => row(id)!.querySelector<HTMLInputElement>('input[type="range"]');
    const onAIStudio = () => extensionApi.tabs.query.mockResolvedValue([{ id: 8, url: AI_STUDIO }]);

    it.each([
      ['missing, folders missing', {}, true],
      ['missing, folders on', { [StorageKeys.FOLDER_ENABLED]: true }, true],
      ['missing, folders off', { [StorageKeys.FOLDER_ENABLED]: false }, false],
      [
        'false, folders on',
        { [StorageKeys.AISTUDIO_SIDEBAR_WIDTH_ENABLED]: false, [StorageKeys.FOLDER_ENABLED]: true },
        false,
      ],
      [
        'true, folders off',
        { [StorageKeys.AISTUDIO_SIDEBAR_WIDTH_ENABLED]: true, [StorageKeys.FOLDER_ENABLED]: false },
        true,
      ],
    ] as const)(
      'shows a switch stored %s the way the page reads it',
      async (_label, stored, on) => {
        onAIStudio();
        Object.assign(sync, stored);
        await mount();
        expect(toggle(id).checked).toBe(on);
        expect(width() !== null).toBe(on);
      },
    );

    it('while its switch is unstored, follows the folders switch live', async () => {
      onAIStudio();
      await mount();
      expect(toggle(id).checked).toBe(true);
      await act(async () => emitSyncChange({ [StorageKeys.FOLDER_ENABLED]: false }));
      expect(toggle(id).checked).toBe(false);
    });

    it('its first switch write stores only its own key', async () => {
      onAIStudio();
      await mount();
      await act(async () => toggle(id).click());
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.AISTUDIO_SIDEBAR_WIDTH_ENABLED]: false,
      });
      expect(sync[StorageKeys.FOLDER_ENABLED]).toBeUndefined();
      expect(pluginStateWritten()).toBe(false);
    });

    it('keeps the old 240-600 px range and saves only the width on release', async () => {
      onAIStudio();
      await mount();
      expect([width()!.min, width()!.max, width()!.value]).toEqual(['240', '600', '280']);
      drag(width()!, 400);
      expect(extensionApi.storage.sync.set).not.toHaveBeenCalled();
      await act(async () => width()!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
      // The unstored switch still follows the folders, so the width alone is written.
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.AISTUDIO_SIDEBAR_WIDTH]: 400,
      });
    });

    it('is not a Gemini row', async () => {
      await mount();
      expect(row(id)).toBeNull();
    });
  });

  describe('the timeline row', () => {
    const id = OFFICIAL_PLUGIN_IDS.geminiTimeline;
    const radios = (group: string) =>
      [
        ...row(id)!.querySelectorAll<HTMLButtonElement>(
          `[role="radiogroup"][aria-label="${group}"] [role="radio"]`,
        ),
      ].map((radio) => [radio.textContent, radio.getAttribute('aria-checked'), radio.disabled]);
    const radio = (group: string, label: string) =>
      row(id)!.querySelector<HTMLButtonElement>(
        `[role="radiogroup"][aria-label="${group}"] [role="radio"]:nth-child(${
          [
            TRANSLATIONS.en.timelineStyleDots,
            TRANSLATIONS.en.timelineStyleRuler,
            TRANSLATIONS.en.timelineStyleCompact,
          ].indexOf(label) + 1
        })`,
      )!;
    const option = (inputId: string) => row(id)!.querySelector<HTMLInputElement>(`#${inputId}`)!;
    const button = (label: string) =>
      [...row(id)!.querySelectorAll('button')].find((candidate) => candidate.textContent === label);

    it('replaces the Gemini timeline card, its options under the row', async () => {
      await mount();
      expect(container.querySelector('#timeline-enabled')).toBeNull();
      expect(
        [...container.querySelectorAll('h3')].map((heading) => heading.textContent),
      ).not.toContain(TRANSLATIONS.en.timelineOptions);
      expect(toggle(id).checked).toBe(true);
      await openOptions(id);
      expect(option('draggable-timeline')).not.toBeNull();
      // Message times are a row of their own, so the panel does not repeat them.
      expect(row(id)!.querySelector('#show-message-timestamps')).toBeNull();
    });

    it('shows the stored style and scroll mode as checked radios', async () => {
      sync[StorageKeys.TIMELINE_STYLE] = 'compact';
      sync.geminiTimelineScrollMode = 'jump';
      await mount();
      await openOptions(id);
      expect(radios(TRANSLATIONS.en.timelineStyle)).toEqual([
        [TRANSLATIONS.en.timelineStyleDots, 'false', false],
        [TRANSLATIONS.en.timelineStyleRuler, 'false', false],
        [TRANSLATIONS.en.timelineStyleCompact, 'true', false],
      ]);
      expect(radios(TRANSLATIONS.en.scrollMode)).toEqual([
        [TRANSLATIONS.en.flow, 'false', false],
        [TRANSLATIONS.en.jump, 'true', false],
      ]);
      // Off dots there is no container to hide.
      expect(option('hide-container').disabled).toBe(true);
    });

    it('writes each option under its old key', async () => {
      await mount();
      await openOptions(id);
      await act(async () =>
        radio(TRANSLATIONS.en.timelineStyle, TRANSLATIONS.en.timelineStyleRuler).click(),
      );
      await act(async () => option('draggable-timeline').click());
      expect(extensionApi.storage.sync.set.mock.calls.map(([payload]) => payload)).toEqual([
        { [StorageKeys.TIMELINE_STYLE]: 'ruler' },
        { geminiTimelineDraggable: true },
      ]);
      expect(pluginStateWritten()).toBe(false);
    });

    it('node levels allow only dots, and turning them on writes dots with them', async () => {
      sync[StorageKeys.TIMELINE_STYLE] = 'ruler';
      await mount();
      await openOptions(id);
      await act(async () => option('marker-level-enabled').click());
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        geminiTimelineMarkerLevel: true,
        [StorageKeys.TIMELINE_STYLE]: 'dots',
      });
      expect(
        radios(TRANSLATIONS.en.timelineStyle).map(([, checked, disabled]) => [checked, disabled]),
      ).toEqual([
        ['true', false],
        ['false', true],
        ['false', true],
      ]);
    });

    it('resets only the saved position and opens the Saved Library', async () => {
      await mount();
      await openOptions(id);
      await act(async () => button(TRANSLATIONS.en.resetTimelinePosition)!.click());
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        geminiTimelinePosition: null,
      });
      await act(async () => button(TRANSLATIONS.en.viewStarredHistory)!.click());
      expect(row(id)).toBeNull();
    });

    it.each(['ruler', '收藏', TRANSLATIONS.zh.timelineOptions])(
      'a search for "%s" lists the row with its options open',
      async (query) => {
        local[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY] = query;
        await mount();
        expect(optionsButton(id)!.getAttribute('aria-expanded')).toBe('true');
        expect(option('draggable-timeline')).not.toBeNull();
      },
    );
  });

  describe('in other languages', () => {
    it('names the rows and Options from the Chinese manifests and messages', async () => {
      sync[StorageKeys.LANGUAGE] = 'zh';
      await mount();
      const label = (pluginId: string) => row(pluginId)!.querySelector('label')!.textContent;
      expect(label(OFFICIAL_PLUGIN_IDS.geminiTimeline)).toBe('显示时间线');
      expect(label(OFFICIAL_PLUGIN_IDS.geminiMessageTimestamps)).toBe('消息时间戳');
      expect(optionsButton(OFFICIAL_PLUGIN_IDS.geminiTimeline)!.textContent).toBe(
        TRANSLATIONS.zh.pluginRowOptions,
      );
    });

    it('mirrors the Plugins card for Arabic, on Gemini and AI Studio', async () => {
      sync[StorageKeys.LANGUAGE] = 'ar';
      await mount();
      const card = () => row(OFFICIAL_PLUGIN_IDS.geminiTimeline)!.closest('[dir]');
      expect(card()!.getAttribute('dir')).toBe('rtl');
      await act(async () => root.unmount());
      root = createRoot(container);
      extensionApi.tabs.query.mockResolvedValue([{ id: 8, url: AI_STUDIO }]);
      await mount();
      expect(
        row(OFFICIAL_PLUGIN_IDS.aistudioSidebarWidth)!.closest('[dir]')!.getAttribute('dir'),
      ).toBe('rtl');
    });
  });

  describe('the recent Gems row', () => {
    const id = OFFICIAL_PLUGIN_IDS.geminiGemsSidebar;
    const count = () => row(id)!.querySelector<HTMLInputElement>('input[type="range"]');

    it.each([undefined, false, true])(
      'keeps Recent Gems disabled and off with stored enabled=%s, without writing on click',
      async (stored) => {
        if (stored !== undefined) sync[StorageKeys.GV_GEMS_SIDEBAR_ENABLED] = stored;
        sync[StorageKeys.GV_GEMS_SIDEBAR_COUNT] = 6;
        await mount();
        expect(toggle(id).disabled).toBe(true);
        expect(toggle(id).checked).toBe(false);
        expect(count()).toBeNull();
        expect(optionsButton(id)).toBeNull();
        expect(row(id)!.textContent).toContain(TRANSLATIONS.en.gemsSidebarUnavailableHint);
        const describedBy = toggle(id).getAttribute('aria-describedby')!.split(' ');
        expect(describedBy.map((id) => document.getElementById(id)!.textContent)).toContain(
          TRANSLATIONS.en.gemsSidebarUnavailableHint,
        );
        extensionApi.storage.sync.set.mockClear();
        extensionApi.storage.local.set.mockClear();
        await act(async () => {
          toggle(id).click();
          row(id)!.querySelector<HTMLLabelElement>('label')!.click();
        });
        expect(toggle(id).checked).toBe(false);
        expect(extensionApi.storage.sync.set).not.toHaveBeenCalled();
        expect(extensionApi.storage.local.set).not.toHaveBeenCalled();
        expect(sync[StorageKeys.GV_GEMS_SIDEBAR_ENABLED]).toBe(stored);
        expect(sync[StorageKeys.GV_GEMS_SIDEBAR_COUNT]).toBe(6);
      },
    );

    it('remains searchable with its controls hidden after settings change elsewhere', async () => {
      local[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY] = 'notebook';
      await mount();
      expect(row(id)).not.toBeNull();
      await act(async () => emitSyncChange({ [StorageKeys.GV_GEMS_SIDEBAR_ENABLED]: true }));
      expect(toggle(id).disabled).toBe(true);
      expect(toggle(id).checked).toBe(false);
      expect(count()).toBeNull();
      expect(optionsButton(id)).toBeNull();
    });
  });

  describe('the visual effects row', () => {
    const id = OFFICIAL_PLUGIN_IDS.visualEffects;
    const choices = () =>
      [...row(id)!.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].map((button) => [
        button.textContent,
        button.getAttribute('aria-pressed'),
      ]);
    const choice = (label: string) =>
      [...row(id)!.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(
        (button) => button.textContent === label,
      )!;
    // Effect choices anywhere but under the row: the retired card's.
    const choicesOffTheRow = () =>
      [...container.querySelectorAll('button[aria-pressed]')].filter(
        (button) => !row(id)?.contains(button),
      );

    it.each([
      ['missing', {}, false],
      ['off', { [StorageKeys.GV_VISUAL_EFFECT]: 'off' }, false],
      ['legacy snow', { [StorageKeys.GV_SNOW_EFFECT]: true }, true],
      ['sakura', { [StorageKeys.GV_VISUAL_EFFECT]: 'sakura' }, true],
    ] as const)(
      'replaces the old card on Gemini and reads a %s stored effect as the page does',
      async (_label, stored, on) => {
        Object.assign(sync, stored);
        await mount();
        expect(choicesOffTheRow()).toEqual([]);
        expect(toggle(id).checked).toBe(on);
        expect(row(id)!.querySelectorAll('button[aria-pressed]').length).toBe(on ? 3 : 0);
      },
    );

    it('offers Snow, Sakura and Rain under the row, since Off is its switch', async () => {
      sync[StorageKeys.GV_SNOW_EFFECT] = true;
      await mount();
      expect(choices()).toEqual([
        [TRANSLATIONS.en.visualEffectSnow, 'true'],
        [TRANSLATIONS.en.visualEffectSakura, 'false'],
        [TRANSLATIONS.en.visualEffectRain, 'false'],
      ]);
    });

    it('picking an effect writes the pair the card always wrote', async () => {
      sync[StorageKeys.GV_VISUAL_EFFECT] = 'snow';
      await mount();
      await act(async () => choice(TRANSLATIONS.en.visualEffectRain).click());
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.GV_VISUAL_EFFECT]: 'rain',
        [StorageKeys.GV_SNOW_EFFECT]: false,
      });
      expect(choice(TRANSLATIONS.en.visualEffectRain).getAttribute('aria-pressed')).toBe('true');
      expect(pluginStateWritten()).toBe(false);
    });

    it('its switch turns the effect off, and on again as Snow', async () => {
      sync[StorageKeys.GV_VISUAL_EFFECT] = 'sakura';
      await mount();
      await act(async () => toggle(id).click());
      await act(async () => toggle(id).click());
      expect(extensionApi.storage.sync.set.mock.calls.map(([payload]) => payload)).toEqual([
        { [StorageKeys.GV_VISUAL_EFFECT]: 'off', [StorageKeys.GV_SNOW_EFFECT]: false },
        { [StorageKeys.GV_VISUAL_EFFECT]: 'snow', [StorageKeys.GV_SNOW_EFFECT]: false },
      ]);
      expect(choice(TRANSLATIONS.en.visualEffectSnow).getAttribute('aria-pressed')).toBe('true');
    });

    it('is a row on AI Studio too', async () => {
      extensionApi.tabs.query.mockResolvedValue([{ id: 8, url: AI_STUDIO }]);
      sync[StorageKeys.GV_VISUAL_EFFECT] = 'rain';
      await mount();
      expect(choicesOffTheRow()).toEqual([]);
      expect(toggle(id).checked).toBe(true);
    });

    it('a custom site lists the same row in its plugin card, and no card', async () => {
      extensionApi.tabs.query.mockResolvedValue([{ id: 9, url: 'https://example.com/chat' }]);
      extensionApi.permissions.contains.mockResolvedValue(true);
      sync[StorageKeys.PROMPT_CUSTOM_WEBSITES] = ['example.com'];
      sync[StorageKeys.GV_VISUAL_EFFECT] = 'rain';
      await mount();
      expect(toggle(id).checked).toBe(true);
      expect(choicesOffTheRow()).toEqual([]);
      expect(container.textContent).not.toContain(TRANSLATIONS.en.visualEffectHint);
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

    const deferSync = () => {
      const pending = { answer: (_response: unknown) => {} };
      extensionApi.tabs.sendMessage.mockImplementation((_tabId: number, message: unknown) =>
        isSyncRequest(message)
          ? new Promise((resolve) => (pending.answer = resolve))
          : Promise.resolve(),
      );
      return pending;
    };
    const syncRequests = () =>
      extensionApi.tabs.sendMessage.mock.calls.filter(([, message]) => isSyncRequest(message));
    const typeSearch = async (query: string) => {
      const box = container.querySelector<HTMLInputElement>('input[type="search"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, query);
        box.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };

    it('a search that hides the Plugins card mid-sync does not allow a second sync', async () => {
      sync[StorageKeys.CONTEXT_SYNC_ENABLED] = true;
      const pending = deferSync();
      await mount();
      await openOptions(id);
      await act(async () => syncButton()!.click());
      await typeSearch(TRANSLATIONS.en.pinTimelinePreview);
      expect(row(id)).toBeNull();
      await typeSearch('');
      await openOptions(id);
      await act(async () => {});
      expect(syncButton()!.disabled).toBe(true);
      await act(async () => syncButton()!.click());
      expect(syncRequests()).toHaveLength(1);
      await act(async () => pending.answer({ status: 'success' }));
      expect(row(id)!.textContent).toContain(TRANSLATIONS.en.syncedSuccess);
    });

    it('a success that lands while Options is closed waits to be seen, then fades', async () => {
      sync[StorageKeys.CONTEXT_SYNC_ENABLED] = true;
      const pending = deferSync();
      await mount();
      await openOptions(id);
      await act(async () => syncButton()!.click());
      await openOptions(id);
      vi.useFakeTimers();
      try {
        await act(async () => pending.answer({ status: 'success' }));
        await act(async () => vi.advanceTimersByTime(10_000));
        await openOptions(id);
        expect(row(id)!.textContent).toContain(TRANSLATIONS.en.syncedSuccess);
        await act(async () => vi.advanceTimersByTime(3_000));
        expect(row(id)!.textContent).not.toContain(TRANSLATIONS.en.syncedSuccess);
      } finally {
        vi.useRealTimers();
      }
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
