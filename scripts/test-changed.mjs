#!/usr/bin/env node
/**
 * `bun run test:changed`: the tests affected by changes since `main`.
 *
 * `vitest --changed` follows imports only, but tests load `public/*.js` (the
 * page-world scripts) from disk with `readFileSync`, so a change to one selected
 * nothing. Those tests are found here by the script's file name and run next to
 * the import-based selection.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const git = (...args) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
const root = git('rev-parse', '--show-toplevel').trim();
const vitest = (...args) =>
  spawnSync('bunx', ['vitest', 'run', ...args], { cwd: root, stdio: 'inherit' }).status ?? 1;

function walk(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(path);
    return /\.test\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

/** Test files that name any of the given changed `public/*.js` scripts. */
export function testsReadingPublicScripts(changed) {
  const scripts = changed
    .filter((file) => /^public\/[^/]+\.js$/.test(file))
    .map((file) => basename(file));
  if (scripts.length === 0) return [];
  return ['src', 'scripts'].flatMap(walk).filter((file) => {
    const source = readFileSync(join(root, file), 'utf8');
    return scripts.some((name) => source.includes(name));
  });
}

if (process.argv[1] && basename(process.argv[1]) === 'test-changed.mjs') {
  const changed = [
    ...git('diff', '--name-only', 'main').split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ].filter(Boolean);
  const extra = testsReadingPublicScripts(changed);

  let status = vitest('--changed', 'main');
  if (status === 0 && extra.length > 0) status = vitest(...extra);
  process.exit(status);
}
