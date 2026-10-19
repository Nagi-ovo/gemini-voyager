import { vi } from 'vitest';

/** Removes every toolbar and host control a test mounted, and restores mocks. */
export function cleanUpToolbars(): void {
  document.querySelectorAll('.gv-persistent-export-toolbar').forEach((n) => n.remove());
  document.body
    .querySelectorAll(
      '[data-test-id="upgrade-button"], top-bar-actions, #conversation-header-actions, user-query',
    )
    .forEach((n) => n.remove());
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementsFromPoint');
}

export function mockRect(element: Element, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      top: rect.top ?? 0,
      left: rect.left ?? 0,
      right: rect.right ?? 0,
      bottom: rect.bottom ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      toJSON: () => ({}),
    }),
  });
}

export function stubElementsFromPoint(hit: (x: number, y: number) => Element[]): void {
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: hit,
  });
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
