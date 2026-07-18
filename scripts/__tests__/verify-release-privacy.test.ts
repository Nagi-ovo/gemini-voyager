import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempRoots: string[] = [];
const scannerPath = resolve(process.cwd(), 'scripts/verify-release-privacy.mjs');

function runScanner(artifact: string) {
  return spawnSync(process.execPath, [scannerPath, artifact], { encoding: 'utf8' });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('release privacy verification', () => {
  it('checks symlinks without following them outside the artifact', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'voyager-release-privacy-'));
    tempRoots.push(tempRoot);

    const artifact = join(tempRoot, 'artifact');
    const externalDirectory = join(tempRoot, 'external');
    mkdirSync(artifact);
    mkdirSync(externalDirectory);
    writeFileSync(join(artifact, 'safe.txt'), 'safe release content');
    writeFileSync(join(externalDirectory, 'private.txt'), '/Users/private-owner/secret');
    symlinkSync(externalDirectory, join(artifact, 'Applications'));

    const result = runScanner(artifact);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Release privacy check passed (1 files, 1 symlinks)');
  });

  it('allows only the embedded provisioning profiles required by signed apps', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'voyager-release-privacy-'));
    tempRoots.push(tempRoot);

    const contents = join(tempRoot, 'Voyager.app', 'Contents');
    const extensionContents = join(contents, 'PlugIns', 'Voyager Extension.appex', 'Contents');
    mkdirSync(contents, { recursive: true });
    mkdirSync(extensionContents, { recursive: true });
    writeFileSync(join(contents, 'embedded.provisionprofile'), 'signed profile content');
    writeFileSync(join(extensionContents, 'embedded.provisionprofile'), 'signed profile content');

    const expectedProfileResult = runScanner(tempRoot);
    expect(expectedProfileResult.status, expectedProfileResult.stderr).toBe(0);

    writeFileSync(join(contents, 'exported.provisionprofile'), 'unexpected profile content');
    const unexpectedProfileResult = runScanner(tempRoot);
    expect(unexpectedProfileResult.status).toBe(1);
    expect(unexpectedProfileResult.stderr).toContain('forbidden release filename');
  });
});
