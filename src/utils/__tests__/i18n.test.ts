import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { getCurrentLanguage } from '../i18n';

vi.mock('webextension-polyfill', () => {
  const storageArea = { get: vi.fn(), set: vi.fn() };
  return {
    default: {
      storage: {
        sync: storageArea,
        local: { get: vi.fn(), set: vi.fn() },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      i18n: { getUILanguage: vi.fn() },
    },
  };
});

describe('getCurrentLanguage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses sync storage when available', async () => {
    const syncGet = browser.storage.sync.get as unknown as ReturnType<typeof vi.fn>;
    const localGet = browser.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    const uiLang = browser.i18n.getUILanguage as unknown as ReturnType<typeof vi.fn>;
    syncGet.mockResolvedValue({ language: 'zh' });
    localGet.mockResolvedValue({});
    uiLang.mockReturnValue('en-US');

    const lang = await getCurrentLanguage();

    expect(lang).toBe('zh');
  });

  it('falls back to local storage when sync is missing', async () => {
    const syncGet = browser.storage.sync.get as unknown as ReturnType<typeof vi.fn>;
    const localGet = browser.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    const uiLang = browser.i18n.getUILanguage as unknown as ReturnType<typeof vi.fn>;
    syncGet.mockResolvedValue({});
    localGet.mockResolvedValue({ language: 'es' });
    uiLang.mockReturnValue('en-US');

    const lang = await getCurrentLanguage();

    expect(lang).toBe('es');
  });

  it('falls back to chrome storage when browser storage throws', async () => {
    const syncGet = browser.storage.sync.get as unknown as ReturnType<typeof vi.fn>;
    const localGet = browser.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    const uiLang = browser.i18n.getUILanguage as unknown as ReturnType<typeof vi.fn>;
    syncGet.mockRejectedValue(new Error('sync failed'));
    localGet.mockRejectedValue(new Error('local failed'));
    uiLang.mockReturnValue('en-US');

    const chromeStorageGet = chrome.storage.sync.get as unknown as {
      mockImplementation: (fn: (key: string, callback: (result: unknown) => void) => void) => void;
    };
    chromeStorageGet.mockImplementation((key: string, callback: (result: unknown) => void) => {
      callback({ language: 'ja' });
    });

    const lang = await getCurrentLanguage();

    expect(lang).toBe('ja');
  });

  it('falls back to browser UI language when no storage value exists', async () => {
    const syncGet = browser.storage.sync.get as unknown as ReturnType<typeof vi.fn>;
    const localGet = browser.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    const uiLang = browser.i18n.getUILanguage as unknown as ReturnType<typeof vi.fn>;
    syncGet.mockResolvedValue({});
    localGet.mockResolvedValue({});
    uiLang.mockReturnValue('fr-FR');

    const lang = await getCurrentLanguage();

    expect(lang).toBe('fr');
  });
});
