import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('prompt manager footer actions', () => {
  it('keeps the secondary footer row to settings and support', () => {
    const code = readFileSync(resolve(process.cwd(), 'src/pages/content/prompt/index.ts'), 'utf8');
    const footerBlock =
      code.match(
        /const secondaryActions = createEl\('div', 'gv-pm-footer-secondary'\);[\s\S]*?footer\.appendChild\(secondaryActions\);/,
      )?.[0] ?? '';

    expect(footerBlock).toContain('secondaryActions.appendChild(settingsBtn);');
    expect(footerBlock).toContain('secondaryActions.appendChild(supportLink);');
    expect(footerBlock).not.toContain('localBackupBtn');
    expect(footerBlock).not.toContain('importBtn');
    expect(footerBlock).not.toContain('exportBtn');
  });
});
