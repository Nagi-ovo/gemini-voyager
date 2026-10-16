import { useCallback, useEffect, useMemo, useState } from 'react';

import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import type { TranslationKey } from '@/utils/translations';

import type { PopupSectionProps } from '../components/PopupSection';
import {
  NATIVE_POPUP_SECTION_IDS,
  type NativePopupPlatform,
  type NativePopupSectionId,
  POPUP_SECTION_SEARCH_SETTING_ID,
  isNativePopupSectionAvailable,
  isNativePopupSettingAvailable,
} from '../utils/nativeSiteCapabilities';
import {
  POPUP_SETTINGS_SEARCH_ITEMS,
  type PopupSettingsSearchItem,
  type PopupSettingsSearchTargetId,
} from '../utils/popupSettingsSearchIndex';
import {
  getSettingsSearchMatches,
  normalizePersistedSettingsSearchQuery,
} from '../utils/settingsSearch';

export type PopupSectionId = NativePopupSectionId;

export const SECTION_LAYOUT_STORAGE_DEFAULTS = { [StorageKeys.GV_POPUP_SECTION_ORDER]: null };

const DEFAULT_SECTION_ORDER: readonly PopupSectionId[] = NATIVE_POPUP_SECTION_IDS;
const NO_EXTRA_SEARCH_ITEMS: readonly PopupSettingsSearchItem[] = [];
const VALUE_BADGE_SECTION_IDS = new Set<PopupSectionId>(['folderSpacing', 'folderTreeIndent']);

/**
 * A saved order predates any section added since it was written. Each missing
 * section goes back after its default predecessor, so a section placed high by
 * default does not land at the bottom for everyone who once reordered.
 */
function withMissingSections(saved: readonly PopupSectionId[]): PopupSectionId[] {
  const order = [...saved];
  DEFAULT_SECTION_ORDER.forEach((id, index) => {
    if (order.includes(id)) return;
    const previous = DEFAULT_SECTION_ORDER[index - 1];
    order.splice(previous === undefined ? 0 : order.indexOf(previous) + 1, 0, id);
  });
  return order;
}

export interface PopupSectionsOptions {
  nativePopupPlatform: NativePopupPlatform;
  isPluginSite: boolean;
  /** Whether the official plugin list has rows on this tab; an empty list takes no slot. */
  officialPluginsAvailable?: boolean;
  /** One search target per listed official plugin, built from what the list shows. */
  officialPluginSearchItems?: readonly PopupSettingsSearchItem[];
  t: (key: TranslationKey) => string;
  writeSyncStorage: (payload: Record<string, unknown>) => Promise<void>;
}

export interface PopupSectionOptions {
  allowPluginSite?: boolean;
  /** Flex order on plugin sites, where the saved native order does not apply. */
  pluginSiteOrder?: number;
}

