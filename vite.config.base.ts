import { ManifestV3Export } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { BuildOptions, defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { crxI18n, stripDevIcons } from './custom-vite-plugins';
import devManifest from './manifest.dev.json';
import manifest from './manifest.json';
import pkg from './package.json';

const isDev = process.env.__DEV__ === 'true';
// set this flag to true, if you want localization support
const localize = true;

export const baseManifest = {
  ...manifest,
  version: pkg.version,
  ...(isDev ? devManifest : ({} as ManifestV3Export)),
  ...(localize
    ? {
        name: '__MSG_extName__',
        description: '__MSG_extDescription__',
        default_locale: 'en',
      }
    : {}),
} as ManifestV3Export;

export const baseBuildOptions: BuildOptions = {
  sourcemap: isDev,
  emptyOutDir: !isDev,
  // Content scripts run under page CSP context for DOM-injected preload links.
  // Disable Vite modulepreload hints to avoid generating "/assets/*" requests
  // on the host page origin (e.g. aistudio.google.com), which are blocked by CSP.
  modulePreload: false,
};

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    react(),
    stripDevIcons(isDev),
    crxI18n({ localize, src: './src/locales' }),
  ],
  publicDir: resolve(__dirname, 'public'),
  esbuild: {
    pure: isDev ? [] : ['console.log', 'console.debug'],
  },
});
