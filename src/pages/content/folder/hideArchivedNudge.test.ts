import { describe, expect, it } from 'vitest';

import { shouldShowHideArchivedNudge } from './hideArchivedNudge';

describe('shouldShowHideArchivedNudge', () => {
  it('returns true for a fresh user who has not seen the nudge and has not enabled hide-archived', () => {
    expect(shouldShowHideArchivedNudge({ nudgeShown: false, hideArchivedAlreadyOn: false })).toBe(
      true,
    );
  });

  it('returns false if the nudge has already been shown or dismissed', () => {
    expect(shouldShowHideArchivedNudge({ nudgeShown: true, hideArchivedAlreadyOn: false })).toBe(
      false,
    );
  });

  it('returns false if the user already enabled hide-archived manually', () => {
    expect(shouldShowHideArchivedNudge({ nudgeShown: false, hideArchivedAlreadyOn: true })).toBe(
      false,
    );
  });

  it('returns false when both flags are set (no double-nudge, no noise)', () => {
    expect(shouldShowHideArchivedNudge({ nudgeShown: true, hideArchivedAlreadyOn: true })).toBe(
      false,
    );
  });
});
