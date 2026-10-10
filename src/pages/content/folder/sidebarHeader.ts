import { createUserRoundIcon } from '@/core/icons/folderIcons';
import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

import type { FolderTransferController } from './FolderTransferController';
import { KEEPS_INLINE_FORM_ATTR } from './floatingTree/shared';
import {
  createFolderHeader,
  ensureFolderHeaderStyle,
  refreshFolderHeaderLanguage,
  setFolderHeaderAction,
  setFolderHeaderCollapsed,
} from './folderHeader/folderHeader';
import { folderHeaderActions } from './folderHeader/folderHeaderActions';
import type { createFolderHeaderMenus } from './headerMenus';

export type SidebarHeaderOptions = {
  headerMenus: ReturnType<typeof createFolderHeaderMenus>;
  transfer: FolderTransferController;
  filterCurrentUserOnly: boolean;
  accountIsolationEnabled: boolean;
  onToggleCollapsed(): void;
  onToggleViewMode(): void;
  onToggleUserFilter(): void;
  onOpenSettings(event: MouseEvent): void;
  onCreateFolder(): void;
};

/**
 * Gemini's folder section title row on the shared folder header: collapse,
 * filter, import/export, cloud, settings, activity, add.
 */
export function createSidebarHeader(options: SidebarHeaderOptions): HTMLElement {
  const { headerMenus, transfer } = options;
  ensureFolderHeaderStyle();
  const header = createFolderHeader({
    // Match the style of Recent section title
    title: { tag: 'h1', labelKey: 'folder_title', className: 'gds-label-l' },
    collapse: { onToggle: options.onToggleCollapsed },
    openMenu: (event, _anchor, items) => headerMenus.openActions(event, items),
    actions: folderHeaderActions({
      // Activity is a read-only projection over the same folder data; the left
      // chevron remains the single collapse control.
      activity: {
        onClick: (event) => {
          event.stopPropagation();
          options.onToggleViewMode();
        },
      },
      extra: [
        {
          className: 'gv-folder-user-filter-toggle',
          icon: () => createUserRoundIcon(18),
          labelKey: 'folder_filter_current_user',
          pressed: options.filterCurrentUserOnly,
          hidden: options.accountIsolationEnabled,
          onClick: () => options.onToggleUserFilter(),
        },
      ],
      transfer: {
        import: () => transfer.showImportDialog(),
        export: () => transfer.exportFolders(),
      },
      cloud: {
        upload: () => void transfer.upload(),
        sync: () => void transfer.sync(),
      },
      // Folder settings (conversation order, font size, spacing, and indentation).
      settings: (event) => options.onOpenSettings(event),
      create: {
        labelKey: 'folder_create',
        // A second press refocuses the open name field, so it must not dismiss it first.
        attributes: { [KEEPS_INLINE_FORM_ATTR]: '' },
        onClick: () => options.onCreateFolder(),
      },
      symbolFont: true,
    }),
  });
  header.querySelector<HTMLElement>('.title')!.style.visibility = 'visible';
  header
    .querySelector('.gv-folder-user-filter-toggle')
    ?.classList.toggle('gv-filter-active', options.filterCurrentUserOnly);
  return header;
}

export function applyCollapsedState(panel: HTMLElement, collapsed: boolean): void {
  panel.classList.toggle('gv-folder-collapsed', collapsed);
  setFolderHeaderCollapsed(panel, collapsed);
}

export function applyViewModeState(panel: HTMLElement, activityMode: boolean): void {
  panel.classList.toggle('gv-folder-activity-mode', activityMode);
  setFolderHeaderAction(panel, 'gv-folder-activity-toggle', {
    pressed: activityMode,
    label: t(activityMode ? 'folder_activity_turn_off' : 'folder_activity_turn_on'),
  })?.classList.toggle('is-active', activityMode);
}

export function applyUserFilterButtonState(
  panel: HTMLElement | null,
  active: boolean,
  accountIsolationEnabled: boolean,
): void {
  if (!panel) return;
  setFolderHeaderAction(panel, 'gv-folder-user-filter-toggle', {
    pressed: active,
    hidden: accountIsolationEnabled,
  })?.classList.toggle('gv-filter-active', active);
}

/** Retranslates the title and button labels; state-dependent labels are the caller's. */
export function refreshHeaderLanguage(panel: HTMLElement): void {
  refreshFolderHeaderLanguage(panel);
}
