import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('prompt manager lifecycle', () => {
  it('stops slash completion immediately when Prompt Manager is hidden', () => {
    const code = readFileSync(resolve(process.cwd(), 'src/pages/content/prompt/index.ts'), 'utf8');
    const hiddenBranch =
      code.match(
        /if \(pmHiddenByUser && !changelogBadgeActive\) \{[\s\S]*?return \{ destroy: \(\) => \{\} \};[\s\S]*?\}/,
      )?.[0] ?? '';

    expect(hiddenBranch).toContain('slashPromptController?.destroy();');
    expect(hiddenBranch.indexOf('slashPromptController?.destroy();')).toBeLessThan(
      hiddenBranch.indexOf('return { destroy: () => {} };'),
    );
  });
});
