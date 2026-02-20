import fs from 'fs';
import { resolve } from 'path';
import type { NormalizedInputOptions, NormalizedOutputOptions } from 'rollup';
import type { PluginOption } from 'vite';

// plugin to remove dev icons from prod build
export function stripDevIcons(isDev: boolean) {
  if (isDev) return null;

  return {
    name: 'strip-dev-icons',
    resolveId(source: string) {
      return source === 'virtual-module' ? source : null;
    },
    renderStart(outputOptions: NormalizedOutputOptions, _inputOptions: NormalizedInputOptions) {
      const outDir = outputOptions.dir ?? '';
      fs.rm(resolve(outDir, 'dev-icon-32.png'), () =>
        console.log(`Deleted dev-icon-32.png from prod build`),
      );
      fs.rm(resolve(outDir, 'dev-icon-128.png'), () =>
        console.log(`Deleted dev-icon-128.png from prod build`),
      );
      // Remove assets directory if it exists
      const assetsDir = resolve(outDir, 'assets');
      fs.rm(assetsDir, { recursive: true, force: true }, () =>
        console.log(`Deleted assets/ directory from prod build`),
      );
    },
    writeBundle(outputOptions: NormalizedOutputOptions) {
      const outDir = outputOptions.dir ?? '';
      // Remove .vite directory (Vite's internal manifest, not needed for extension)
      const viteDir = resolve(outDir, '.vite');
      fs.rm(viteDir, { recursive: true, force: true }, () =>
        console.log(`Deleted .vite/ directory from prod build`),
      );
    },
  };
}

// plugin to support i18n
export function crxI18n(options: { localize: boolean; src: string }): PluginOption {
  if (!options.localize) return null;

  const getJsonFiles = (dir: string): Array<string> => {
    const files = fs.readdirSync(dir, { recursive: true }) as string[];
    return files.filter((file) => !!file && file.endsWith('.json'));
  };
  const entry = resolve(__dirname, options.src);
  const localeFiles = getJsonFiles(entry);
  const files = localeFiles.map((file) => {
    return {
      id: '',
      fileName: file,
      source: fs.readFileSync(resolve(entry, file)),
    };
  });
  return {
    name: 'crx-i18n',
    enforce: 'pre',
    buildStart: {
      order: 'post',
      handler() {
        files.forEach((file) => {
          const refId = this.emitFile({
            type: 'asset',
            source: file.source,
            fileName: '_locales/' + file.fileName,
          });
          file.id = refId;
        });
      },
    },
  };
}
