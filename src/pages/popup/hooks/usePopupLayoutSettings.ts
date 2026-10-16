import { useCallback, useMemo, useState } from 'react';

import { StorageKeys } from '@/core/types/common';
import { useWidthAdjuster } from '@/hooks/useWidthAdjuster';

import {
  AI_STUDIO_SIDEBAR_PX,
  FOLDER_SPACING,
  FOLDER_TREE_INDENT,
  GEMS_SIDEBAR_COUNT,
  clampNumber,
} from '../utils/layoutSettings';

// Gemini's chat, edit input and sidebar appearance rows live in the Plugins card,
// which reads the live legacy snapshot; this card keeps only AI Studio's sidebar width.
export const LAYOUT_SETTINGS_STORAGE_DEFAULTS = {
  [StorageKeys.SIDEBAR_WIDTH_ENABLED]: false,
};

export interface PopupLayoutSettingsOptions {
  isAIStudio: boolean;
}

export function usePopupLayoutSettings({ isAIStudio }: PopupLayoutSettingsOptions) {
  const [sidebarWidthEnabled, setSidebarWidthEnabled] = useState(false);

  // AI Studio's sidebar width; Gemini's is the sidebar width row in the Plugins card.
  const sidebarConfig = useMemo(
    () => ({
      key: StorageKeys.AISTUDIO_SIDEBAR_WIDTH,
      min: AI_STUDIO_SIDEBAR_PX.min,
      max: AI_STUDIO_SIDEBAR_PX.max,
      def: AI_STUDIO_SIDEBAR_PX.defaultValue,
      norm: (v: number) => clampNumber(v, AI_STUDIO_SIDEBAR_PX.min, AI_STUDIO_SIDEBAR_PX.max),
    }),
    [],
  );

  const sidebarWidthAdjuster = useWidthAdjuster({
    storageKey: sidebarConfig.key,
    defaultValue: sidebarConfig.def,
    normalize: sidebarConfig.norm,
    onApply: useCallback(
      (widthPx: number) => {
        const clamped = sidebarConfig.norm(widthPx);
        try {
          chrome.storage?.sync?.set({ [sidebarConfig.key]: clamped });
        } catch {}
      },
      [sidebarConfig],
    ),
  });

  // Folder spacing adjuster (Context-aware: Gemini vs AI Studio)
  const folderSpacingKey = isAIStudio
    ? StorageKeys.GV_AISTUDIO_FOLDER_SPACING
    : StorageKeys.GV_FOLDER_SPACING;

  const folderSpacingAdjuster = useWidthAdjuster({
    storageKey: folderSpacingKey,
    defaultValue: FOLDER_SPACING.defaultValue,
    normalize: (v) => clampNumber(v, FOLDER_SPACING.min, FOLDER_SPACING.max),
    onApply: useCallback(
      (spacing: number) => {
        const clamped = clampNumber(spacing, FOLDER_SPACING.min, FOLDER_SPACING.max);
        try {
          chrome.storage?.sync?.set({ [folderSpacingKey]: clamped });
        } catch {}
      },
      [folderSpacingKey],
    ),
  });

  const folderTreeIndentAdjuster = useWidthAdjuster({
    storageKey: StorageKeys.GV_FOLDER_TREE_INDENT,
    defaultValue: FOLDER_TREE_INDENT.defaultValue,
    normalize: (v) => clampNumber(v, FOLDER_TREE_INDENT.min, FOLDER_TREE_INDENT.max),
    onApply: useCallback((indent: number) => {
      const clamped = clampNumber(indent, FOLDER_TREE_INDENT.min, FOLDER_TREE_INDENT.max);
      try {
        chrome.storage?.sync?.set({ [StorageKeys.GV_FOLDER_TREE_INDENT]: clamped });
      } catch {}
    }, []),
  });

  // Gems sidebar count — 0 hides the section, 1-10 controls how many recent
  // gems show above Notebooks. Persists to chrome.storage.sync so the
  // preference follows the user across devices.
  const gemsSidebarCountAdjuster = useWidthAdjuster({
    storageKey: StorageKeys.GV_GEMS_SIDEBAR_COUNT,
    defaultValue: GEMS_SIDEBAR_COUNT.defaultValue,
    normalize: (v) => clampNumber(v, GEMS_SIDEBAR_COUNT.min, GEMS_SIDEBAR_COUNT.max),
    onApply: useCallback((count: number) => {
      const clamped = clampNumber(count, GEMS_SIDEBAR_COUNT.min, GEMS_SIDEBAR_COUNT.max);
      try {
        chrome.storage?.sync?.set({ [StorageKeys.GV_GEMS_SIDEBAR_COUNT]: clamped });
      } catch {}
    }, []),
  });

  const hydrateFromStorage = useCallback((stored: Record<string, unknown>) => {
    setSidebarWidthEnabled(stored[StorageKeys.SIDEBAR_WIDTH_ENABLED] === true);
  }, []);

  const onSidebarWidthEnabledChange = useCallback((enabled: boolean) => {
    setSidebarWidthEnabled(enabled);
    try {
      chrome.storage?.sync?.set({ [StorageKeys.SIDEBAR_WIDTH_ENABLED]: enabled });
    } catch {}
  }, []);

  return {
    sidebarConfig,
    sidebarWidthAdjuster,
    folderSpacingAdjuster,
    folderTreeIndentAdjuster,
    gemsSidebarCountAdjuster,
    sidebarWidthEnabled,
    hydrateFromStorage,
    onSidebarWidthEnabledChange,
  };
}

export type PopupLayoutSettingsController = ReturnType<typeof usePopupLayoutSettings>;
