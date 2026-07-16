import { describe, expect, it } from 'vitest';

import { resolveOptionalHighlightSetting } from '../highlightOptionalSetting';

describe('optional Highlight setting migration', () => {
  it('keeps explicit user choices', () => {
    expect(resolveOptionalHighlightSetting(true, false)).toEqual({
      enabled: true,
      shouldPersist: false,
    });
    expect(resolveOptionalHighlightSetting(false, true)).toEqual({
      enabled: false,
      shouldPersist: false,
    });
  });

  it('enables legacy users who already have live highlights', () => {
    expect(resolveOptionalHighlightSetting(undefined, true)).toEqual({
      enabled: true,
      shouldPersist: true,
    });
  });

  it('disables Highlight by default for users who never used it', () => {
    expect(resolveOptionalHighlightSetting(undefined, false)).toEqual({
      enabled: false,
      shouldPersist: true,
    });
  });
});
