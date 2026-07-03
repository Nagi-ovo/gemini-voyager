import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startSidebarWidthAdjuster } from '../index';

const hadOwnElementsFromPoint = Object.prototype.hasOwnProperty.call(document, 'elementsFromPoint');
const originalElementsFromPoint = document.elementsFromPoint;

afterEach(() => {
  window.dispatchEvent(new Event('beforeunload'));
  document.body.innerHTML = '';
  if (hadOwnElementsFromPoint) {
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: originalElementsFromPoint,
    });
  } else {
    Reflect.deleteProperty(document, 'elementsFromPoint');
  }
  vi.restoreAllMocks();
});

describe('sidebar width title centering', () => {
  it('does not override native center-section positioning', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).not.toContain('.center-section');
    expect(code).not.toContain('translate(-50%, -50%)');
    expect(code).not.toContain('left: 50% !important;');
    expect(code).not.toContain('left: clamp(');
  });

  it('does not force top bar host transform/width overrides', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).not.toContain('#app-root > main > top-bar-actions {');
    expect(code).not.toContain('#app-root > main > .top-bar-actions {');
    expect(code).not.toContain('width: calc(100% - var(--gv-sidenav-shift)) !important;');
  });

  it('does not override top-bar actions right-section to fixed', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).not.toContain('div.right-section > div:nth-child(2)');
    expect(code).not.toContain('position: fixed !important;');
  });

  it('does not enable pointer events on all mode-switcher descendants', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).not.toContain('#app-root > main > div > bard-mode-switcher * {');
    expect(code).toContain('#app-root > main > div > bard-mode-switcher :is(');
    expect(code).toContain("[role='button']");
  });

  it('adds search-button hit-test diagnostics for blocked clicks', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).toContain("window.addEventListener('pointerdown'");
    expect(code).toContain('document.elementsFromPoint');
    expect(code).toContain('[Gemini Voyager][sidebarWidth debug] Search button hit blocked');
    expect(code).toContain("document.querySelector<HTMLElement>('search-nav-button button')");
  });

  it('keeps top-bar-actions container transparent while preserving search button clicks', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).toContain('.top-bar-actions {');
    expect(code).toContain('top-bar-actions .top-bar-actions');
    expect(code).toContain('top-bar-actions {');
    expect(code).toContain('pointer-events: none !important;');
    expect(code).toContain('search-nav-button');
    expect(code).toContain('side-nav-sparkle-button');
    expect(code).toContain('side-nav-menu-button');
    expect(code).toContain('top-bar-actions :is(');
    expect(code).toContain('top-bar-actions search-nav-button button');
    expect(code).toContain('search-nav-button button');
    expect(code).toContain('pointer-events: auto !important;');
  });

  it('keeps custom sidebar toggle hosts clickable inside transparent top-bar actions', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).toContain('top-bar-actions side-nav-sparkle-button');
    expect(code).toContain('top-bar-actions side-nav-sparkle-button button');
    expect(code).toContain('top-bar-actions side-nav-menu-button');
    expect(code).toContain('top-bar-actions side-nav-menu-button button');
    expect(code).toContain('#app-root > main > div > bard-mode-switcher side-nav-sparkle-button');
    expect(code).toContain('#app-root > main > div > bard-mode-switcher side-nav-menu-button');
  });

  it('does not visually lift the in-sidenav toggle above the fixed top-bar-actions overlay', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).not.toContain('bard-sidenav side-navigation-content > div > button');
    expect(code).toContain('bard-sidenav .close-sidenav-button');
    expect(code).toContain('bard-sidenav button[aria-label="Close sidebar"]');
    expect(code).toContain('bard-sidenav button[aria-label="Open sidebar"]');
    expect(code).toContain("new Set(['side_nav', 'side_nav_expand'])");
    expect(code).not.toContain('bard-sidenav button:has(mat-icon[fonticon="side_nav"])');
    expect(code).not.toContain('bard-sidenav button:has(mat-icon[fonticon="side_nav_expand"])');
    expect(code).not.toContain('z-index: 20 !important;');

    const injectedStyle = code.match(/return `([\s\S]*?)`;/)?.[1] ?? '';
    expect(injectedStyle).not.toContain('close-sidenav-button');
    expect(injectedStyle).not.toContain('position: relative !important;');
  });

  it("lets Gemini's default-offset side-nav menu button pass through to the real close button", () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).toContain('chat-app-side-nav-menu-button {');
    expect(code).toContain('chat-app-side-nav-menu-button side-nav-sparkle-button');
    expect(code).toContain('chat-app-side-nav-menu-button side-nav-sparkle-button :is(');
    expect(code).toContain(
      '#app-root > main > div > bard-mode-switcher .top-bar-actions chat-app-side-nav-menu-button',
    );
    expect(code).toContain('top-bar-actions chat-app-side-nav-menu-button *');
    expect(code).toContain('top-bar-actions chat-app-side-nav-menu-button :is(');
    expect(code.indexOf('top-bar-actions chat-app-side-nav-menu-button :is(')).toBeGreaterThan(
      code.indexOf('chat-app-side-nav-menu-button side-nav-sparkle-button :is('),
    );
    expect(code.indexOf('top-bar-actions chat-app-side-nav-menu-button :is(')).toBeGreaterThan(
      code.indexOf('top-bar-actions :is('),
    );
    expect(code).toContain('pointer-events: none !important;');
    expect(code).not.toContain("window.addEventListener('click'");
  });

  it('forwards blocked sidebar toggle hits to the real in-sidenav button', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/sidebarWidth/index.ts'),
      'utf8',
    );

    expect(code).toContain('function setupSidebarToggleHitGuard()');
    expect(code).toContain('SIDEBAR_TOGGLE_BUTTON_SELECTOR');
    expect(code).toContain('getVisibleSidebarToggleButtons()');
    expect(code).toContain("window.addEventListener('pointerdown', onPointerDownCapture, true)");
    expect(code).toContain('document.elementsFromPoint');
    expect(code).toContain('[Gemini Voyager][sidebarWidth debug] Sidebar toggle hit blocked');
    expect(code).toContain('event.preventDefault()');
    expect(code).toContain('event.stopImmediatePropagation()');
    expect(code).toContain('toggleButton.click()');
    expect(code).toContain('setupSidebarToggleHitGuard();');
  });

  it('clicks the real sidebar toggle when an overlay receives the center hit', () => {
    document.body.innerHTML = `
      <bard-sidenav>
        <side-navigation-content>
          <div>
            <button aria-label="Close sidebar">
              <mat-icon fonticon="side_nav"></mat-icon>
            </button>
          </div>
        </side-navigation-content>
      </bard-sidenav>
      <div id="blocker"></div>
    `;

    const button = document.querySelector<HTMLElement>('bard-sidenav button');
    const blocker = document.getElementById('blocker');
    expect(button).not.toBeNull();
    expect(blocker).not.toBeNull();
    if (!button || !blocker) return;

    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      right: 132,
      bottom: 132,
      width: 32,
      height: 32,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [blocker, button]),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const clickSpy = vi.spyOn(button, 'click').mockImplementation(() => {});

    startSidebarWidthAdjuster();

    const event = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 116,
      clientY: 116,
      button: 0,
    });
    blocker.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Gemini Voyager][sidebarWidth debug] Sidebar toggle hit blocked',
      expect.objectContaining({
        topElement: 'div#blocker',
        toggleButton: expect.stringContaining('button'),
      }),
    );
  });

  it('does not treat regular side-nav buttons as sidebar toggles', () => {
    document.body.innerHTML = `
      <bard-sidenav>
        <side-navigation-content>
          <div>
            <button aria-label="New chat">
              <mat-icon fonticon="edit"></mat-icon>
              <span>New chat</span>
            </button>
          </div>
        </side-navigation-content>
      </bard-sidenav>
      <div id="blocker"></div>
    `;

    const newChatButton = document.querySelector<HTMLElement>('bard-sidenav button');
    const blocker = document.getElementById('blocker');
    expect(newChatButton).not.toBeNull();
    expect(blocker).not.toBeNull();
    if (!newChatButton || !blocker) return;

    vi.spyOn(newChatButton, 'getBoundingClientRect').mockReturnValue({
      x: 32,
      y: 200,
      left: 32,
      top: 200,
      right: 580,
      bottom: 262,
      width: 548,
      height: 62,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [blocker, newChatButton]),
    });
    const clickSpy = vi.spyOn(newChatButton, 'click').mockImplementation(() => {});

    startSidebarWidthAdjuster();

    const event = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 306,
      clientY: 231,
      button: 0,
    });
    blocker.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
