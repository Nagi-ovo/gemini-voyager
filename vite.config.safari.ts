import { ManifestV3Export, crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import { defineConfig, mergeConfig } from 'vite';

import baseConfig, { baseBuildOptions, baseManifest } from './vite.config.base';

const outDir = resolve(__dirname, 'dist_safari');

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: {
          ...baseManifest,
          // Safari-specific adjustments
          background: {
            // Safari supports both service_worker and scripts
            // Using scripts for better compatibility
            scripts: ['src/pages/background/index.ts'],
          },
        } as ManifestV3Export,
        browser: 'chrome', // Use 'chrome' mode as Safari uses WebKit
        contentScripts: {
          injectCss: true,
        },
      }),
    ],
    build: {
      ...baseBuildOptions,
      outDir,
      // Safari-specific build optimizations
      target: 'safari14', // Safari 14+ for better extension support
    },
  }),
);
