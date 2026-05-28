import { describe, expect, it } from 'vitest';

import { engineSatisfied, parseSemver } from './semver';

describe('semver', () => {
  it('parses x.y.z', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('not-a-version')).toBeNull();
  });

  it('satisfies * and empty', () => {
    expect(engineSatisfied('*', '1.0.0')).toBe(true);
    expect(engineSatisfied('', '9.9.9')).toBe(true);
  });

  it('satisfies >= ranges', () => {
    expect(engineSatisfied('>=1.0.0', '1.0.0')).toBe(true);
    expect(engineSatisfied('>=1.0.0', '1.2.0')).toBe(true);
    expect(engineSatisfied('>=2.0.0', '1.9.9')).toBe(false);
  });

  it('satisfies exact', () => {
    expect(engineSatisfied('1.0.0', '1.0.0')).toBe(true);
    expect(engineSatisfied('1.0.0', '1.0.1')).toBe(false);
  });

  it('fails closed on unparseable host version', () => {
    expect(engineSatisfied('>=1.0.0', 'garbage')).toBe(false);
  });
});
