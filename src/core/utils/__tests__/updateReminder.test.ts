import { describe, expect, it } from 'vitest';

import { shouldShowUpdateReminderForCurrentVersion } from '../updateReminder';

describe('shouldShowUpdateReminderForCurrentVersion', () => {
  it('returns false when current version is missing', () => {
    expect(
      shouldShowUpdateReminderForCurrentVersion({
        currentVersion: null,
        isSafariBrowser: false,
        safariReminderEnabled: false,
      }),
    ).toBe(false);
  });

  it('returns true for Safari when safari reminder flag is enabled', () => {
    expect(
      shouldShowUpdateReminderForCurrentVersion({
        currentVersion: '2.5.0',
        isSafariBrowser: true,
        safariReminderEnabled: true,
      }),
    ).toBe(true);
  });

  it('returns false for Safari when safari reminder flag is disabled', () => {
    expect(
      shouldShowUpdateReminderForCurrentVersion({
        currentVersion: '0.9.0',
        isSafariBrowser: true,
        safariReminderEnabled: false,
      }),
    ).toBe(false);
  });

  it('keeps non-Safari threshold behavior by default', () => {
    expect(
      shouldShowUpdateReminderForCurrentVersion({
        currentVersion: '1.2.2',
        isSafariBrowser: false,
        safariReminderEnabled: false,
      }),
    ).toBe(true);
    expect(
      shouldShowUpdateReminderForCurrentVersion({
        currentVersion: '1.2.3',
        isSafariBrowser: false,
        safariReminderEnabled: false,
      }),
    ).toBe(false);
  });

  it('returns false for invalid version formats', () => {
    expect(
      shouldShowUpdateReminderForCurrentVersion({
        currentVersion: 'invalid',
        isSafariBrowser: false,
        safariReminderEnabled: false,
      }),
    ).toBe(false);
  });
});
