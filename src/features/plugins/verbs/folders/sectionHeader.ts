/**
 * The sidebar section's header: the shared folder header as one of the site's
 * own section headings, with Gemini's header buttons in its order. All but
 * "create" and a pressed bell show only while the header is in use.
 */
import { createCircleCheckIcon, createTrashIcon, createXIcon } from '@/core/icons/folderIcons';
import { StorageKeys } from '@/core/types/common';
import type { ConversationSortMode } from '@/features/folder/model/folderData';
import {
  createFolderHeader,
  setFolderHeaderAction,
  setFolderHeaderCollapsed,
  setFolderHeaderDisabled,
} from '@/pages/content/folder/folderHeader/folderHeader';
import {
  type FolderHeaderActionsOptions,
  folderHeaderActions,
} from '@/pages/content/folder/folderHeader/folderHeaderActions';
import { openFolderSettingsPopover } from '@/pages/content/folder/folderSettings/folderSettings';
import type { SelectionToolbarIcon } from '@/pages/content/folder/selectionToolbar';
import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

const SETTINGS_CLASS = 'gv-folder-settings-btn';

/** Header icons, at the size of Gemini's folder header icons. */
export const SECTION_ICON_SIZE = 18;

/**
 * What the settings show for a display setting the user never stored: the
 * section's own 14px rows with no gap. Its sheet keeps those until one is set.
 */
const DISPLAY_DEFAULTS = {
  [StorageKeys.GV_FOLDER_ITEM_FONT_SIZE]: 14,
  [StorageKeys.GV_FOLDER_SPACING]: 0,
};

/** The multi-select toolbar's icons, in the header's line style. */
export const sectionToolbarIcon: SelectionToolbarIcon = (name) => {
  if (name === 'check_circle') return createCircleCheckIcon(SECTION_ICON_SIZE);
  return name === 'delete' ? createTrashIcon(SECTION_ICON_SIZE) : createXIcon(SECTION_ICON_SIZE);
};

/** The view toggle's class, under the section's own class. */
function activityToggleClass(sectionClass: string): string {
  return `${sectionClass}__activity`;
}

export interface SectionHeaderOptions {
  /** The section's host class; the header's own classes derive from it. */
  readonly sectionClass: string;
  /** Offer the Activity view's bell, pressed or not. */
  readonly activity: { readonly pressed: boolean } | null;
  readonly transfer: FolderHeaderActionsOptions['transfer'];
  readonly cloud: FolderHeaderActionsOptions['cloud'];
  sortMode(): ConversationSortMode;
  onToggleCollapsed(): void;
  onToggleActivity(): void;
  onSortModeChange(sortMode: ConversationSortMode): void;
  onCreate(): void;
}

export function createSectionHeader(options: SectionHeaderOptions): HTMLElement {
  const { sectionClass } = options;
  // The site's own sections collapse from their heading; its name stays the button's name.
  return createFolderHeader({
    className: `${sectionClass}__header`,
    title: {
      tag: 'h2',
      labelKey: 'floatingPanelTitle',
      className: `${sectionClass}__title`,
    },
    collapse: {
      byTitle: true,
      onToggle: options.onToggleCollapsed,
    },
    containClicks: true,
    actions: folderHeaderActions({
      activity: options.activity
        ? {
            className: activityToggleClass(sectionClass),
            pressed: options.activity.pressed,
            onClick: options.onToggleActivity,
          }
        : undefined,
      transfer: options.transfer,
      cloud: options.cloud,
      settings: (event) =>
        openFolderSettingsPopover(event.currentTarget as HTMLButtonElement, {
          sortMode: options.sortMode(),
          onSortModeChange: options.onSortModeChange,
          displayDefaults: DISPLAY_DEFAULTS,
        }),
      create: {
        className: `${sectionClass}__create`,
        labelKey: 'floatingPanelCreateFolder',
        onClick: options.onCreate,
      },
      reveal: true,
      iconSize: SECTION_ICON_SIZE,
    }),
  });
}

/** Disables the header's edits while data loads. */
export function setSectionHeaderReady(
  header: HTMLElement,
  sectionClass: string,
  ready: boolean,
): void {
  setFolderHeaderDisabled(header, !ready);
  // The view toggle and the settings only change what is shown, so they work while data loads.
  for (const className of [activityToggleClass(sectionClass), SETTINGS_CLASS]) {
    const button = header.querySelector<HTMLButtonElement>(`.${className}`);
    if (button) button.disabled = false;
  }
}

/** Shows the section's collapsed state and which view is on. */
export function showSectionHeaderPrefs(
  header: HTMLElement,
  sectionClass: string,
  collapsed: boolean,
  activity: boolean,
): void {
  setFolderHeaderCollapsed(header, collapsed);
  setFolderHeaderAction(header, activityToggleClass(sectionClass), {
    pressed: activity,
    label: t(activity ? 'folder_activity_turn_off' : 'folder_activity_turn_on'),
  });
}
