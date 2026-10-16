import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

const SIDEBAR_TOGGLE_BUTTON_SELECTOR = [
  'bard-sidenav .close-sidenav-button',
  'bard-sidenav button[aria-label="Close sidebar"]',
  'bard-sidenav button[aria-label="Open sidebar"]',
].join(', ');

const SIDEBAR_TOGGLE_ICON_NAMES = new Set(['side_nav', 'side_nav_expand']);

function rectContainsPoint(rect: DOMRect, x: number, y: number): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom
  );
}

function isVisibleElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function isSidebarToggleButton(button: HTMLElement): boolean {
  if (button.matches(SIDEBAR_TOGGLE_BUTTON_SELECTOR)) return true;

  const icon = button.querySelector('mat-icon[fonticon]');
  const iconName = icon?.getAttribute('fonticon') ?? '';
  return SIDEBAR_TOGGLE_ICON_NAMES.has(iconName);
}

function getVisibleSidebarToggleButtons(): HTMLElement[] {
  const buttons = new Set<HTMLElement>(
    Array.from(document.querySelectorAll<HTMLElement>(SIDEBAR_TOGGLE_BUTTON_SELECTOR)),
  );

  document.querySelectorAll<HTMLElement>('bard-sidenav button').forEach((button) => {
    if (isSidebarToggleButton(button)) buttons.add(button);
  });

  return Array.from(buttons).filter(isVisibleElement);
}

function setupSidebarToggleHitGuard(scope: PluginScope): void {
  const onPointerDownCapture = (event: PointerEvent) => {
    if (scope.isDisposed) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const { clientX: x, clientY: y } = event;
    const toggleButton = getVisibleSidebarToggleButtons().find((button) =>
      rectContainsPoint(button.getBoundingClientRect(), x, y),
    );
    if (!toggleButton) return;

    const target = event.target instanceof Element ? event.target : null;
    if (target && toggleButton.contains(target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    toggleButton.click();
  };

  scope.on(window, 'pointerdown', onPointerDownCapture, { capture: true });
}

export function installSidebarWidthHitGuards(scope: PluginScope): void {
  setupSidebarToggleHitGuard(scope);
}
