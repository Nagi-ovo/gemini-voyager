import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { FolderManager } from '../manager';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: vi.fn(), set: vi.fn() },
      local: { get: vi.fn(), set: vi.fn() },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { id: 'test-extension-id', lastError: null },
  },
}));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

vi.mock('../floatingPanel', () => ({
  mountFloatingPanel: vi.fn(() => ({ destroy: vi.fn(), update: vi.fn() })),
}));
vi.mock('../floatingModeFab', () => ({ mountFloatingFab: vi.fn(), unmountFloatingFab: vi.fn() }));

function setWidth(el: HTMLElement, width: number): void {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width });
}

describe('FolderManager.isSideNavOpen (lr26 sidebar-open detection)', () => {
  let manager: FolderManager | null = null;
  const detect = () => (manager as unknown as { isSideNavOpen(): boolean }).isSideNavOpen();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(browser.storage.sync.get).mockResolvedValue({});
    vi.mocked(browser.storage.sync.set).mockResolvedValue(undefined);
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);
    manager = new FolderManager();
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('detects open when the lr26 <chat-app> carries side-nav-open (the regression)', () => {
    // lr26: #app-root is a class-less <chat-app-orchestrator>, the class moved to <chat-app>.
    document.body.innerHTML =
      '<chat-app-orchestrator id="app-root"><chat-app class="side-nav-open"></chat-app></chat-app-orchestrator>';
    expect(detect()).toBe(true);
  });

  it('still detects open via the legacy #app-root.side-nav-open', () => {
    document.body.innerHTML = '<div id="app-root" class="side-nav-open"></div>';
    expect(detect()).toBe(true);
  });

  it('falls back to the rendered sidenav width when no open class is present', () => {
    document.body.innerHTML =
      '<chat-app-orchestrator id="app-root"></chat-app-orchestrator><bard-sidenav></bard-sidenav>';
    const sideNav = document.querySelector('bard-sidenav') as HTMLElement;
    setWidth(sideNav, 452);
    expect(detect()).toBe(true);
  });

  it('reports closed when no open marker exists and the sidenav is narrow', () => {
    document.body.innerHTML =
      '<chat-app-orchestrator id="app-root"><chat-app></chat-app></chat-app-orchestrator><bard-sidenav></bard-sidenav>';
    setWidth(document.querySelector('bard-sidenav') as HTMLElement, 0);
    expect(detect()).toBe(false);
  });
});

describe('FolderManager.isSidebarFolderUsable (visibility-aware safety net)', () => {
  let manager: FolderManager | null = null;

  type Layout = { open: boolean; visible: boolean; userCollapsed?: boolean; noContainer?: boolean };

  const setup = (l: Layout): boolean => {
    document.body.innerHTML = l.open
      ? '<chat-app-orchestrator id="app-root"><chat-app class="side-nav-open"></chat-app></chat-app-orchestrator>'
      : '<chat-app-orchestrator id="app-root"><chat-app></chat-app></chat-app-orchestrator>';

    const typed = manager as unknown as {
      containerElement: HTMLElement | null;
      isSidebarFolderUsable(): boolean;
    };

    if (l.noContainer) {
      typed.containerElement = null;
      return typed.isSidebarFolderUsable();
    }

    const c = document.createElement('div');
    c.className = 'gv-folder-container' + (l.userCollapsed ? ' gv-sidebar-section-hidden' : '');
    document.body.appendChild(c);
    // jsdom has no layout engine — simulate visibility explicitly.
    Object.defineProperty(c, 'offsetParent', {
      configurable: true,
      get: () => (l.visible ? document.body : null),
    });
    c.getBoundingClientRect = () =>
      ({ height: l.visible ? 200 : 0, width: l.visible ? 240 : 0 }) as DOMRect;
    typed.containerElement = c;
    return typed.isSidebarFolderUsable();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(browser.storage.sync.get).mockResolvedValue({});
    vi.mocked(browser.storage.sync.set).mockResolvedValue(undefined);
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);
    manager = new FolderManager();
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('flags a fault: sidebar open, not user-collapsed, but container invisible', () => {
    // The exact regression — attached but display:none while the sidebar is open.
    expect(setup({ open: true, visible: false })).toBe(false);
  });

  it('is usable when sidebar open and the container actually renders', () => {
    expect(setup({ open: true, visible: true })).toBe(true);
  });

  it('is fine when the user collapsed the Folders section (peek bar stands in)', () => {
    expect(setup({ open: true, visible: false, userCollapsed: true })).toBe(true);
  });

  it('is fine when the sidebar is closed (folder is meant to be hidden)', () => {
    expect(setup({ open: false, visible: false })).toBe(true);
  });

  it('reports unusable when there is no container at all', () => {
    expect(setup({ open: true, visible: false, noContainer: true })).toBe(false);
  });
});
