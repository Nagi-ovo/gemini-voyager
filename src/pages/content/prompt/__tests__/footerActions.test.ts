import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('prompt manager footer actions', () => {
  const readPromptManagerCode = () =>
    readFileSync(resolve(process.cwd(), 'src/pages/content/prompt/index.ts'), 'utf8');

  it('keeps the secondary footer row to settings and support', () => {
    const code = readPromptManagerCode();
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

  it('renders the support callout with a sponsor icon instead of emoji text', () => {
    const code = readPromptManagerCode();

    expect(code).toContain('SPONSOR_HEART_PATH_16');
    expect(code).toContain("createElementNS('http://www.w3.org/2000/svg', 'svg')");
    expect(code).toContain("renderSupportLinkLabel(supportLink, i18n.t('sponsorMe'))");
    expect(code).not.toContain("supportLink.textContent = i18n.t('sponsorMe')");
  });
});
