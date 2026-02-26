import { describe, expect, it } from 'vitest';

import { makeStableTurnId, normalizeTurnId } from '../turnId';

describe('turnId', () => {
  it('should create stable turn IDs from index', () => {
    expect(makeStableTurnId(0)).toBe('u-0');
    expect(makeStableTurnId(3)).toBe('u-3');
  });

  it('should normalize legacy hashed turn IDs', () => {
    expect(normalizeTurnId('u-0-abcd')).toBe('u-0');
    expect(normalizeTurnId('u-12-xyz')).toBe('u-12');
  });

  it('should keep non-user turn IDs unchanged', () => {
    expect(normalizeTurnId('custom-id')).toBe('custom-id');
  });
});
