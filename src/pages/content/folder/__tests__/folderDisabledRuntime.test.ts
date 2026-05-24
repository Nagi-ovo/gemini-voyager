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

type TestableManager = {
  cleanupTasks: Array<() => void>;
  containerElement: HTMLElement | null;
  sidebarContainer: HTMLElement | null;
  recentSection: HTMLElement | null;
  conversationObserver: MutationObserver | null;
  sideNavObserver: MutationObserver | null;
  nativeMenuObserver: MutationObserver | null;
  folderEnabled: boolean;
  floatingModeEnabled: boolean;
  floatingModeActive: boolean;
  applyFolderEnabledSetting: () => void;
  setupMutationObserver: () => void;
  setupSideNavObserver: () => void;
  startFloatingMode: () => Promise<void>;
};

function mountSidebar(): { appRoot: HTMLElement; sidebar: HTMLElement; recents: HTMLElement } {
  const appRoot = document.createElement('div');
  appRoot.id = 'app-root';
  appRoot.className = 'side-nav-open';

  const sidebar = document.createElement('div');
  sidebar.setAttribute('data-test-id', 'overflow-container');

  const recents = document.createElement('expandable-section');
  recents.setAttribute('data-test-id', 'chats-expandable-section');
  sidebar.appendChild(recents);
  appRoot.appendChild(sidebar);
  document.body.appendChild(appRoot);

  return { appRoot, sidebar, recents };
}

describe('FolderManager disabled runtime teardown', () => {
  let manager: FolderManager | null = null;

  beforeEach(() => {
    vi.mocked(browser.storage.sync.get).mockResolvedValue({});
    vi.mocked(browser.storage.sync.set).mockResolvedValue(undefined);
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('removes mounted folder UI and disconnects sidebar observers when disabled', () => {
    manager = new FolderManager();
    const typed = manager as unknown as TestableManager;
    const { sidebar, recents } = mountSidebar();

    const container = document.createElement('div');
    container.className = 'gv-folder-container';
    sidebar.insertBefore(container, recents);

    typed.sidebarContainer = sidebar;
    typed.recentSection = recents;
    typed.containerElement = container;
    typed.folderEnabled = true;
    typed.setupMutationObserver();
    typed.setupSideNavObserver();

    const nativeMenuObserver = new MutationObserver(() => {});
    nativeMenuObserver.observe(document.body, { childList: true });
    typed.nativeMenuObserver = nativeMenuObserver;

    let cleanupRan = false;
    typed.cleanupTasks = [
      () => {
        cleanupRan = true;
      },
    ];

    typed.folderEnabled = false;
    typed.applyFolderEnabledSetting();

    expect(cleanupRan).toBe(true);
    expect(container.isConnected).toBe(false);
    expect(typed.containerElement).toBeNull();
    expect(typed.sidebarContainer).toBeNull();
    expect(typed.recentSection).toBeNull();
    expect(typed.conversationObserver).toBeNull();
    expect(typed.sideNavObserver).toBeNull();
    expect(typed.nativeMenuObserver).toBeNull();
  });

  it('uses floating mode when folders are re-enabled with the floating toggle on', () => {
    manager = new FolderManager();
    const typed = manager as unknown as TestableManager;
    const startFloatingSpy = vi.spyOn(typed, 'startFloatingMode').mockResolvedValue(undefined);

    typed.folderEnabled = true;
    typed.floatingModeEnabled = true;
    typed.floatingModeActive = false;

    typed.applyFolderEnabledSetting();

    expect(startFloatingSpy).toHaveBeenCalledTimes(1);
  });
});
