import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCatalogRevision } from '../lib/catalogRevision';

const roots: string[] = [];
function temporaryRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'gv-catalog-revision-'));
  roots.push(root);
  execFileSync('git', ['init', '--initial-branch=main', root], { stdio: 'pipe' });
  return root;
}
function commit(root: string, date: string): void {
  writeFileSync(join(root, 'site.json'), date);
  execFileSync('git', ['add', 'site.json'], { cwd: root });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'update selectors',
    ],
    {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    },
  );
}
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  vi.unstubAllEnvs();
});

describe('catalog source order', () => {
  it('rebuilding old source cannot gain freshness and clock skew cannot hide a newer selector fix', () => {
    const root = temporaryRepo();
    commit(root, '2026-10-03T10:00:00Z');
    const previous = getCatalogRevision(root, 'production');
    expect(getCatalogRevision(root, 'production')).toBe(previous);
    commit(root, '2026-10-02T10:00:00Z');
    expect(getCatalogRevision(root, 'production')).toBeGreaterThan(previous);
    execFileSync('git', ['checkout', '--detach', 'HEAD~1'], { cwd: root, stdio: 'pipe' });
    expect(getCatalogRevision(root, 'production')).toBe(previous);
  });

  it('a shallow production build cannot publish a misleading truncated freshness stamp', () => {
    const root = temporaryRepo();
    commit(root, '2026-10-03T10:00:00Z');
    commit(root, '2026-10-03T11:00:00Z');
    const shallow = join(root, 'shallow');
    execFileSync('git', ['clone', '--depth=1', `file://${root}`, shallow], { stdio: 'pipe' });
    expect(() => getCatalogRevision(shallow, 'production')).toThrow('full Git history');
    vi.stubEnv('__DEV__', 'false');
    vi.stubEnv('VITEST', 'false');
    expect(() => getCatalogRevision(shallow)).toThrow('full Git history');
  });

  it.each(['development', 'test'] as const)(
    'a shallow checkout does not block %s startup',
    (mode) => {
      const root = temporaryRepo();
      commit(root, '2026-10-03T10:00:00Z');
      commit(root, '2026-10-03T11:00:00Z');
      const shallow = join(root, 'shallow');
      execFileSync('git', ['clone', '--depth=1', `file://${root}`, shallow], { stdio: 'pipe' });
      vi.stubEnv('__DEV__', mode === 'development' ? 'true' : 'false');
      vi.stubEnv('VITEST', mode === 'test' ? 'true' : 'false');
      expect(getCatalogRevision(shallow)).toBe(0);
      expect(getCatalogRevision(root)).toBe(0);
      expect(() => getCatalogRevision(shallow, 'production')).toThrow('full Git history');
    },
  );
});
