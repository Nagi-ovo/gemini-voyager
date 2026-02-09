import {
  createMenuItemFromNativeTemplate,
  updateMenuItemTemplateLabel,
} from '../shared/nativeMenuItemTemplate';

export type ConversationMenuExportOptions = {
  label: string;
  tooltip: string;
  onClick: () => void;
};

const MENU_BUTTON_CLASS = 'gv-export-conversation-menu-btn';
const MENU_PANEL_SELECTOR = '.mat-mdc-menu-panel[role="menu"]';

function findMenuContent(menuPanel: HTMLElement): HTMLElement | null {
  return menuPanel.querySelector('.mat-mdc-menu-content') as HTMLElement | null;
}

function updateButtonLabelAndTooltip(
  button: HTMLButtonElement,
  label: string,
  tooltip: string,
): void {
  updateMenuItemTemplateLabel(button, label, tooltip);
}

function closeMenuOverlay(menuPanel: HTMLElement): void {
  const backdrops = document.querySelectorAll<HTMLElement>('.cdk-overlay-backdrop');
  const backdrop = backdrops.length > 0 ? backdrops[backdrops.length - 1] : null;
  if (backdrop) {
    backdrop.click();
    return;
  }

  try {
    menuPanel.remove();
  } catch {}
}

function createMenuItemButton({
  label,
  tooltip,
  onClick,
  menuContent,
  menuPanel,
}: ConversationMenuExportOptions & {
  menuContent: HTMLElement;
  menuPanel: HTMLElement;
}): HTMLButtonElement | null {
  const button = createMenuItemFromNativeTemplate({
    menuContent,
    injectedClassName: MENU_BUTTON_CLASS,
    iconName: 'download',
    label,
    tooltip,
    excludedClassNames: ['gv-move-to-folder-btn'],
  });
  if (!button) return null;

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
    closeMenuOverlay(menuPanel);
  });

  return button;
}

export function isConversationMenuPanel(menuPanel: HTMLElement): boolean {
  if (!menuPanel.matches(MENU_PANEL_SELECTOR)) return false;
  if (menuPanel.classList.contains('gds-mode-switch-menu')) return false;
  if (menuPanel.querySelector('.bard-mode-list-button')) return false;

  const menuContent = findMenuContent(menuPanel);
  if (!menuContent) return false;

  return Boolean(
    menuContent.querySelector('[data-test-id="share-button"]') ||
      menuContent.querySelector('[data-test-id="pin-button"]') ||
      menuContent.querySelector('[data-test-id="rename-button"]') ||
      menuContent.querySelector('[data-test-id="delete-button"]'),
  );
}

export function injectConversationMenuExportButton(
  menuPanel: HTMLElement,
  options: ConversationMenuExportOptions,
): HTMLButtonElement | null {
  if (!isConversationMenuPanel(menuPanel)) return null;
  const menuContent = findMenuContent(menuPanel);
  if (!menuContent) return null;

  const existing = menuContent.querySelector(`.${MENU_BUTTON_CLASS}`) as HTMLButtonElement | null;
  if (existing) {
    updateButtonLabelAndTooltip(existing, options.label, options.tooltip);
    return existing;
  }

  const button = createMenuItemButton({ ...options, menuContent, menuPanel });
  if (!button) return null;
  const pinButton = menuContent.querySelector('[data-test-id="pin-button"]');
  if (pinButton && pinButton.parentElement === menuContent) {
    if (pinButton.nextSibling) {
      menuContent.insertBefore(button, pinButton.nextSibling);
    } else {
      menuContent.appendChild(button);
    }
  } else if (menuContent.firstChild) {
    menuContent.insertBefore(button, menuContent.firstChild);
  } else {
    menuContent.appendChild(button);
  }

  return button;
}
