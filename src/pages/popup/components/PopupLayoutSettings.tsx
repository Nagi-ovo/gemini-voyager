import React from 'react';

import type { TranslationKey } from '@/utils/translations';

import type { PopupLayoutSettingsController } from '../hooks/usePopupLayoutSettings';
import { FOLDER_SPACING, FOLDER_TREE_INDENT, GEMS_SIDEBAR_COUNT } from '../utils/layoutSettings';
import type { NativePopupSectionId } from '../utils/nativeSiteCapabilities';
import WidthSlider from './WidthSlider';

export interface PopupLayoutSettingsProps {
  settings: PopupLayoutSettingsController;
  t: (key: TranslationKey) => string;
  wrapSection: (id: NativePopupSectionId, content: React.ReactNode) => React.ReactNode;
}

export function PopupLayoutSettings({ settings, t, wrapSection }: PopupLayoutSettingsProps) {
  const {
    sidebarConfig,
    sidebarWidthAdjuster,
    folderSpacingAdjuster,
    folderTreeIndentAdjuster,
    gemsSidebarCountAdjuster,
    sidebarWidthEnabled,
    onSidebarWidthEnabledChange,
  } = settings;

  return (
    <>
      {/* Folder Spacing */}
      {wrapSection(
        'folderSpacing',
        <WidthSlider
          label={t('folderSpacing')}
          value={folderSpacingAdjuster.width}
          min={FOLDER_SPACING.min}
          max={FOLDER_SPACING.max}
          step={1}
          narrowLabel={t('folderSpacingCompact')}
          wideLabel={t('folderSpacingSpacious')}
          valueFormatter={(v) => `${v}px`}
          onChange={folderSpacingAdjuster.handleChange}
          onChangeComplete={folderSpacingAdjuster.handleChangeComplete}
        />,
      )}
      {wrapSection(
        'folderTreeIndent',
        <WidthSlider
          label={t('folderTreeIndent')}
          value={folderTreeIndentAdjuster.width}
          min={FOLDER_TREE_INDENT.min}
          max={FOLDER_TREE_INDENT.max}
          step={1}
          narrowLabel={t('folderTreeIndentCompact')}
          wideLabel={t('folderTreeIndentSpacious')}
          valueFormatter={(v) => `${v}px`}
          onChange={folderTreeIndentAdjuster.handleChange}
          onChangeComplete={folderTreeIndentAdjuster.handleChangeComplete}
        />,
      )}
      {wrapSection(
        'gemsSidebar',
        <WidthSlider
          label={t('gemsSidebarCount')}
          value={gemsSidebarCountAdjuster.width}
          min={GEMS_SIDEBAR_COUNT.min}
          max={GEMS_SIDEBAR_COUNT.max}
          step={1}
          narrowLabel={t('gemsSidebarCountOff')}
          wideLabel={t('gemsSidebarCountMany')}
          valueFormatter={(v) => (v === 0 ? t('gemsSidebarCountOff') : String(v))}
          onChange={gemsSidebarCountAdjuster.handleChange}
          onChangeComplete={gemsSidebarCountAdjuster.handleChangeComplete}
        />,
      )}
      {/* AI Studio's sidebar width; Gemini's is a row in the Plugins card. */}
      {wrapSection(
        'sidebarWidth',
        <WidthSlider
          label="AI Studio Sidebar"
          value={sidebarWidthAdjuster.width}
          min={sidebarConfig.min}
          max={sidebarConfig.max}
          step={8}
          narrowLabel={t('sidebarWidthNarrow')}
          wideLabel={t('sidebarWidthWide')}
          valueFormatter={(v) => `${v}px`}
          onChange={sidebarWidthAdjuster.handleChange}
          onChangeComplete={sidebarWidthAdjuster.handleChangeComplete}
          enabled={sidebarWidthEnabled}
          onToggle={onSidebarWidthEnabledChange}
        />,
      )}
    </>
  );
}
