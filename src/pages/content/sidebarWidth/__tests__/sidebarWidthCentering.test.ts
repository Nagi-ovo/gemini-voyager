import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { activateGeminiSidebarWidth, SIDEBAR_WIDTH_STYLE_ID } from '../pluginHandler';

let scope: PluginScope;
beforeEach(() => {
  scope = new PluginScope();
});
function activate(): string {
  activateGeminiSidebarWidth(scope, { widthPx: 400 });
  return document.getElementById(SIDEBAR_WIDTH_STYLE_ID)?.textContent ?? '';
}

const hadOwnElementsFromPoint = Object.prototype.hasOwnProperty.call(document, 'elementsFromPoint');
const originalElementsFromPoint = document.elementsFromPoint;

afterEach(async () => {
  await scope.dispose();
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
  it('reports a search-button hit blocked by an overlapping header', () => {
    document.body.innerHTML =
      '<search-nav-button><button>Search</button></search-nav-button><div id="blocker"></div>';
    const button = document.querySelector('button')!;
    const blocker = document.getElementById('blocker')!;
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 132,
      top: 100,
      bottom: 132,
      width: 32,
      height: 32,
    } as DOMRect);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [blocker, button]),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    activate();
    blocker.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 116,
        clientY: 116,
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      '[Gemini Voyager][sidebarWidth debug] Search button hit blocked',
      expect.objectContaining({
        target: 'div#blocker',
        searchButton: 'button',
        topElement: 'div#blocker',
      }),
    );
  });

  it('does not enable pointer events on all mode-switcher descendants', () => {
    const code = activate();

    expect(code).not.toContain('#app-root > main > div > bard-mode-switcher * {');
    expect(code).toContain('#app-root > main > div > bard-mode-switcher :is(');
    expect(code).toContain("[role='button']");
  });

  it('keeps top-bar-actions container transparent while preserving search button clicks', () => {
    const code = activate();

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
    const code = activate();

    expect(code).toContain('top-bar-actions side-nav-sparkle-button');
    expect(code).toContain('top-bar-actions side-nav-sparkle-button button');
    expect(code).toContain('top-bar-actions side-nav-menu-button');
    expect(code).toContain('top-bar-actions side-nav-menu-button button');
    expect(code).toContain('#app-root > main > div > bard-mode-switcher side-nav-sparkle-button');
    expect(code).toContain('#app-root > main > div > bard-mode-switcher side-nav-menu-button');
  });

  it('does not visually lift the in-sidenav toggle above the fixed top-bar-actions overlay', () => {
    const code = activate();

    expect(code).not.toContain('bard-sidenav side-navigation-content > div > button');
    expect(code).not.toContain('bard-sidenav button:has(mat-icon[fonticon="side_nav"])');
    expect(code).not.toContain('bard-sidenav button:has(mat-icon[fonticon="side_nav_expand"])');
    expect(code).not.toContain('z-index: 20 !important;');

    const injectedStyle = code;
    expect(injectedStyle).not.toContain('close-sidenav-button');
    expect(injectedStyle).not.toContain('position: relative !important;');
  });

  it("lets Gemini's default-offset side-nav menu button pass through to the real close button", () => {
    const code = activate();

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
  });

  it('clicks the real sidebar toggle when an overlay receives the center hit and stops on disposal', async () => {
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

    activate();

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
    await scope.dispose();
    const afterStop = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 116,
      clientY: 116,
      button: 0,
    });
    blocker.dispatchEvent(afterStop);
    expect(afterStop.defaultPrevented).toBe(false);
    expect(clickSpy).toHaveBeenCalledTimes(1);
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

    activate();

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
