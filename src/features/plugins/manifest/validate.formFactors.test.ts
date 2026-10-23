import { describe, expect, it } from 'vitest';

import { validateManifest } from './validate';

const valid = {
  id: 'voyager.test',
  name: 'Test',
  version: '1.0.0',
  description: 'A test plugin',
  author: 'Me',
  category: 'render-fix',
  license: 'MIT',
  engine: '>=1.0.0',
  tier: 'declarative',
  matches: ['https://claude.ai/*'],
  contributes: { domOps: [{ op: 'addClass', target: 'body', className: 'gv-plugin-x' }] },
};

describe('validateManifest requires.formFactors', () => {
  const withFormFactors = (formFactors: unknown) =>
    validateManifest({ ...valid, requires: { formFactors } });

  it('keeps the device classes a plugin declares, once each and in a fixed order', () => {
    const kept = withFormFactors(['mobile', 'desktop', 'mobile']);
    expect(kept.success && kept.data.requires).toEqual({ formFactors: ['desktop', 'mobile'] });
  });

  it('refuses an empty list, an unknown device and a bare string', () => {
    for (const broken of [[], ['tablet'], 'mobile']) {
      const result = withFormFactors(broken);
      expect(result.success ? [] : result.error.map((issue) => issue.path)).toEqual([
        'requires.formFactors',
      ]);
    }
  });
});
