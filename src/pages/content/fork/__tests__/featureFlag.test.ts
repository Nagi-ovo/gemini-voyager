import { describe, expect, it } from 'vitest';

import { isForkFeatureEnabledValue } from '../featureFlag';

describe('isForkFeatureEnabledValue', () => {
  it('should return true only for boolean true', () => {
    expect(isForkFeatureEnabledValue(true)).toBe(true);
    expect(isForkFeatureEnabledValue(false)).toBe(false);
    expect(isForkFeatureEnabledValue(undefined)).toBe(false);
    expect(isForkFeatureEnabledValue('true')).toBe(false);
    expect(isForkFeatureEnabledValue(1)).toBe(false);
  });
});
