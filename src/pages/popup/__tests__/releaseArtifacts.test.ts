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
});
