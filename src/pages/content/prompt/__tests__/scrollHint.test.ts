import { describe, expect, it } from 'vitest';

import { getScrollHintState } from '../scrollHint';

describe('getScrollHintState', () => {
  it('returns no hint when content does not overflow', () => {
    expect(getScrollHintState(0, 180, 180)).toEqual({
      isOverflowing: false,
      showHint: false,
    });
  });

  it('shows hint when content overflows and user is near top', () => {
    expect(getScrollHintState(0, 140, 320)).toEqual({
      isOverflowing: true,
      showHint: true,
    });
  });

  it('hides hint when user is near the bottom', () => {
    expect(getScrollHintState(176, 140, 320)).toEqual({
      isOverflowing: true,
      showHint: false,
    });
  });

  it('handles invalid numeric inputs safely', () => {
    expect(getScrollHintState(Number.NaN, Number.NaN, Number.NaN)).toEqual({
      isOverflowing: false,
      showHint: false,
    });
  });
});
