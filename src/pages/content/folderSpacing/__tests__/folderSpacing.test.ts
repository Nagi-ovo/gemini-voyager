import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STYLE_ID = 'gv-folder-spacing-style';
const GEMINI_KEY = 'gvFolderSpacing';
const AISTUDIO_KEY = 'gvAIStudioFolderSpacing';

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
        callback({ [GEMINI_KEY]: 2, [AISTUDIO_KEY]: 2 });
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

  // ===== Gemini platform tests =====

  describe('gemini platform', () => {
    it('injects a style element with the default spacing', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style).not.toBeNull();
      expect(style.textContent).toContain('gap: 2px');
    });

    it('uses base selectors without .gv-aistudio prefix', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('.gv-folder-list');
      expect(style.textContent).toContain('.gv-folder-content');
      expect(style.textContent).toContain('.gv-folder-item-header');
      expect(style.textContent).toContain('.gv-folder-conversation');
      expect(style.textContent).not.toContain('.gv-aistudio');
    });

    it('reads from gvFolderSpacing storage key', async () => {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ [GEMINI_KEY]: 10 });
        },
      );

      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('gap: 10px');
    });

    it('responds to gvFolderSpacing storage changes', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      storageChangeListeners[0]({ [GEMINI_KEY]: { newValue: 8, oldValue: 2 } }, 'sync');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('gap: 8px');
    });

    it('ignores gvAIStudioFolderSpacing changes', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const contentBefore = (document.getElementById(STYLE_ID) as HTMLStyleElement).textContent;

      storageChangeListeners[0]({ [AISTUDIO_KEY]: { newValue: 12, oldValue: 2 } }, 'sync');

      expect((document.getElementById(STYLE_ID) as HTMLStyleElement).textContent).toBe(
        contentBefore,
      );
    });

    it('clamps spacing below minimum to 0', async () => {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ [GEMINI_KEY]: -5 });
        },
      );

      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('gap: 0px');
    });

    it('clamps spacing above maximum to 16', async () => {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ [GEMINI_KEY]: 50 });
        },
      );

      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('gap: 16px');
    });

    it('scales vertical padding proportionally', async () => {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ [GEMINI_KEY]: 12 });
        },
      );

      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      // max(4, 4 + 12 * 0.5) = 10px
      expect(style.textContent).toContain('padding-top: 10px');
      expect(style.textContent).toContain('padding-bottom: 10px');
    });

    it('ensures minimum vertical padding of 4px', async () => {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ [GEMINI_KEY]: 0 });
        },
      );

      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('padding-top: 4px');
      expect(style.textContent).toContain('padding-bottom: 4px');
    });
  });

  // ===== AI Studio platform tests =====

  describe('aistudio platform', () => {
    it('injects AI Studio-specific selectors', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('aistudio');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style).not.toBeNull();
      expect(style.textContent).toContain('.gv-aistudio .gv-folder-list');
      expect(style.textContent).toContain('.gv-aistudio .gv-folder-content');
      expect(style.textContent).toContain('.gv-aistudio .gv-folder-item-header');
      expect(style.textContent).toContain('.gv-aistudio .gv-folder-conversation');
      expect(style.textContent).toContain('.gv-aistudio .gv-folder-uncategorized-content');
    });

    it('reads from gvAIStudioFolderSpacing storage key', async () => {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ [AISTUDIO_KEY]: 8 });
        },
      );

      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('aistudio');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('gap: 8px');
    });

    it('responds to gvAIStudioFolderSpacing storage changes', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('aistudio');

      storageChangeListeners[0]({ [AISTUDIO_KEY]: { newValue: 6, oldValue: 2 } }, 'sync');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('gap: 6px');
    });

    it('ignores gvFolderSpacing changes', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('aistudio');

      const contentBefore = (document.getElementById(STYLE_ID) as HTMLStyleElement).textContent;

      storageChangeListeners[0]({ [GEMINI_KEY]: { newValue: 12, oldValue: 2 } }, 'sync');

      expect((document.getElementById(STYLE_ID) as HTMLStyleElement).textContent).toBe(
        contentBefore,
      );
    });

    it('uses more compact padding than Gemini at same spacing', async () => {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ [AISTUDIO_KEY]: 12 });
        },
      );

      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('aistudio');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      // max(3, round(3 + 12 * 0.45)) = max(3, 8) = 8px (vs Gemini's 10px)
      expect(style.textContent).toContain('padding-top: 8px');
      expect(style.textContent).toContain('padding-bottom: 8px');
    });

    it('ensures minimum padding of 3px at zero spacing', async () => {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ [AISTUDIO_KEY]: 0 });
        },
      );

      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('aistudio');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('padding-top: 3px');
      expect(style.textContent).toContain('padding-bottom: 3px');
    });
  });

  // ===== Shared behavior tests =====

  describe('shared behavior', () => {
    it('removes style element on beforeunload', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      expect(document.getElementById(STYLE_ID)).not.toBeNull();

      window.dispatchEvent(new Event('beforeunload'));

      expect(document.getElementById(STYLE_ID)).toBeNull();
    });

    it('falls back to default spacing for non-numeric values', async () => {
      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ [GEMINI_KEY]: 'invalid' });
        },
      );

      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      expect(style.textContent).toContain('gap: 2px');
    });

    it('ignores storage changes from non-sync areas', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster('gemini');

      const contentBefore = (document.getElementById(STYLE_ID) as HTMLStyleElement).textContent;

      storageChangeListeners[0]({ [GEMINI_KEY]: { newValue: 10, oldValue: 2 } }, 'local');

      expect((document.getElementById(STYLE_ID) as HTMLStyleElement).textContent).toBe(
        contentBefore,
      );
    });

    it('defaults to gemini platform when no argument provided', async () => {
      const { startFolderSpacingAdjuster } = await import('../index');
      startFolderSpacingAdjuster();

      const style = document.getElementById(STYLE_ID) as HTMLStyleElement;
      // Should use base selectors (no .gv-aistudio)
      expect(style.textContent).not.toContain('.gv-aistudio');
      expect(style.textContent).toContain('.gv-folder-list');
    });
  });
});