/** Persisted section order, settings search and the active platform's visibility rules. */
export function usePopupSections({
  nativePopupPlatform,
  isPluginSite,
  officialPluginsAvailable = false,
  officialPluginSearchItems = NO_EXTRA_SEARCH_ITEMS,
  t,
  writeSyncStorage,
}: PopupSectionsOptions) {
  const [sectionOrder, setSectionOrder] = useState<PopupSectionId[]>([...DEFAULT_SECTION_ORDER]);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    void browser.storage.local
      .get({ [StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY]: '' })
      .then((result) => {
        if (!cancelled) {
          setSettingsSearchQuery(
            normalizePersistedSettingsSearchQuery(
              result[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY],
            ),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettingsSearchQuery = useCallback((query: string) => {
    setSettingsSearchQuery(query);
    void browser.storage.local
      .set({ [StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY]: query })
      .catch(() => undefined);
  }, []);

  // The popup supplies this from its existing single bulk settings read.
  const hydrateFromStorage = useCallback((stored: Record<string, unknown>) => {
    const storedOrder = stored[StorageKeys.GV_POPUP_SECTION_ORDER];
    if (!Array.isArray(storedOrder)) return;
    const validIds = new Set<string>(NATIVE_POPUP_SECTION_IDS);
    const filtered = storedOrder.filter(
      (id: unknown): id is PopupSectionId => typeof id === 'string' && validIds.has(id),
    );
    setSectionOrder(withMissingSections(filtered));
  }, []);

  const isSectionVisible = useCallback(
    (id: PopupSectionId): boolean => {
      // The plugin list needs a row on this tab.
      if (id === 'officialPlugins' && !officialPluginsAvailable) return false;
      return isNativePopupSectionAvailable(nativePopupPlatform, id);
    },
    [nativePopupPlatform, officialPluginsAvailable],
  );
  const visibleSections = useMemo(
    () => sectionOrder.filter(isSectionVisible),
    [sectionOrder, isSectionVisible],
  );
  const hasSettingsSearch = settingsSearchQuery.trim().length > 0;
  const searchItems = useMemo<readonly PopupSettingsSearchItem[]>(
    () => [...POPUP_SETTINGS_SEARCH_ITEMS, ...officialPluginSearchItems],
    [officialPluginSearchItems],
  );
  const settingsSearchMatches = useMemo(
    () =>
      getSettingsSearchMatches(
        searchItems.filter((item) =>
          isNativePopupSettingAvailable(nativePopupPlatform, item.sectionId, item.settingId),
        ),
        settingsSearchQuery,
      ),
    [nativePopupPlatform, searchItems, settingsSearchQuery],
  );
  const settingsSearchSections = useMemo(() => {
    if (!hasSettingsSearch) return new Set<PopupSectionId>(visibleSections);
    const sections = new Set<PopupSectionId>();
    for (const item of searchItems) {
      if (settingsSearchMatches.has(item.id)) sections.add(item.sectionId);
    }
    return sections;
  }, [hasSettingsSearch, searchItems, settingsSearchMatches, visibleSections]);
  const displayedSections = hasSettingsSearch
    ? visibleSections.filter((id) => settingsSearchSections.has(id))
    : visibleSections;

  const shouldShowSetting = useCallback(
    (sectionId: PopupSectionId, settingId: string): boolean => {
      if (!isNativePopupSettingAvailable(nativePopupPlatform, sectionId, settingId)) return false;
      const sectionTarget: PopupSettingsSearchTargetId = `${sectionId}:${POPUP_SECTION_SEARCH_SETTING_ID}`;
      const settingTarget: PopupSettingsSearchTargetId = `${sectionId}:${settingId}`;
      return (
        !hasSettingsSearch ||
        settingsSearchMatches.has(sectionTarget) ||
        settingsSearchMatches.has(settingTarget)
      );
    },
    [nativePopupPlatform, hasSettingsSearch, settingsSearchMatches],
  );

  const moveSectionInOrder = useCallback(
    (sectionId: PopupSectionId, direction: 'up' | 'down') => {
      setSectionOrder((prev) => {
        const idx = prev.indexOf(sectionId);
        if (idx === -1) return prev;
        const step = direction === 'up' ? -1 : 1;
        let swapIdx = idx + step;
        while (swapIdx >= 0 && swapIdx < prev.length && !isSectionVisible(prev[swapIdx])) {
          swapIdx += step;
        }
        if (swapIdx < 0 || swapIdx >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        void writeSyncStorage({ [StorageKeys.GV_POPUP_SECTION_ORDER]: next });
        return next;
      });
    },
    [isSectionVisible, writeSyncStorage],
  );

  const getSectionProps = (
    id: PopupSectionId,
    options: PopupSectionOptions = {},
  ): Omit<PopupSectionProps, 'children'> => ({
    // Plugin sites hide native search controls, so permitted sections ignore the saved query.
    visible:
      (!isPluginSite || options.allowPluginSite === true) &&
      isSectionVisible(id) &&
      (isPluginSite || !hasSettingsSearch || settingsSearchSections.has(id)),
    // Keep the stored slot even while hidden; the quota card is placed after cloud sync.
    order:
      isPluginSite && options.pluginSiteOrder !== undefined
        ? options.pluginSiteOrder
        : sectionOrder.indexOf(id) * 2,
    reorder:
      !isPluginSite && !hasSettingsSearch
        ? {
            isFirst: displayedSections[0] === id,
            isLast: displayedSections[displayedSections.length - 1] === id,
            hasValueBadge: VALUE_BADGE_SECTION_IDS.has(id),
            onMoveUp: () => moveSectionInOrder(id, 'up'),
            onMoveDown: () => moveSectionInOrder(id, 'down'),
            moveUpLabel: t('moveSectionUp'),
            moveDownLabel: t('moveSectionDown'),
          }
        : undefined,
  });

  return {
    settingsSearchQuery,
    updateSettingsSearchQuery,
    hasSettingsSearch,
    hasVisibleSearchResults: displayedSections.length > 0,
    shouldShowSetting,
    hydrateFromStorage,
    getSectionProps,
  };
}
