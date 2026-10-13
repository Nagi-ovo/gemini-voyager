import { describe, expect, it } from 'vitest';

import { testsReadingPublicScripts } from './test-changed.mjs';

describe('test:changed', () => {
  it('selects the tests that read a changed public script from disk', () => {
    expect(testsReadingPublicScripts([`public/${'usage'}-observer.js`])).toContain(
      'src/features/plugins/builtin/claudeUsage/observer.test.ts',
    );
  });

  it('selects nothing for changes outside public scripts', () => {
    expect(testsReadingPublicScripts(['src/core/utils/version.ts', 'public/x.css'])).toEqual([]);
  });
});
