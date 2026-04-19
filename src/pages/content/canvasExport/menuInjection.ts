import { createMenuItemFromNativeTemplate } from '../shared/nativeMenuItemTemplate';

const MENU_PANEL_SELECTOR = '.mat-mdc-menu-panel[role="menu"]';
const EXPANDED_MENU_TRIGGER_SELECTOR = '[aria-haspopup="menu"][aria-expanded="true"]';
const CANVAS_SHARE_WRAPPER_SELECTOR = 'share-button[data-test-id="consolidated-share-button"]';
export const CANVAS_MARKDOWN_BUTTON_CLASS = 'gv-canvas-copy-markdown-btn';

export type CanvasMenuInjectionOptions = {
  label: string;
  tooltip: string;
  onClick: () => void;
};

function parseControlledIds(trigger: HTMLElement): string[] {
  const raw = `${trigger.getAttribute('aria-controls') || ''} ${
    trigger.getAttribute('aria-owns') || ''
  }`;
  return raw
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveExpandedMenuTrigger(menuPanel: HTMLElement): HTMLElement | null {
  const triggers = Array.from(
    document.querySelectorAll<HTMLElement>(EXPANDED_MENU_TRIGGER_SELECTOR),
  );
  if (triggers.length === 0) return null;
  const panelId = menuPanel.id;
  if (panelId) {
    const matched = triggers.find((trigger) => parseControlledIds(trigger).includes(panelId));
    if (matched) return matched;
  }
  return triggers[triggers.length - 1] || null;
}

function findMenuContent(menuPanel: HTMLElement): HTMLElement | null {
  return menuPanel.querySelector('.mat-mdc-menu-content') as HTMLElement | null;
}

export function isCanvasContext(): boolean {
  if (document.querySelector('deep-research-immersive-panel')) return false;
  return !!document.querySelector('immersive-editor');
}

export function isCanvasShareMenuPanel(menuPanel: HTMLElement): boolean {
  if (!menuPanel.matches(MENU_PANEL_SELECTOR)) return false;
  if (menuPanel.classList.contains('gds-mode-switch-menu')) return false;
  if (!findMenuContent(menuPanel)) return false;
  if (!isCanvasContext()) return false;

  const trigger = resolveExpandedMenuTrigger(menuPanel);
  if (!trigger) return false;
  return !!trigger.closest(CANVAS_SHARE_WRAPPER_SELECTOR);
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

export function findCanvasProseMirrorRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('immersive-editor .ProseMirror');
}

export function injectCanvasCopyMarkdownButton(
  menuPanel: HTMLElement,
  options: CanvasMenuInjectionOptions,
): HTMLButtonElement | null {
  if (!isCanvasShareMenuPanel(menuPanel)) return null;
  const menuContent = findMenuContent(menuPanel);
  if (!menuContent) return null;

  const existing = menuContent.querySelector(
    `.${CANVAS_MARKDOWN_BUTTON_CLASS}`,
  ) as HTMLButtonElement | null;
  if (existing) {
    existing.title = options.tooltip || options.label;
    existing.setAttribute('aria-label', options.tooltip || options.label);
    const text = existing.querySelector('.mat-mdc-menu-item-text') as HTMLElement | null;
    if (text) text.textContent = options.label;
    return existing;
  }

  const button = createMenuItemFromNativeTemplate({
    menuContent,
    injectedClassName: CANVAS_MARKDOWN_BUTTON_CLASS,
    iconName: 'content_copy',
    label: options.label,
    tooltip: options.tooltip,
    excludedClassNames: [CANVAS_MARKDOWN_BUTTON_CLASS, 'share-button'],
  });
  if (!button) return null;

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onClick();
    closeMenuOverlay(menuPanel);
  });

  menuContent.appendChild(button);
  return button;
}
