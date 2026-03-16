import { ManifestV3Export, crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import { defineConfig, mergeConfig } from 'vite';

import manifest from './manifest.json';
import baseConfig, { baseBuildOptions, baseManifest } from './vite.config.base';

const outDir = resolve(__dirname, 'dist_safari');

// Environment variable to control Safari update check
// Set to 'true' to enable update reminders for Safari builds
// Default: 'false' (disabled)
const enableSafariUpdateCheck = process.env.ENABLE_SAFARI_UPDATE_CHECK === 'true';

export default mergeConfig(
  baseConfig,
  defineConfig({
    define: {
      // Inject flag into the build
      'import.meta.env.ENABLE_SAFARI_UPDATE_CHECK': JSON.stringify(enableSafariUpdateCheck),
    },
    plugins: [
      crx({
        manifest: {
          ...baseManifest,
          // Safari renders toolbar icons as template images (monochrome).
          // Use a transparent-background version so it doesn't appear as a solid square.
          action: {
            ...manifest.action,
            default_icon: {
              '32': 'icon-32-template.png',
            },
          },
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
