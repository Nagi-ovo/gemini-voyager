import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '@/contexts/LanguageContext';
import { StorageKeys } from '@/core/types/common';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { TRANSLATIONS } from '@/utils/translations';

import Popup from '../../Popup';
import { UNDO_TOAST_MS } from '../../hooks/useUndoToast';
import { AI_STUDIO, extensionApi, popupRows, resetPopupBrowser } from './popupHarness';

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

const en = TRANSLATIONS.en;

/** The topic cards, the table of contents above them, and the undo offer after a flip. */
describe('the official plugin topic cards', () => {
  let container: HTMLDivElement;
  let root: Root;
  let local: Record<string, unknown>;
  let sync: Record<string, unknown>;
  const scrolled: { element: Element; options: ScrollIntoViewOptions | undefined }[] = [];
  const nativeScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    ({ local, sync } = resetPopupBrowser());
    scrolled.length = 0;
    // jsdom has no layout; record what the table of contents asks to bring into view.
    Element.prototype.scrollIntoView = function (this: Element, options?: unknown) {
      scrolled.push({ element: this, options: options as ScrollIntoViewOptions });
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Element.prototype.scrollIntoView = nativeScrollIntoView;
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
  const topics = () =>
    [...container.querySelectorAll<HTMLElement>('[data-plugin-topic]')].map(
      (card) => card.dataset.pluginTopic,
    );
  const toc = () => container.querySelector<HTMLElement>(`nav[aria-label="${en.popupTocLabel}"]`);
  const tocLinks = () =>
    [...(toc()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].map(
      (link) => link.textContent,
    );
  const toast = () => container.querySelector<HTMLElement>('[role="status"]:has(button)');
  const typeSearch = async (query: string) => {
    const box = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, query);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const rowName = (id: string) => row(id)!.querySelector('label')!.textContent!;

  describe('the table of contents', () => {
    it('names the cards on screen in their order, Cloud Sync first', async () => {
      await mount();
      expect(tocLinks()).toEqual([
        en.cloudSync,
        en.pluginTopicLayoutShort,
        en.pluginTopicSidebarShort,
        en.pluginTopicTimelineShort,
        en.pluginTopicContentShort,
        en.pluginTopicChartsShort,
        en.pluginTopicExportShort,
        en.pluginTopicInputShort,
        en.pluginTopicConversationsShort,
        en.localPluginsTitle,
        en.folder_title,
        en.popupTocShortcuts,
        en.popupTocPrompts,
        en.popupTocGeneral,
      ]);
    });

    it('scrolls the chosen card into view below the header, smoothly unless motion is reduced', async () => {
      await mount();
      const link = (label: string) =>
        [...toc()!.querySelectorAll('button')].find((button) => button.textContent === label)!;
      await act(async () => link(en.pluginTopicChartsShort).click());
      expect(scrolled).toHaveLength(1);
      expect(scrolled[0].element.contains(row(OFFICIAL_PLUGIN_IDS.geminiMermaid))).toBe(true);
      expect(scrolled[0].options).toEqual({ block: 'start', behavior: 'smooth' });

      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({ matches: query.includes('reduce') })),
      );
      await act(async () => link(en.cloudSync).click());
      expect(scrolled[1].element.textContent).toContain(en.cloudSyncDescription);
      expect(scrolled[1].options).toEqual({ block: 'start', behavior: 'auto' });
    });

    it('leaves out the cards a site does not show', async () => {
      extensionApi.tabs.query.mockResolvedValue([{ id: 8, url: AI_STUDIO }]);
      await mount();
      expect(tocLinks()).toEqual([
        en.cloudSync,
        en.pluginTopicLayoutShort,
        en.pluginTopicSidebarShort,
        en.pluginTopicContentShort,
        en.pluginTopicInputShort,
        en.pluginTopicConversationsShort,
        en.localPluginsTitle,
        en.folder_title,
        en.popupTocPrompts,
        en.popupTocGeneral,
      ]);
    });

    it('steps aside while searching', async () => {
      await mount();
      await typeSearch('mermaid');
      expect(toc()).toBeNull();
      await typeSearch('');
      expect(toc()).not.toBeNull();
    });

    it('mirrors for Arabic', async () => {
      sync[StorageKeys.LANGUAGE] = 'ar';
      await mount();
      expect(container.querySelector('nav')!.getAttribute('dir')).toBe('rtl');
    });
  });

  describe('searching', () => {
    it('keeps only the cards with a matching row, and only those rows', async () => {
      local[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY] = 'mermaid';
      await mount();
      expect(topics()).toEqual(['pluginsCharts']);
      expect(popupRows(container).listedIds()).toEqual([OFFICIAL_PLUGIN_IDS.geminiMermaid]);
    });

    it('lists a whole card when its title matches', async () => {
      local[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY] = en.pluginTopicCharts;
      await mount();
      expect(topics()).toContain('pluginsCharts');
      const charts = container.querySelector('[data-plugin-topic="pluginsCharts"]')!;
      expect(charts.querySelectorAll('[data-official-plugin]')).toHaveLength(3);
    });

    it('still lists every card for the old Plugins card title', async () => {
      local[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY] = en.pluginsTitle;
      await mount();
      expect(topics()).toHaveLength(8);
    });
  });

  describe('the undo offer', () => {
    it('after a flip, puts the stored value back through the same write', async () => {
      const id = OFFICIAL_PLUGIN_IDS.geminiMermaid;
      await mount();
      expect(toggle(id).checked).toBe(true);
      await act(async () => toggle(id).click());
      expect(sync[StorageKeys.MERMAID_ENABLED]).toBe(false);
      expect(toast()!.textContent).toContain(
        en.pluginToggleToastOff.replace('{name}', rowName(id)),
      );
      const undo = [...toast()!.querySelectorAll('button')].find(
        (button) => button.textContent === en.pluginToggleUndo,
      )!;
      await act(async () => undo.click());
      expect(extensionApi.storage.sync.set.mock.calls.map(([payload]) => payload)).toEqual([
        { [StorageKeys.MERMAID_ENABLED]: false },
        { [StorageKeys.MERMAID_ENABLED]: true },
      ]);
      expect(toggle(id).checked).toBe(true);
      expect(toast()).toBeNull();
    });

    it('undoes a paired write as a pair', async () => {
      const id = OFFICIAL_PLUGIN_IDS.geminiWatermarkPreview;
      sync[StorageKeys.WATERMARK_DOWNLOAD_ENABLED] = true;
      sync[StorageKeys.WATERMARK_PREVIEW_ENABLED] = false;
      await mount();
      await act(async () => toggle(id).click());
      expect(toast()!.textContent).toContain(en.pluginToggleToastOn.replace('{name}', rowName(id)));
      await act(async () => toast()!.querySelector('button')!.click());
      expect(sync[StorageKeys.WATERMARK_DOWNLOAD_ENABLED]).toBe(true);
      expect(sync[StorageKeys.WATERMARK_PREVIEW_ENABLED]).toBe(false);
    });

    it('closes by itself after a few seconds, without writing', async () => {
      await mount();
      vi.useFakeTimers();
      await act(async () => toggle(OFFICIAL_PLUGIN_IDS.geminiECharts).click());
      expect(toast()).not.toBeNull();
      await act(async () => vi.advanceTimersByTime(UNDO_TOAST_MS - 1));
      expect(toast()).not.toBeNull();
      await act(async () => vi.advanceTimersByTime(1));
      expect(toast()).toBeNull();
      expect(extensionApi.storage.sync.set).toHaveBeenCalledTimes(1);
    });

    it('is not offered for an option under a row', async () => {
      await mount();
      const notion = [
        ...row(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy)!.querySelectorAll<HTMLInputElement>(
          'input[type="radio"]',
        ),
      ].find((input) => input.closest('label')!.textContent === en.formulaCopyFormatNotion)!;
      await act(async () => notion.click());
      expect(sync[StorageKeys.FORMULA_COPY_FORMAT]).toBe('notion');
      expect(toast()).toBeNull();
    });
  });
});
