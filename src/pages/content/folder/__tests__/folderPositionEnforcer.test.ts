import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { FolderManager } from '../manager';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: {
        get: vi.fn(),
        set: vi.fn(),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    runtime: {
      id: 'test-extension-id',
      lastError: null,
    },
  },
}));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

vi.mock('../floatingPanel', () => ({
  mountFloatingPanel: vi.fn(() => ({
    destroy: vi.fn(),
    update: vi.fn(),
  })),
}));

type TestableManager = {
  containerElement: HTMLElement | null;
  sidebarContainer: HTMLElement | null;
  recentSection: HTMLElement | null;
  folderEnabled: boolean;
  floatingModeActive: boolean;
  enforceFolderAboveRecents: () => boolean;
  setupPositionEnforcer: () => void;
  findRecentSectionCandidate: () => HTMLElement | null;
};

/**
 * Build Gemini's 2026 sidebar layout: an overflow-container holding the
 * Notebooks expandable-section followed by the Recents expandable-section.
 * Returns both sections so tests can simulate re-renders.
 */
function mountSidebar(): {
  sidebar: HTMLElement;
  sectionParent: HTMLElement;
  notebooksSection: HTMLElement;
  recentsSection: HTMLElement;
} {
  const sidebar = document.createElement('div');
  sidebar.setAttribute('data-test-id', 'overflow-container');

  const sectionParent = document.createElement('div');
  sectionParent.className = 'sections';
  sidebar.appendChild(sectionParent);

  const notebooksSection = document.createElement('expandable-section');
  notebooksSection.setAttribute('data-test-id', 'notebooks-expandable-section');
  sectionParent.appendChild(notebooksSection);

  const recentsSection = document.createElement('expandable-section');
  recentsSection.setAttribute('data-test-id', 'chats-expandable-section');
  sectionParent.appendChild(recentsSection);

  document.body.appendChild(sidebar);
  return { sidebar, sectionParent, notebooksSection, recentsSection };
}

function mountFolderContainer(parent: HTMLElement, beforeRecents: HTMLElement): HTMLElement {
  const container = document.createElement('div');
  container.className = 'gv-folder-container';
  parent.insertBefore(container, beforeRecents);
  return container;
}

describe('folder position enforcer (above Recents)', () => {
  let manager: FolderManager | null = null;

  beforeEach(() => {
    vi.mocked(browser.storage.sync.get).mockResolvedValue({});
    vi.mocked(browser.storage.sync.set).mockResolvedValue(undefined);
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('no-ops when the folder container is already directly before Recents', () => {
    manager = new FolderManager();
    const typed = manager as unknown as TestableManager;

    const { sidebar, sectionParent, recentsSection } = mountSidebar();
    const container = mountFolderContainer(sectionParent, recentsSection);

    typed.sidebarContainer = sidebar;
    typed.recentSection = recentsSection;
    typed.containerElement = container;
    typed.folderEnabled = true;
    typed.floatingModeActive = false;

    const moved = typed.enforceFolderAboveRecents();

    expect(moved).toBe(false);
    expect(container.nextElementSibling).toBe(recentsSection);
  });

  it('re-anchors the folder container above Recents when Gemini swaps the section element', () => {
    manager = new FolderManager();
    const typed = manager as unknown as TestableManager;

    const { sidebar, sectionParent, recentsSection } = mountSidebar();
    const container = mountFolderContainer(sectionParent, recentsSection);

    typed.sidebarContainer = sidebar;
    typed.recentSection = recentsSection;
    typed.containerElement = container;
    typed.folderEnabled = true;
    typed.floatingModeActive = false;

    // Simulate Gemini re-rendering Recents: remove the old section and insert
    // a brand-new one BEFORE the folder container (where Gemini's render
    // pipeline tends to drop the freshly-built section), stranding the folder
    // container below.
    recentsSection.remove();
    const newRecents = document.createElement('expandable-section');
    newRecents.setAttribute('data-test-id', 'chats-expandable-section');
    sectionParent.insertBefore(newRecents, container);

    // Sanity: container is now below the new Recents (matches the bug
    // screenshot).
    expect(newRecents.nextElementSibling).toBe(container);

    const moved = typed.enforceFolderAboveRecents();

    expect(moved).toBe(true);
    expect(container.nextElementSibling).toBe(newRecents);
    expect(typed.recentSection).toBe(newRecents);
  });

  it('moves the folder container when it was stranded below Recents', () => {
    manager = new FolderManager();
    const typed = manager as unknown as TestableManager;

    const { sidebar, sectionParent, recentsSection } = mountSidebar();
    // Insert the container AFTER Recents to simulate the bug screenshot
    // (Folders rendered below Recents).
    const container = document.createElement('div');
    container.className = 'gv-folder-container';
    sectionParent.appendChild(container);

    typed.sidebarContainer = sidebar;
    typed.recentSection = recentsSection;
    typed.containerElement = container;
    typed.folderEnabled = true;
    typed.floatingModeActive = false;

    const moved = typed.enforceFolderAboveRecents();

    expect(moved).toBe(true);
    expect(container.nextElementSibling).toBe(recentsSection);
  });

  it('skips enforcement when folder feature is disabled', () => {
    manager = new FolderManager();
    const typed = manager as unknown as TestableManager;

    const { sidebar, sectionParent, recentsSection } = mountSidebar();
    const container = document.createElement('div');
    container.className = 'gv-folder-container';
    sectionParent.appendChild(container);

    typed.sidebarContainer = sidebar;
    typed.recentSection = recentsSection;
    typed.containerElement = container;
    typed.folderEnabled = false;
    typed.floatingModeActive = false;

    const moved = typed.enforceFolderAboveRecents();

    expect(moved).toBe(false);
    // Untouched
    expect(container.nextElementSibling).toBeNull();
  });

  it('skips enforcement in floating mode', () => {
    manager = new FolderManager();
    const typed = manager as unknown as TestableManager;

    const { sidebar, sectionParent, recentsSection } = mountSidebar();
    const container = document.createElement('div');
    container.className = 'gv-folder-container';
    sectionParent.appendChild(container);

    typed.sidebarContainer = sidebar;
    typed.recentSection = recentsSection;
    typed.containerElement = container;
    typed.folderEnabled = true;
    typed.floatingModeActive = true;

    const moved = typed.enforceFolderAboveRecents();

    expect(moved).toBe(false);
    expect(container.nextElementSibling).toBeNull();
  });

  it('observer reacts to childList mutations and re-anchors within an animation frame', async () => {
    manager = new FolderManager();
    const typed = manager as unknown as TestableManager;

    const { sidebar, sectionParent, recentsSection } = mountSidebar();
    const container = mountFolderContainer(sectionParent, recentsSection);

    typed.sidebarContainer = sidebar;
    typed.recentSection = recentsSection;
    typed.containerElement = container;
    typed.folderEnabled = true;
    typed.floatingModeActive = false;

    typed.setupPositionEnforcer();

    // Simulate Gemini swapping the Recents section so the container ends up
    // below it.
    recentsSection.remove();
    const newRecents = document.createElement('expandable-section');
    newRecents.setAttribute('data-test-id', 'chats-expandable-section');
    sectionParent.insertBefore(newRecents, container);

    expect(newRecents.nextElementSibling).toBe(container);

    // MutationObserver callbacks are async — wait two animation frames so the
    // rAF-batched enforcer runs.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(container.nextElementSibling).toBe(newRecents);
    expect(typed.recentSection).toBe(newRecents);
  });
});
