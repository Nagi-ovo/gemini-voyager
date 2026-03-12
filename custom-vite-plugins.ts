import fs from 'fs';
import { resolve } from 'path';
import type { NormalizedInputOptions, NormalizedOutputOptions } from 'rollup';
import type { PluginOption } from 'vite';

const FIREFOX_OUT_DIR_MARKER = 'dist_firefox';
const CHANGELOG_PROMO_BANNERS = [
  'changelog-promo-banner.png',
  'changelog-promo-banner-cn.png',
  'changelog-promo-banner-jp.png',
];

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
      const isFirefoxBuild = outDir.includes(FIREFOX_OUT_DIR_MARKER);

      fs.rm(resolve(outDir, 'dev-icon-32.png'), () =>
        console.log(`Deleted dev-icon-32.png from prod build`),
      );
      fs.rm(resolve(outDir, 'dev-icon-128.png'), () =>
        console.log(`Deleted dev-icon-128.png from prod build`),
      );

      if (!isFirefoxBuild) {
        CHANGELOG_PROMO_BANNERS.forEach((fileName) => {
          fs.rm(resolve(outDir, fileName), () =>
            console.log(`Deleted ${fileName} from non-Firefox build`),
          );
        });
      }

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

type LocaleMessages = Record<string, { message: string; description?: string }>;

function stripDescriptions(raw: LocaleMessages): LocaleMessages {
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { message: v.message }]));
}

// plugin to strip `description` fields from locale JSON at build time.
// Runs before vite:json so we return stripped JSON; vite:json then converts it to ESM normally.
export function stripI18nDescriptions(isDev: boolean): PluginOption {
  if (isDev) return null;

  return {
    name: 'strip-i18n-descriptions',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/locales/') || !id.endsWith('messages.json')) return null;
      const raw: LocaleMessages = JSON.parse(code);
      return { code: JSON.stringify(stripDescriptions(raw)), map: null };
    },
  };
}

// plugin to support i18n
export function crxI18n(options: {
  localize: boolean;
  src: string;
  stripDescriptions?: boolean;
}): PluginOption {
  if (!options.localize) return null;

  const getJsonFiles = (dir: string): Array<string> => {
    const files = fs.readdirSync(dir, { recursive: true }) as string[];
    return files.filter((file) => !!file && file.endsWith('.json'));
  };
  const entry = resolve(__dirname, options.src);
  const localeFiles = getJsonFiles(entry);
  const files = localeFiles.map((file) => {
    const raw: LocaleMessages = JSON.parse(fs.readFileSync(resolve(entry, file), 'utf-8'));
    const source = options.stripDescriptions
      ? JSON.stringify(stripDescriptions(raw))
      : JSON.stringify(raw);
    return { id: '', fileName: file, source };
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
