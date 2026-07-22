import { describe, expect, it } from 'vitest';

import { normalizePromptName } from '../promptName';

describe('normalizePromptName', () => {
  it('trims a required prompt name', () => {
    expect(normalizePromptName('  Code review  ')).toBe('Code review');
  });

  it('rejects a blank prompt name', () => {
    expect(normalizePromptName('   ')).toBeNull();
  });
});
