import { useCallback } from 'react';

import { StorageKeys } from '@/core/types/common';
import { useWidthAdjuster } from '@/hooks/useWidthAdjuster';

import { FOLDER_SPACING, FOLDER_TREE_INDENT, clampNumber } from '../utils/layoutSettings';

// The appearance and sidebar width rows live in the Plugins card; this keeps the folder sliders.
export interface PopupLayoutSettingsOptions {
  isAIStudio: boolean;
}

export function usePopupLayoutSettings({ isAIStudio }: PopupLayoutSettingsOptions) {
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

  return {
    folderSpacingAdjuster,
    folderTreeIndentAdjuster,
  };
}

export type PopupLayoutSettingsController = ReturnType<typeof usePopupLayoutSettings>;
