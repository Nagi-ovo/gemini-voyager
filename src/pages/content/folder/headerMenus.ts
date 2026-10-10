import type { ConversationSortMode } from '@/features/folder/model/folderData';

import {
  FOLDER_SETTINGS_CLASS,
  ensureFolderSettingsStyle,
  renderFolderSettings,
} from './folderSettings/folderSettings';

type HeaderMenuAction = {
  label: string;
  icon?: string;
  iconHtml?: string;
  action: () => void;
};

export type FolderHeaderMenus = {
  openActions: (event: MouseEvent, items: readonly HeaderMenuAction[]) => void;
  openSettings: (
    event: MouseEvent,
    sortMode: ConversationSortMode,
    onSortModeChange: (mode: ConversationSortMode) => void,
  ) => void;
  close: () => void;
};

/** Owns the single header popover and its document listener across all header actions. */
export function createFolderHeaderMenus(): FolderHeaderMenus {
  let activeMenu: HTMLElement | null = null;
  let closeHandler: ((event: MouseEvent) => void) | null = null;
  let listenerTimeout: number | null = null;

  const close = () => {
    activeMenu?.remove();
    activeMenu = null;
    if (listenerTimeout !== null) {
      window.clearTimeout(listenerTimeout);
      listenerTimeout = null;
    }
    if (closeHandler) {
      document.removeEventListener('click', closeHandler);
      closeHandler = null;
    }
  };

  const open = (event: MouseEvent, className: string): HTMLElement | null => {
    event.stopPropagation();
    if (activeMenu && !activeMenu.isConnected) close();
    if (activeMenu) {
      close();
      return null;
    }

    const menu = document.createElement('div');
    menu.className = className;
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    document.body.appendChild(menu);
    activeMenu = menu;

    const onDocumentClick = (click: MouseEvent) => {
      if (!menu.contains(click.target as Node)) close();
    };
    closeHandler = onDocumentClick;
    listenerTimeout = window.setTimeout(() => {
      document.addEventListener('click', onDocumentClick);
      listenerTimeout = null;
    }, 0);
    return menu;
  };

  return {
    openActions: (event, items) => {
      const menu = open(event, 'gv-folder-menu');
      if (!menu) return;
      for (const item of items) {
        const menuItem = document.createElement('button');
        menuItem.className = 'gv-folder-menu-item';
        const iconMarkup = item.iconHtml
          ? `<span class="gv-folder-menu-icon" aria-hidden="true">${item.iconHtml}</span>`
          : `<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true" style="font-size: 18px; line-height: 1; margin-right: 8px;">${item.icon ?? ''}</mat-icon>`;
        // `iconHtml` is the one trusted markup slot in this contract; a label
        // is text and is appended as text, so the menu can never become a DOM
        // XSS sink for a caller that passes something user-authored.
        menuItem.innerHTML = iconMarkup;
        menuItem.appendChild(document.createTextNode(item.label));
        menuItem.addEventListener('click', () => {
          close();
          item.action();
        });
        menu.appendChild(menuItem);
      }
    },
    openSettings: (event, sortMode, onSortModeChange) => {
      const menu = open(event, `gv-folder-menu ${FOLDER_SETTINGS_CLASS}`);
      if (!menu) return;
      ensureFolderSettingsStyle();
      renderFolderSettings(menu, {
        sortMode,
        onSortModeChange,
        sidebarWidth: true,
        symbolFont: true,
      });
    },
    close,
  };
}
