import { ManifestV3Export, crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import { defineConfig, mergeConfig } from 'vite';

import baseConfig, { baseBuildOptions, baseManifest } from './vite.config.base';

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
              id: 'gemini-voyager@nagi-ovo',
              strict_min_version: '115.0',
              data_collection_permissions: {
                required: ['none'],
              },
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
    resolve: {
      alias: {
        // Firefox uses mermaid v9.2.2 (max compatible version)
        // Chrome/Safari use mermaid v11.x (latest) by default
        mermaid: 'mermaid-legacy',
      },
    },
    build: {
      ...baseBuildOptions,
      outDir,
    },
    publicDir: resolve(__dirname, 'public'),
  }),
);
