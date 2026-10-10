import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

const SOURCE_ROOT = resolve(process.cwd(), 'src');

function shippedSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : shippedSourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

// Safari before 16.4 throws a SyntaxError on RegExp lookbehind, which kills the whole bundle.
it('keeps shipped code free of RegExp lookbehind that older Safari cannot parse', () => {
  const offenders = shippedSourceFiles(SOURCE_ROOT)
    .filter((path) => /\(\?<[=!]/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(SOURCE_ROOT, path));

  expect(offenders).toEqual([]);
});
