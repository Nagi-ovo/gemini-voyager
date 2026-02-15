import { createMenuItemFromNativeTemplate } from '../shared/nativeMenuItemTemplate';

function createMoveToFolderMenuItemFallback(label: string): HTMLButtonElement {
  const menuItem = document.createElement('button');
  menuItem.className = 'mat-mdc-menu-item mat-focus-indicator gv-move-to-folder-btn';
  menuItem.setAttribute('role', 'menuitem');
  menuItem.setAttribute('tabindex', '0');
  menuItem.setAttribute('aria-disabled', 'false');

  const icon = document.createElement('mat-icon');
  icon.className =
    'mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color';
  icon.setAttribute('role', 'img');
  icon.setAttribute('fonticon', 'folder_open');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'folder_open';

  const textSpan = document.createElement('span');
  textSpan.className = 'mat-mdc-menu-item-text';
  const innerSpan = document.createElement('span');
  innerSpan.className = 'gds-body-m';
  innerSpan.textContent = label;
  textSpan.appendChild(innerSpan);

  const ripple = document.createElement('div');
  ripple.className = 'mat-ripple mat-mdc-menu-ripple';
  ripple.setAttribute('matripple', '');

  menuItem.appendChild(icon);
  menuItem.appendChild(textSpan);
  menuItem.appendChild(ripple);
  return menuItem;
}

export function createMoveToFolderMenuItem(
  menuContent: HTMLElement,
  label: string,
  tooltip: string,
): HTMLButtonElement {
  return (
    createMenuItemFromNativeTemplate({
      menuContent,
      injectedClassName: 'gv-move-to-folder-btn',
      iconName: 'folder_open',
      label,
      tooltip,
      excludedClassNames: ['gv-export-conversation-menu-btn'],
    }) ?? createMoveToFolderMenuItemFallback(label)
  );
}
