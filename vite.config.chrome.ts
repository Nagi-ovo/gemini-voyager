import { resolve } from 'path';

import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import { mergeConfig, defineConfig } from 'vite';

import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base';

const outDir = resolve(__dirname, 'dist_chrome');

export default mergeConfig(
  baseConfig,
  defineConfig({
    define: {
      __BROWSER_TARGET__: JSON.stringify('chrome'),
    },
    plugins: [
      crx({
        manifest: {
          ...baseManifest,
        } as ManifestV3Export,
        browser: 'chrome',
        contentScripts: {
          injectCss: true,
        },
      }),
    ],
    build: {
      ...baseBuildOptions,
      outDir,
    },
  })
);
