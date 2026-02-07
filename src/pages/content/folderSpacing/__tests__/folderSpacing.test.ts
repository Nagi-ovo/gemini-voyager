import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STYLE_ID = 'gv-folder-spacing-style';
const STORAGE_KEY = 'gvFolderSpacing';

describe('folderSpacing', () => {
  let storageChangeListeners: Array<
    (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
  >;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    storageChangeListeners = [];

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [STORAGE_KEY]: 2 });
      },
    );

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => {
        storageChangeListeners.push(listener);
      },
    );
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
  });

  it('injects a style element with the default spacing', async () => {
    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
    expect(style).not.toBeNull();
    expect(style.textContent).toContain('gap: 2px');
  });

  it('clamps spacing below minimum to 0', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [STORAGE_KEY]: -5 });
      },
    );

    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
    expect(style).not.toBeNull();
    expect(style.textContent).toContain('gap: 0px');
  });

  it('clamps spacing above maximum to 16', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [STORAGE_KEY]: 50 });
      },
    );

    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
    expect(style).not.toBeNull();
    expect(style.textContent).toContain('gap: 16px');
  });

  it('updates spacing when storage changes', async () => {
    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    // Simulate storage change
    expect(storageChangeListeners.length).toBeGreaterThan(0);
    storageChangeListeners[0]({ [STORAGE_KEY]: { newValue: 8, oldValue: 2 } }, 'sync');

    const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
    expect(style.textContent).toContain('gap: 8px');
  });

  it('ignores storage changes from non-sync areas', async () => {
    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    const styleBefore = document.getElementById(STYLE_ID) as HTMLStyleElement;
    const contentBefore = styleBefore.textContent;

    storageChangeListeners[0]({ [STORAGE_KEY]: { newValue: 10, oldValue: 2 } }, 'local');

    const styleAfter = document.getElementById(STYLE_ID) as HTMLStyleElement;
    expect(styleAfter.textContent).toBe(contentBefore);
  });

  it('scales vertical padding proportionally with spacing', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [STORAGE_KEY]: 12 });
      },
    );

    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
    // At spacing 12: verticalPadding = max(4, 4 + 12 * 0.5) = 10px
    expect(style.textContent).toContain('padding-top: 10px');
    expect(style.textContent).toContain('padding-bottom: 10px');
  });

  it('ensures minimum vertical padding of 4px to prevent text overlap', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [STORAGE_KEY]: 0 });
      },
    );

    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
    // At spacing 0: verticalPadding = max(4, 4 + 0) = 4px
    expect(style.textContent).toContain('padding-top: 4px');
    expect(style.textContent).toContain('padding-bottom: 4px');
  });

  it('removes style element on beforeunload', async () => {
    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    expect(document.getElementById(STYLE_ID)).not.toBeNull();

    window.dispatchEvent(new Event('beforeunload'));

    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('falls back to default spacing for non-numeric values', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [STORAGE_KEY]: 'invalid' });
      },
    );

    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
    // Falls back to default (2) since stored value is not a number
    expect(style.textContent).toContain('gap: 2px');
  });

  it('targets both folder-list and folder-content gaps', async () => {
    const { startFolderSpacingAdjuster } = await import('../index');
    startFolderSpacingAdjuster();

    const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
    expect(style.textContent).toContain('.gv-folder-list');
    expect(style.textContent).toContain('.gv-folder-content');
    expect(style.textContent).toContain('.gv-folder-item-header');
    expect(style.textContent).toContain('.gv-folder-conversation');
  });
});
