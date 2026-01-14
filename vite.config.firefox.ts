import { resolve } from 'path';

import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import { mergeConfig, defineConfig } from 'vite';

import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base';

const outDir = resolve(__dirname, 'dist_firefox');

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: {
          ...baseManifest,
          browser_specific_settings: {
            gecko: {
              id: 'gemini-voyager@github.com',
              strict_min_version: '115.0',
            },
          },
          background: {
            scripts: ['src/pages/background/index.ts'],
            type: 'module',
          },
        } as unknown as ManifestV3Export,
        browser: 'firefox',
        contentScripts: {
          injectCss: true,
        },
      }),
    ],
    build: {
      ...baseBuildOptions,
      outDir,
    },
    publicDir: resolve(__dirname, 'public'),
  })
);
