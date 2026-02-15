import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('conversation menu i18n', () => {
  it('uses exportChatJson text for conversation menu item label', () => {
    const code = readFileSync(resolve(process.cwd(), 'src/pages/content/export/index.ts'), 'utf8');

    expect(code).toMatch(/const label[\s\S]*\['exportChatJson'\]/);
  });
});
