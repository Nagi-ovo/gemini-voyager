import { describe, expect, it } from 'vitest';

import { shouldShowFloatingModeNudge } from './floatingModeNudge';

describe('shouldShowFloatingModeNudge', () => {
  it('returns true for a fresh user who has not seen the nudge and has no floating window open', () => {
    expect(shouldShowFloatingModeNudge({ nudgeShown: false, floatingAlreadyOpen: false })).toBe(
      true,
    );
  });

  it('returns false if the nudge has already been dismissed', () => {
    expect(shouldShowFloatingModeNudge({ nudgeShown: true, floatingAlreadyOpen: false })).toBe(
      false,
    );
  });

  it('returns false if the floating window is already on screen', () => {
    expect(shouldShowFloatingModeNudge({ nudgeShown: false, floatingAlreadyOpen: true })).toBe(
      false,
    );
  });

  it('returns false when both flags are set', () => {
    expect(shouldShowFloatingModeNudge({ nudgeShown: true, floatingAlreadyOpen: true })).toBe(
      false,
    );
  });
});
