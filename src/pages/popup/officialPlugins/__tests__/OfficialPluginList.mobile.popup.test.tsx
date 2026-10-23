import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '@/contexts/LanguageContext';
import { StorageKeys } from '@/core/types/common';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { TRANSLATIONS } from '@/utils/translations';

import Popup from '../../Popup';
import { extensionApi, popupRows, resetPopupBrowser } from './popupHarness';

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

const ON_PHONES_NOTE = TRANSLATIONS.en.pluginUnavailableOnMobile;

describe('the official plugin list on Firefox for Android', () => {
  let container: HTMLDivElement;
  let root: Root;
  let sync: Record<string, unknown>;

  beforeEach(() => {
    ({ sync } = resetPopupBrowser());
    (extensionApi.runtime as { getPlatformInfo?: unknown }).getPlatformInfo = async () => ({
      os: 'android',
    });
    // The popup is its own tab there: the Gemini page answers nothing.
    extensionApi.tabs.sendMessage.mockRejectedValue(new Error('No receiving end'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (extensionApi.runtime as { getPlatformInfo?: unknown }).getPlatformInfo;
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

  it('greys a desktop-only row with why, and keeps the stored choice', async () => {
    sync[StorageKeys.CHAT_WIDTH_ENABLED] = true;
    await mount();
    const { row, toggle } = popupRows(container);

    const chatWidth = row(OFFICIAL_PLUGIN_IDS.geminiChatWidth)!;
    expect(chatWidth.textContent).toContain(ON_PHONES_NOTE);
    expect(toggle(OFFICIAL_PLUGIN_IDS.geminiChatWidth).disabled).toBe(true);
    expect(toggle(OFFICIAL_PLUGIN_IDS.geminiChatWidth).checked).toBe(false);
    await act(async () => toggle(OFFICIAL_PLUGIN_IDS.geminiChatWidth).click());
    expect(extensionApi.storage.sync.set).not.toHaveBeenCalled();
    expect(sync[StorageKeys.CHAT_WIDTH_ENABLED]).toBe(true);
  });

  it('leaves the timeline and export rows as on a desktop', async () => {
    await mount();
    const { row, toggle } = popupRows(container);

    for (const id of [OFFICIAL_PLUGIN_IDS.geminiTimeline, OFFICIAL_PLUGIN_IDS.geminiExport]) {
      expect(row(id)!.textContent).not.toContain(ON_PHONES_NOTE);
      expect(toggle(id).disabled).toBe(false);
    }
  });
});
