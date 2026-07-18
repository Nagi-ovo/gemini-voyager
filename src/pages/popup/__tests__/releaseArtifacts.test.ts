import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('release artifacts', () => {
  it('documents the browser-ready Voyager artifacts instead of source archives', () => {
    const template = readFileSync(resolve(process.cwd(), '.github/RELEASE_TEMPLATE.md'), 'utf8');

    expect(template).toContain('voyager-chrome-v{VERSION}.zip');
    expect(template).toContain('voyager-firefox-v{VERSION}.xpi');
    expect(template).toContain('Source code (zip/tar.gz)');
    expect(template).not.toContain('gemini-voyager-chrome-{VERSION}.zip');
  });

  it('validates the Chrome release zip root before publishing', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');

    expect(workflow).toContain('voyager-chrome-${TAG}.zip');
    expect(workflow).toContain("grep -qx 'manifest.json' chrome-zip-files.txt");
    expect(workflow).toContain("grep -qx '_locales/en/messages.json' chrome-zip-files.txt");
  });

  it('checks release outputs for private data and keeps AMO secrets out of workflow commands', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');

    expect(workflow).toContain(
      'node scripts/verify-release-privacy.mjs dist_chrome dist_firefox dist_safari',
    );
    expect(workflow).toContain('node scripts/verify-release-privacy.mjs dist_edge');
    expect(workflow).toContain('AMO_JWT_SECRET: ${{ secrets.AMO_JWT_SECRET }}');
    expect(workflow).not.toContain('--api-secret=${{ secrets.AMO_JWT_SECRET }}');
  });

  it('does not assign to zsh reserved variables while reading notarization results', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/build-safari-release.sh'), 'utf8');

    expect(script).toContain('local notary_status');
    expect(script).not.toMatch(/\blocal status\b/);
    expect(script).not.toContain('submission_id');
  });

  it('builds and stores the Edge release variant independently from Chrome', () => {
    const ci = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.chrome.ts'), 'utf8');
    const edgeBuild = readFileSync(resolve(process.cwd(), 'scripts/build-edge.js'), 'utf8');

    expect(ci).toContain('browser: [chrome, edge, firefox, safari]');
    expect(viteConfig).toContain("process.env.VOYAGER_BUILD_TARGET === 'edge'");
    expect(viteConfig).toContain("? 'dist_edge'");
    expect(viteConfig).toContain("? 'dist_chrome_dev'");
    expect(viteConfig).toContain(": 'dist_chrome'");
    expect(edgeBuild).toContain("path.join(rootDir, 'dist_edge')");
  });
});
