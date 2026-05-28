import { describe, expect, it } from 'vitest';

import { BUILTIN_PLUGINS } from './index';

describe('BUILTIN_PLUGINS', () => {
  it('is empty — plugins are sourced from the marketplace, not bundled', () => {
    expect(BUILTIN_PLUGINS).toEqual([]);
  });
});
