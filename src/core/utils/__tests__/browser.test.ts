import { describe, expect, it, vi } from 'vitest';

import { isSafari, shouldShowSafariUpdateReminder } from '../browser';

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
