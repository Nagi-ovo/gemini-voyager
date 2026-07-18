import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempRoots: string[] = [];

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

    const result = spawnSync(
      process.execPath,
      [resolve(process.cwd(), 'scripts/verify-release-privacy.mjs'), artifact],
      { encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Release privacy check passed (1 files, 1 symlinks)');
  });
});
