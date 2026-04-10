import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { extractConvId, isNewChatPath, waitForElement } from '../index';

// Mock getTranslationSyncUnsafe used inside the module
vi.mock('@/utils/i18n', () => ({
  getTranslationSyncUnsafe: (key: string) => key,
}));

// Mock folderColors used inside the module
vi.mock('../../folder/folderColors', () => ({
  getFolderColor: () => '#4285f4',
  isDarkMode: () => false,
}));

// ============================================================================
// isNewChatPath
// ============================================================================

describe('isNewChatPath', () => {
  it('matches /app', () => {
    expect(isNewChatPath('/app')).toBe(true);
  });

  it('matches /app/', () => {
    expect(isNewChatPath('/app/')).toBe(true);
  });

  it('matches /u/0/app', () => {
    expect(isNewChatPath('/u/0/app')).toBe(true);
  });

  it('matches /u/1/app/', () => {
    expect(isNewChatPath('/u/1/app/')).toBe(true);
  });

  it('does NOT match /app/<convId>', () => {
    expect(isNewChatPath('/app/abc123')).toBe(false);
  });

  it('matches /gem/<gemId>', () => {
    expect(isNewChatPath('/gem/mygem')).toBe(true);
  });

  it('matches /gem/<gemId>/', () => {
    expect(isNewChatPath('/gem/mygem/')).toBe(true);
  });

  it('does NOT match /gem/<gemId>/<convId>', () => {
    expect(isNewChatPath('/gem/mygem/conv123')).toBe(false);
  });

  it('does NOT match other paths', () => {
    expect(isNewChatPath('/settings')).toBe(false);
    expect(isNewChatPath('/')).toBe(false);
  });
});

// ============================================================================
// extractConvId
// ============================================================================

describe('extractConvId', () => {
  it('extracts convId from /app/<id>', () => {
    expect(extractConvId('/app/abc123')).toBe('abc123');
  });

  it('extracts convId from /u/0/app/<id>', () => {
    expect(extractConvId('/u/0/app/xyz789')).toBe('xyz789');
  });

  it('returns null for /app (no convId)', () => {
    expect(extractConvId('/app')).toBeNull();
  });

  it('returns null for /app/', () => {
    expect(extractConvId('/app/')).toBeNull();
  });

  it('extracts convId from /gem/<gemId>/<convId>', () => {
    expect(extractConvId('/gem/mygem/conv123')).toBe('conv123');
  });

  it('returns null for /gem/<gemId> (no convId)', () => {
    expect(extractConvId('/gem/mygem')).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(extractConvId('/settings')).toBeNull();
  });
});

// ============================================================================
// waitForElement
// ============================================================================

describe('waitForElement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('resolves immediately when element already exists with nonzero height', async () => {
    document.body.innerHTML = '<div id="target" style="height:10px">hello</div>';
    const el = document.getElementById('target')!;
    // jsdom getBoundingClientRect returns 0 by default; mock it
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      height: 10,
    } as DOMRect);

    const promise = waitForElement('#target', 1000);
    // resolve animation frame
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(el);
  });

  it('resolves null on timeout if element never appears', async () => {
    const promise = waitForElement('#nonexistent', 100);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeNull();
  });
});

// ============================================================================
// startFolderProject — feature-off skip
// ============================================================================

describe('startFolderProject — feature disabled', () => {
  beforeEach(() => {
    // Feature disabled in storage
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [StorageKeys.FOLDER_PROJECT_ENABLED]: false });
      },
    );
  });

  it('does not inject a picker when feature is disabled', async () => {
    document.body.innerHTML = '<rich-textarea></rich-textarea>';

    const { startFolderProject } = await import('../index');
    const mockManager = {
      getFolders: vi.fn().mockReturnValue([]),
      ensureDataLoaded: vi.fn().mockResolvedValue(undefined),
      addConversationToFolderFromNative: vi.fn(),
    };

    startFolderProject(mockManager as unknown as Parameters<typeof startFolderProject>[0]);

    // No picker should be injected
    expect(document.querySelector('.gv-fp-picker-container')).toBeNull();
  });
});

// ============================================================================
// waitForElement — model selector target
// ============================================================================

describe('waitForElement — model selector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('resolves when .input-area-switch-label exists with nonzero height', async () => {
    const btn = document.createElement('button');
    btn.className = 'input-area-switch-label';
    btn.textContent = 'Pro';
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({ height: 20 } as DOMRect);
    document.body.appendChild(btn);

    const promise = waitForElement('.input-area-switch-label', 1000);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(btn);
  });

  it('resolves null when model selector does not appear within timeout', async () => {
    const promise = waitForElement('.input-area-switch-label', 100);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeNull();
  });
});

// ============================================================================
// startFolderProject — runtime toggle
// ============================================================================

describe('startFolderProject — runtime toggle', () => {
  let storageListeners: Array<
    (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
  >;

  beforeEach(() => {
    vi.resetModules();
    storageListeners = [];
    document.body.innerHTML = '';

    // Capture onChanged listeners registered by startFolderProject
    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => {
        storageListeners.push(listener);
      },
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('does not initialize when toggled on in non-sync area', async () => {
    // Feature starts disabled
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [StorageKeys.FOLDER_PROJECT_ENABLED]: false });
      },
    );

    const { startFolderProject } = await import('../index');
    const mockManager = {
      getFolders: vi.fn().mockReturnValue([]),
      ensureDataLoaded: vi.fn().mockResolvedValue(undefined),
      addConversationToFolderFromNative: vi.fn(),
    };
    startFolderProject(mockManager as unknown as Parameters<typeof startFolderProject>[0]);

    // Simulate toggle in 'local' area (not 'sync') — should be ignored
    for (const listener of storageListeners) {
      listener(
        { [StorageKeys.FOLDER_PROJECT_ENABLED]: { newValue: true, oldValue: false } },
        'local',
      );
    }

    expect(document.querySelector('.gv-fp-picker-container')).toBeNull();
  });

  it('removes picker when feature is toggled off', async () => {
    // Feature starts enabled
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [StorageKeys.FOLDER_PROJECT_ENABLED]: true });
      },
    );

    const { startFolderProject } = await import('../index');
    const mockManager = {
      getFolders: vi.fn().mockReturnValue([]),
      ensureDataLoaded: vi.fn().mockResolvedValue(undefined),
      addConversationToFolderFromNative: vi.fn(),
    };
    startFolderProject(mockManager as unknown as Parameters<typeof startFolderProject>[0]);

    // Simulate toggle off
    for (const listener of storageListeners) {
      listener(
        { [StorageKeys.FOLDER_PROJECT_ENABLED]: { newValue: false, oldValue: true } },
        'sync',
      );
    }

    expect(document.querySelector('.gv-fp-picker-container')).toBeNull();
  });
});
