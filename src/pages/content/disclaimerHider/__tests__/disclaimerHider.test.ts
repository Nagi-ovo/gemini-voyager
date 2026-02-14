import { beforeEach, describe, expect, it, vi } from 'vitest';

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

describe('disclaimerHider', () => {
  let storageChangeListener: StorageChangeListener | null = null;

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    storageChangeListener = null;

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (
        _defaults: Record<string, unknown>,
        callback: (result: Record<string, unknown>) => void,
      ) => {
        callback({ gvHideGeminiDisclaimer: false });
      },
    );

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: StorageChangeListener) => {
      storageChangeListener = listener;
    });
  });

  it('does not hide disclaimer when setting is disabled by default', async () => {
    const disclaimer = document.createElement('p');
    disclaimer.textContent = 'Gemini is AI and can make mistakes.';
    document.body.appendChild(disclaimer);

    const { startDisclaimerHider } = await import('../index');
    startDisclaimerHider();
    await Promise.resolve();

    expect(disclaimer.style.display).toBe('');
  });

  it('hides English and Chinese disclaimer text when enabled', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (
        _defaults: Record<string, unknown>,
        callback: (result: Record<string, unknown>) => void,
      ) => {
        callback({ gvHideGeminiDisclaimer: true });
      },
    );

    const englishDisclaimer = document.createElement('p');
    englishDisclaimer.textContent = 'Gemini is AI and can make mistakes.';
    englishDisclaimer.style.height = '30px';
    const chineseDisclaimer = document.createElement('p');
    chineseDisclaimer.textContent = 'Gemini 可能会犯错。';
    chineseDisclaimer.style.height = '30px';
    document.body.appendChild(englishDisclaimer);
    document.body.appendChild(chineseDisclaimer);

    const { startDisclaimerHider } = await import('../index');
    startDisclaimerHider();
    await Promise.resolve();

    expect(englishDisclaimer.style.visibility).toBe('hidden');
    expect(englishDisclaimer.style.height).toBe('10px');
    expect(chineseDisclaimer.style.visibility).toBe('hidden');
    expect(chineseDisclaimer.style.height).toBe('10px');
  });

  it('responds to storage changes and restores space when disabled again', async () => {
    const disclaimer = document.createElement('p');
    disclaimer.textContent = 'Gemini is AI and can make mistakes.';
    disclaimer.style.height = '30px';
    disclaimer.style.color = 'rgb(255, 0, 0)';
    document.body.appendChild(disclaimer);

    const { startDisclaimerHider } = await import('../index');
    startDisclaimerHider();
    await Promise.resolve();

    expect(disclaimer.style.display).toBe('');
    expect(storageChangeListener).not.toBeNull();

    storageChangeListener?.(
      {
        gvHideGeminiDisclaimer: { oldValue: false, newValue: true } as chrome.storage.StorageChange,
      },
      'sync',
    );
    expect(disclaimer.style.visibility).toBe('hidden');
    expect(disclaimer.style.height).toBe('10px');

    storageChangeListener?.(
      {
        gvHideGeminiDisclaimer: { oldValue: true, newValue: false } as chrome.storage.StorageChange,
      },
      'sync',
    );
    expect(disclaimer.style.visibility).toBe('');
    expect(disclaimer.style.height).toBe('30px');
    expect(disclaimer.style.color).toBe('rgb(255, 0, 0)');
  });
});
