import { execFileSync } from 'node:child_process';

/** Shared bundle/publisher source order; rebuilding old source must not make it fresher. */
export function getCatalogRevision(
  repoRoot: string,
  mode: 'production' | 'unstamped' = process.env.__DEV__ === 'true' || process.env.VITEST === 'true'
    ? 'unstamped'
    : 'production',
): number {
  // Contributor builds stay unstamped so shallow checkouts can develop and run tests.
  if (mode === 'unstamped') return 0;
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  if (git('rev-parse', '--is-shallow-repository') !== 'false') {
    throw new Error(
      'Catalog freshness requires full Git history; fetch with --unshallow or fetch-depth: 0',
    );
  }
  const revision = Number(git('rev-list', '--first-parent', '--count', 'HEAD'));
  if (!Number.isSafeInteger(revision) || revision <= 0)
    throw new Error('Invalid catalog source revision');
  return revision;
}
