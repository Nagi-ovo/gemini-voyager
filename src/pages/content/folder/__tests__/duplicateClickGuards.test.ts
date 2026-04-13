import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

type TestableManager = {
  containerElement: HTMLElement | null;
  activeFolderInput: HTMLElement | null;
  activeImportDialog: HTMLElement | null;
  activeImportExportMenu: HTMLElement | null;
  reinitializePromise: Promise<void> | null;
  createFolder: (parentId?: string | null) => void;
  initializeFolderUI: () => Promise<void>;
  reinitializeFolderUI: () => void;
  showImportDialog: () => void;
  showImportExportMenu: (event: MouseEvent) => void;
};

function mountFolderList(manager: TestableManager): HTMLElement {
  const container = document.createElement('div');
  const list = document.createElement('div');
  list.className = 'gv-folder-list';
  container.appendChild(list);
  document.body.appendChild(container);
  manager.containerElement = container;
  return list;
}

describe('folder duplicate click guards', () => {
  let manager: FolderManager | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reuses the active folder input instead of creating duplicates', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    mountFolderList(typedManager);

    typedManager.createFolder();

    const input = document.querySelector('.gv-folder-name-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(document.querySelectorAll('.gv-folder-inline-input')).toHaveLength(1);
    expect(typedManager.activeFolderInput).not.toBeNull();

    const focusTrap = document.createElement('button');
    document.body.appendChild(focusTrap);
    focusTrap.focus();
    expect(document.activeElement).toBe(focusTrap);

    typedManager.createFolder();

    expect(document.querySelectorAll('.gv-folder-inline-input')).toHaveLength(1);
    expect(document.activeElement).toBe(input);
  });

  it('clears stale folder input state during reinitialize so creation stays usable', async () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    mountFolderList(typedManager);

    typedManager.createFolder();
    expect(document.querySelectorAll('.gv-folder-inline-input')).toHaveLength(1);
    expect(typedManager.activeFolderInput).not.toBeNull();

    vi.spyOn(typedManager, 'initializeFolderUI').mockImplementation(async () => {
      mountFolderList(typedManager);
    });

    typedManager.reinitializeFolderUI();
    await typedManager.reinitializePromise;

    expect(typedManager.activeFolderInput).toBeNull();

    typedManager.createFolder();

    expect(document.querySelectorAll('.gv-folder-inline-input')).toHaveLength(1);
    expect(typedManager.activeFolderInput).not.toBeNull();
  });

  it('toggles the import/export menu instead of stacking duplicates', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    typedManager.showImportExportMenu(
      new MouseEvent('click', { bubbles: true, clientX: 24, clientY: 16 }),
    );

    expect(document.querySelectorAll('.gv-folder-menu')).toHaveLength(1);
    expect(typedManager.activeImportExportMenu).not.toBeNull();

    typedManager.showImportExportMenu(
      new MouseEvent('click', { bubbles: true, clientX: 28, clientY: 20 }),
    );

    expect(document.querySelectorAll('.gv-folder-menu')).toHaveLength(0);
    expect(typedManager.activeImportExportMenu).toBeNull();

    vi.runOnlyPendingTimers();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    typedManager.showImportExportMenu(
      new MouseEvent('click', { bubbles: true, clientX: 32, clientY: 24 }),
    );

    expect(document.querySelectorAll('.gv-folder-menu')).toHaveLength(1);
    expect(typedManager.activeImportExportMenu).not.toBeNull();
  });

  it('removes stale menu listeners when toggling closed before reopening', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    typedManager.showImportExportMenu(
      new MouseEvent('click', { bubbles: true, clientX: 24, clientY: 16 }),
    );
    vi.runOnlyPendingTimers();

    typedManager.showImportExportMenu(
      new MouseEvent('click', { bubbles: true, clientX: 28, clientY: 20 }),
    );
    expect(typedManager.activeImportExportMenu).toBeNull();

    typedManager.showImportExportMenu(
      new MouseEvent('click', { bubbles: true, clientX: 32, clientY: 24 }),
    );
    vi.runOnlyPendingTimers();

    const reopenedMenu = document.querySelector('.gv-folder-menu') as HTMLElement | null;
    expect(reopenedMenu).not.toBeNull();
    reopenedMenu?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelectorAll('.gv-folder-menu')).toHaveLength(1);
    expect(typedManager.activeImportExportMenu).toBe(reopenedMenu);
  });

  it('keeps the import dialog singleton and reopens cleanly after closing', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    typedManager.showImportDialog();

    expect(document.querySelectorAll('.gv-folder-dialog-overlay')).toHaveLength(1);
    expect(typedManager.activeImportDialog).not.toBeNull();

    typedManager.showImportDialog();

    expect(document.querySelectorAll('.gv-folder-dialog-overlay')).toHaveLength(1);

    const cancelBtn = document.querySelector(
      '.gv-folder-dialog-btn-secondary',
    ) as HTMLButtonElement | null;
    expect(cancelBtn).not.toBeNull();

    cancelBtn?.click();

    expect(document.querySelectorAll('.gv-folder-dialog-overlay')).toHaveLength(0);
    expect(typedManager.activeImportDialog).toBeNull();

    typedManager.showImportDialog();

    expect(document.querySelectorAll('.gv-folder-dialog-overlay')).toHaveLength(1);
    expect(typedManager.activeImportDialog).not.toBeNull();
  });

  it('cleans up tracked UI overlays during destroy', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;

    mountFolderList(typedManager);
    typedManager.createFolder();
    typedManager.showImportDialog();
    typedManager.showImportExportMenu(
      new MouseEvent('click', { bubbles: true, clientX: 24, clientY: 16 }),
    );
    vi.runOnlyPendingTimers();

    expect(document.querySelectorAll('.gv-folder-inline-input')).toHaveLength(1);
    expect(document.querySelectorAll('.gv-folder-dialog-overlay')).toHaveLength(1);
    expect(document.querySelectorAll('.gv-folder-menu')).toHaveLength(1);

    manager.destroy();
    manager = null;

    expect(document.querySelectorAll('.gv-folder-inline-input')).toHaveLength(0);
    expect(document.querySelectorAll('.gv-folder-dialog-overlay')).toHaveLength(0);
    expect(document.querySelectorAll('.gv-folder-menu')).toHaveLength(0);
    expect(typedManager.activeFolderInput).toBeNull();
    expect(typedManager.activeImportDialog).toBeNull();
    expect(typedManager.activeImportExportMenu).toBeNull();
  });
});
