/**
 * Bundle the CLI into one dependency-free ESM file: `bun packages/create-voyager-plugin/build.ts [outdir]`.
 *
 * The extension's own gate modules go in as they are. Two build-time seams
 * replace the Vite-only parts:
 * - `catalog/sites/index.ts` (it uses `import.meta.glob`) becomes
 *   `src/bundledSites.ts`, fed every `site.json` read from disk in glob order;
 * - any other module that still reaches for `import.meta.glob` or
 *   `import.meta.env` fails the build, instead of crashing under Node later.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const PACKAGE_DIR = import.meta.dir;
const ROOT = resolve(PACKAGE_DIR, '../..');
const SITES_DIR = join(ROOT, 'src/features/plugins/catalog/sites');
const SITES_INDEX = join(SITES_DIR, 'index.ts');
const SHIM = join(PACKAGE_DIR, 'src/bundledSites.ts');
const VIRTUAL_ENTRIES = 'voyager:site-entries';

/** What `import.meta.glob('./*\/site.json')` hands `listBundledSiteEntries`, from disk. */
function readSiteEntries(): { siteDir: string; path: string; siteJson: string }[] {
  return readdirSync(SITES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SITES_DIR, entry.name, 'site.json')))
    .map((entry) => ({ glob: `./${entry.name}/site.json`, siteDir: entry.name }))
    .sort((a, b) => (a.glob < b.glob ? -1 : a.glob > b.glob ? 1 : 0))
    .map(({ siteDir }) => ({
      siteDir,
      path: `sites/${siteDir}/site.json`,
      siteJson: readFileSync(join(SITES_DIR, siteDir, 'site.json'), 'utf8'),
    }));
}

const VITE_ONLY = /import\.meta\.(?:glob|env)\b/;

const voyagerSeams: Bun.BunPlugin = {
  name: 'voyager-seams',
  setup(build) {
    build.onResolve({ filter: new RegExp(`^${VIRTUAL_ENTRIES}$`) }, () => ({
      path: VIRTUAL_ENTRIES,
      namespace: 'voyager',
    }));
    build.onLoad({ filter: /.*/, namespace: 'voyager' }, () => ({
      contents: `export default ${JSON.stringify(readSiteEntries())};`,
      loader: 'js',
    }));
    build.onLoad({ filter: /\.tsx?$/ }, (args) => {
      if (args.path === SITES_INDEX) {
        return { contents: `export * from ${JSON.stringify(SHIM)};`, loader: 'ts' };
      }
      const contents = readFileSync(args.path, 'utf8');
      const code = contents.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
      if (VITE_ONLY.test(code)) {
        throw new Error(`${args.path} uses Vite-only import.meta APIs; give the CLI a seam for it`);
      }
      return { contents, loader: args.path.endsWith('x') ? 'tsx' : 'ts' };
    });
  },
};

export async function buildCli(outdir: string): Promise<string> {
  const version = (
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
  ).version;
  const result = await Bun.build({
    entrypoints: [join(PACKAGE_DIR, 'src/cli.ts')],
    outdir,
    naming: 'cli.mjs',
    target: 'node',
    format: 'esm',
    banner: '#!/usr/bin/env node',
    define: { __VOYAGER_VERSION__: JSON.stringify(version) },
    minify: { whitespace: false, identifiers: false, syntax: true },
    plugins: [voyagerSeams],
  });
  if (!result.success) {
    throw new AggregateError(result.logs, 'create-voyager-plugin build failed');
  }
  return join(outdir, 'cli.mjs');
}

if (import.meta.main) {
  const outdir = resolve(process.argv[2] ?? join(PACKAGE_DIR, 'dist'));
  const file = await buildCli(outdir);
  process.stdout.write(`built ${relative(ROOT, file)}\n`);
}
