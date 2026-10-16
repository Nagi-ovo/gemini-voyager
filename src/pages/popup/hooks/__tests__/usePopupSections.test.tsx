import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { TRANSLATIONS, type TranslationKey } from '@/utils/translations';

import { PopupSection } from '../../components/PopupSection';
import { NATIVE_POPUP_SECTION_IDS } from '../../utils/nativeSiteCapabilities';
import { usePopupSections, type PopupSectionsOptions } from '../usePopupSections';

vi.mock('webextension-polyfill', () => ({
  default: { storage: { local: { get: vi.fn(), set: vi.fn() } } },
}));

type Sections = ReturnType<typeof usePopupSections>;
const translate = (key: TranslationKey) => TRANSLATIONS.en[key];

function Harness({
  capture,
  ...options
}: PopupSectionsOptions & { capture: (sections: Sections) => void }) {
  const sections = usePopupSections(options);
  useEffect(() => capture(sections), [capture, sections]);
  return NATIVE_POPUP_SECTION_IDS.map((id) => (
    <PopupSection
      key={id}
      {...sections.getSectionProps(id, { allowPluginSite: id === 'visualEffect' })}
    >
      <span data-section={id}>{id}</span>
    </PopupSection>
  ));
}

describe('usePopupSections', () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let sections: Sections;
  const writeSyncStorage = vi.fn(async (_payload: Record<string, unknown>) => undefined);
  const capture = (value: Sections) => {
    sections = value;
  };

  async function render(options: Partial<PopupSectionsOptions> = {}) {
    await act(async () => {
      root?.render(
        <Harness
          nativePopupPlatform="gemini"
          isPluginSite={false}
          visualEffectsAvailable
          t={translate}
          writeSyncStorage={writeSyncStorage}
          {...options}
          capture={capture}
        />,
      );
    });
  }

  function section(id: string) {
    return container.querySelector(`[data-section="${id}"]`)?.parentElement;
  }

  async function search(query: string) {
    await act(async () => sections.updateSettingsSearchQuery(query));
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
  });

  it('hydrates known slots without writing and keeps one stable bulk-read callback', async () => {
    await render();
    const hydrate = sections.hydrateFromStorage;
    await act(async () =>
      hydrate({
        // Cards that became Plugins rows stay in old saved orders; they hold no slot now.
        [StorageKeys.GV_POPUP_SECTION_ORDER]: [
          'folder',
          'contextSync',
          'formulaCopy',
          'gemsSidebar',
          'retired',
          17,
          'cloudSync',
        ],
      }),
    );

    const cloudSyncOrder = Number(section('cloudSync')?.style.order);
    expect(section('folder')?.style.order).toBe('0');
    expect(cloudSyncOrder).toBeGreaterThan(0);
    expect(Number(section('timeline')?.style.order)).toBe(cloudSyncOrder + 6);
    expect(section('contextSync')).toBeUndefined();
    // The plugin list takes no slot until it has a row on this tab.
    expect(section('officialPlugins')).toBeUndefined();
    expect(writeSyncStorage).not.toHaveBeenCalled();

    await render({ nativePopupPlatform: 'aistudio' });
    expect(sections.hydrateFromStorage).toBe(hydrate);
    expect(section('timeline')).toBeUndefined();
    expect(sections.getSectionProps('timeline').order).toBe(cloudSyncOrder + 6);
    expect(browser.storage.local.get).toHaveBeenCalledTimes(1);
  });

  it('moves between visible sections while preserving hidden platform and plugin slots', async () => {
    await render({ nativePopupPlatform: 'aistudio' });
    const initial = NATIVE_POPUP_SECTION_IDS.filter((id) => id !== 'cloudSync' && id !== 'folder');
    const saved = ['folder', ...initial.slice(0, 4), 'cloudSync', ...initial.slice(4)];
    await act(async () =>
      sections.hydrateFromStorage({ [StorageKeys.GV_POPUP_SECTION_ORDER]: saved }),
    );
    // timeline is hidden on AI Studio and the plugin list has no rows here; folderSpacing is
    // the next visible slot.
    expect(saved.slice(1, 6)).toEqual([
      'officialPlugins',
      'localPlugins',
      'timeline',
      'folderSpacing',
      'cloudSync',
    ]);
    const moveUp = section('cloudSync')?.querySelector<HTMLButtonElement>(
      `button[aria-label="${translate('moveSectionUp')}"]`,
    );
    expect(moveUp).toBeTruthy();
    await act(async () => moveUp?.click());

    const expected = [...saved];
    [expected[4], expected[5]] = [expected[5], expected[4]];
    expect(writeSyncStorage).toHaveBeenLastCalledWith({
      [StorageKeys.GV_POPUP_SECTION_ORDER]: expected,
    });
    expect(section('cloudSync')?.style.order).toBe('8');
    expect(section('folderSpacing')?.style.order).toBe('10');
    expect(section('timeline')).toBeUndefined();
    expect(section('officialPlugins')).toBeUndefined();
    expect(sections.getSectionProps('timeline').order).toBe(6);
    expect(sections.getSectionProps('officialPlugins').order).toBe(2);
  });

  it('puts a section added since the order was saved in its default slot, not at the bottom', async () => {
    await render({ officialPluginsAvailable: true });
    // An order saved before the plugin list existed, reversed, still holding the retired
    // 'plugins' slot.
    const saved = [
      ...NATIVE_POPUP_SECTION_IDS.filter((id) => id !== 'officialPlugins'),
      'plugins',
    ].reverse();
    await act(async () =>
      sections.hydrateFromStorage({ [StorageKeys.GV_POPUP_SECTION_ORDER]: saved }),
    );

    const after = (id: string) => Number(section(id)?.style.order);
    expect(after('officialPlugins')).toBe(after('cloudSync') + 2);
    expect(after('nanobanana')).toBe(0);
    expect(writeSyncStorage).not.toHaveBeenCalled();
  });

  it('filters rows, expands matching section titles and restores reordering after clearing', async () => {
    await render();
    await search(translate('pinTimelinePreview'));
    expect(sections.hasSettingsSearch).toBe(true);
    expect(sections.hasVisibleSearchResults).toBe(true);
    expect(section('timeline')).toBeTruthy();
    expect(sections.shouldShowSetting('timeline', 'pinTimelinePreview')).toBe(true);
    expect(sections.shouldShowSetting('timeline', 'hideOuterContainer')).toBe(false);
    expect(container.querySelector('button')).toBeNull();

    await search(translate('timelineOptions'));
    expect(sections.shouldShowSetting('timeline', 'hideOuterContainer')).toBe(true);
    expect(sections.shouldShowSetting('timeline', 'showMessageTimestamps')).toBe(true);

    await search('zzzzzzunknownsettingzzzzzz');
    expect(sections.hasVisibleSearchResults).toBe(false);
    expect(container.querySelector('[data-section]')).toBeNull();

    await search('');
    expect(sections.hasSettingsSearch).toBe(false);
    expect(container.querySelector('button')).toBeTruthy();
    expect(browser.storage.local.set).toHaveBeenLastCalledWith({
      [StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY]: '',
    });
    expect(writeSyncStorage).not.toHaveBeenCalled();
  });

  it('keeps unsupported AI Studio settings hidden even when a section title matches', async () => {
    await render({ nativePopupPlatform: 'aistudio' });
    await search(translate('folderOptions'));
    expect(section('folder')).toBeTruthy();
    expect(sections.shouldShowSetting('folder', 'enableFolderFeature')).toBe(true);
    expect(sections.shouldShowSetting('folder', 'enableForkFeature')).toBe(false);
    expect(section('timeline')).toBeUndefined();

    await search(translate('enableMermaidRendering'));
    expect(sections.shouldShowSetting('general', 'enableMermaidRendering')).toBe(false);
    expect(sections.hasVisibleSearchResults).toBe(false);
  });

  it('requires plugin-site allowance and visual availability without losing layout slots', async () => {
    await render({ isPluginSite: true });
    expect(section('cloudSync')).toBeUndefined();
    expect(sections.getSectionProps('cloudSync').order).toBe(0);
    expect(sections.getSectionProps('visualEffect').visible).toBe(false);
    expect(section('visualEffect')).toBeTruthy();
    expect(container.querySelectorAll('[data-section]')).toHaveLength(1);
    expect(container.querySelector('button')).toBeNull();

    await render({ isPluginSite: true, visualEffectsAvailable: false });
    expect(section('visualEffect')).toBeUndefined();
    expect(sections.getSectionProps('visualEffect', { allowPluginSite: true }).order).toBe(
      NATIVE_POPUP_SECTION_IDS.indexOf('visualEffect') * 2,
    );
  });

  it('restores an asynchronous local query and ignores a read completed after unmount', async () => {
    let resolveQuery!: (value: Record<string, unknown>) => void;
    vi.mocked(browser.storage.local.get).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }),
    );
    await render();
    expect(sections.settingsSearchQuery).toBe('');
    await act(async () =>
      resolveQuery({ [StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY]: 'timeline' }),
    );
    expect(sections.settingsSearchQuery).toBe('timeline');

    await act(async () => root?.unmount());
    root = createRoot(container);
    let resolveLateQuery!: (value: Record<string, unknown>) => void;
    vi.mocked(browser.storage.local.get).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLateQuery = resolve;
      }),
    );
    await render();
    const lastMountedOutput = sections;
    await act(async () => root?.unmount());
    root = null;
    await act(async () =>
      resolveLateQuery({ [StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY]: 'late query' }),
    );
    expect(sections).toBe(lastMountedOutput);
    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });
});
