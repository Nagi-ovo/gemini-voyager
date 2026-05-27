import { describe, expect, it, vi } from 'vitest';

import {
  getModifierKey,
  isBrave,
  isMac,
  isSafari,
  shouldShowSafariUpdateReminder,
  supportsExtensionNotifications,
} from '../browser';

describe('Safari Update Reminder Control', () => {
  describe('shouldShowSafariUpdateReminder', () => {
    it('returns false when not running on Safari', () => {
      // Mock non-Safari browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Google Inc.');

      expect(shouldShowSafariUpdateReminder()).toBe(false);
    });

    it('returns false by default when running on Safari (feature disabled)', () => {
      // Mock Safari browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');

      // By default, the environment variable should be false
      expect(shouldShowSafariUpdateReminder()).toBe(false);
    });

    it('isSafari correctly detects Safari browser', () => {
      // Mock Safari browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');

      expect(isSafari()).toBe(true);
    });

    it('isSafari returns false for Chrome', () => {
      // Mock Chrome browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Google Inc.');

      expect(isSafari()).toBe(false);
    });

    it('isSafari returns false for Firefox', () => {
      // Mock Firefox browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('');

      expect(isSafari()).toBe(false);
    });
  });
});

describe('isBrave', () => {
  it('returns true when navigator.brave exists', () => {
    Object.defineProperty(navigator, 'brave', {
      value: { isBrave: () => Promise.resolve(true) },
      configurable: true,
    });
    expect(isBrave()).toBe(true);
    // Cleanup
    Object.defineProperty(navigator, 'brave', {
      value: undefined,
      configurable: true,
    });
    // Remove the property entirely after cleanup
    delete (navigator as unknown as Record<string, unknown>).brave;
  });

  it('returns false when navigator.brave does not exist', () => {
    expect(isBrave()).toBe(false);
  });
});

describe('isMac', () => {
  it('returns true for macOS platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(isMac()).toBe(true);
  });

  it('returns true for Mac ARM platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacARM');
    expect(isMac()).toBe(true);
  });

  it('returns false for Windows platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    );
    expect(isMac()).toBe(false);
  });

  it('returns false for Linux platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
    );
    expect(isMac()).toBe(false);
  });

  it('falls back to userAgent when platform is empty', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
    );
    expect(isMac()).toBe(true);
  });
});

describe('supportsExtensionNotifications', () => {
  it('returns false on Safari even when the notifications API shape exists', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    );
    vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');
    const originalNotifications = chrome.notifications;
    chrome.notifications = { create: vi.fn() } as unknown as typeof chrome.notifications;

    expect(supportsExtensionNotifications()).toBe(false);

    chrome.notifications = originalNotifications;
  });

  it('returns true on Chromium when notifications.create is available', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
    );
    vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Google Inc.');
    const originalNotifications = chrome.notifications;
    chrome.notifications = { create: vi.fn() } as unknown as typeof chrome.notifications;

    expect(supportsExtensionNotifications()).toBe(true);

    chrome.notifications = originalNotifications;
  });
});

describe('getModifierKey', () => {
  it('returns ⌘ on macOS', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(getModifierKey()).toBe('⌘');
  });

  it('returns Ctrl on Windows', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    );
    expect(getModifierKey()).toBe('Ctrl');
  });

  it('returns Ctrl on Linux', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
    );
    expect(getModifierKey()).toBe('Ctrl');
  });
});
