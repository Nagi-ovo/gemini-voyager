import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('folder manager filter user save guard', () => {
  it('ignores extension context invalidated error when saving filter setting', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/folder/manager.ts'),
      'utf8',
    );

    expect(code).toContain('Failed to save filter user setting:');
    expect(code).toContain('if (isExtensionContextInvalidatedError(e))');
    expect(code).toContain("console.error('Failed to save filter user setting:', e);");
  });
});
