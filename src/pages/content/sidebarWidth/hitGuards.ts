import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

const SEARCH_HIT_DEBUG_THROTTLE_MS = 1200;
const SIDEBAR_TOGGLE_HIT_DEBUG_THROTTLE_MS = 1200;

const SIDEBAR_TOGGLE_BUTTON_SELECTOR = [
  'bard-sidenav .close-sidenav-button',
  'bard-sidenav button[aria-label="Close sidebar"]',
  'bard-sidenav button[aria-label="Open sidebar"]',
].join(', ');

const SIDEBAR_TOGGLE_ICON_NAMES = new Set(['side_nav', 'side_nav_expand']);

function formatElementForDebug(element: Element | null): string {
  if (!element) return '(none)';
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classNames = element.classList.length ? `.${Array.from(element.classList).join('.')}` : '';
  return `${tag}${id}${classNames}`;
}

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

function setupSearchButtonHitTestDebug(scope: PluginScope): void {
  let lastSearchHitDebugAt = 0;

  const onPointerDownCapture = (event: PointerEvent) => {
    if (scope.isDisposed) return;
    const searchButton = document.querySelector<HTMLElement>('search-nav-button button');
    if (!searchButton) return;

    const rect = searchButton.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;
    if (!rectContainsPoint(rect, x, y)) return;

    const target = event.target instanceof Element ? event.target : null;
    if (target && searchButton.contains(target)) return;

    const now = Date.now();
    if (now - lastSearchHitDebugAt < SEARCH_HIT_DEBUG_THROTTLE_MS) return;
    lastSearchHitDebugAt = now;

    const stack = document.elementsFromPoint(x, y).slice(0, 6);
    const top = stack[0] ?? null;
    const topStyle = top ? window.getComputedStyle(top) : null;

    console.warn('[Gemini Voyager][sidebarWidth debug] Search button hit blocked', {
      point: { x, y },
      target: formatElementForDebug(target),
      searchButton: formatElementForDebug(searchButton),
      topElement: formatElementForDebug(top),
      topElementPointerEvents: topStyle?.pointerEvents ?? null,
      topElementZIndex: topStyle?.zIndex ?? null,
      stack: stack.map((element) => formatElementForDebug(element)),
    });
  };

  scope.on(window, 'pointerdown', onPointerDownCapture, { capture: true });
}

function setupSidebarToggleHitGuard(scope: PluginScope): void {
  let lastSidebarToggleHitDebugAt = 0;

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

    const now = Date.now();
    if (now - lastSidebarToggleHitDebugAt >= SIDEBAR_TOGGLE_HIT_DEBUG_THROTTLE_MS) {
      lastSidebarToggleHitDebugAt = now;
      const stack = document.elementsFromPoint(x, y).slice(0, 8);
      const top = stack[0] ?? null;
      const topStyle = top ? window.getComputedStyle(top) : null;

      console.warn('[Gemini Voyager][sidebarWidth debug] Sidebar toggle hit blocked', {
        point: { x, y },
        target: formatElementForDebug(target),
        toggleButton: formatElementForDebug(toggleButton),
        topElement: formatElementForDebug(top),
        topElementPointerEvents: topStyle?.pointerEvents ?? null,
        topElementZIndex: topStyle?.zIndex ?? null,
        stack: stack.map((element) => formatElementForDebug(element)),
      });
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    toggleButton.click();
  };

  scope.on(window, 'pointerdown', onPointerDownCapture, { capture: true });
}

export function installSidebarWidthHitGuards(scope: PluginScope): void {
  setupSearchButtonHitTestDebug(scope);
  setupSidebarToggleHitGuard(scope);
}
