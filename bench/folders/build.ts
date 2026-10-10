/**
 * Bundles the bench entries with the repository's own esbuild, resolving the
 * `@/` aliases from tsconfig.json, `?raw` CSS imports as text, and
 * `webextension-polyfill` to the in-memory stub.
 */

import { type Plugin, build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(BENCH_DIR, '../..');

const rawImports: Plugin = {
  name: 'raw-imports',
  setup(context) {
    context.onResolve({ filter: /\?raw$/ }, (args) => {
      const file = args.path.replace(/\?raw$/, '');
      return {
        path: file.startsWith('@/')
          ? path.join(REPO_ROOT, 'src', file.slice(2))
          : path.resolve(args.resolveDir, file),
        namespace: 'raw',
      };
    });
    context.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

export async function bundle(entry: string, platform: 'node' | 'browser'): Promise<string> {
  const result = await build({
    entryPoints: [path.join(BENCH_DIR, entry)],
    bundle: true,
    write: false,
    format: 'esm',
    platform,
    target: platform === 'node' ? 'node20' : 'chrome120',
    absWorkingDir: REPO_ROOT,
    tsconfig: path.join(REPO_ROOT, 'tsconfig.json'),
    jsx: 'automatic',
    jsxImportSource: 'preact',
    // Production builds minify; keep names so a profile of the page stays readable.
    minifySyntax: true,
    minifyWhitespace: true,
    keepNames: false,
    sourcemap: false,
    logLevel: 'error',
    define: {
      'import.meta.env': '{}',
      'process.env.NODE_ENV': '"production"',
    },
    alias: {
      'webextension-polyfill': path.join(BENCH_DIR, 'stubs/webextensionPolyfill.ts'),
    },
    plugins: [rawImports],
  });
  return result.outputFiles[0].text;
}
