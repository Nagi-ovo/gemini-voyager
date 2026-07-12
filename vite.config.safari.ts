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

export const safariManifest = {
  ...baseManifest,
  browser_specific_settings: {
    safari: {
      // Manifest V3 support starts at Safari 15.4. The Vite target controls
      // syntax only, so the compatibility floor must also live in manifest.
      strict_min_version: '15.4',
    },
  },
  // Safari renders toolbar icons as template images (monochrome).
  // Use a transparent-background version so it doesn't appear as a solid square.
  action: {
    ...manifest.action,
    default_icon: {
      '32': 'icon-32-template.png',
    },
  },
  permissions: manifest.permissions.filter((permission) => permission !== 'notifications'),
  optional_permissions: Array.from(
    new Set([
      ...(manifest.optional_permissions ?? []).filter(
        (permission) => permission !== 'notifications',
      ),
      'unlimitedStorage',
    ]),
  ),
  // Safari-specific adjustments
  background: {
    // Safari supports both service_worker and scripts
    // Using scripts for better compatibility
    scripts: ['src/pages/background/index.ts'],
  },
} as unknown as ManifestV3Export;

export default mergeConfig(
  baseConfig,
  defineConfig({
    define: {
      // Inject flag into the build
      'import.meta.env.ENABLE_SAFARI_UPDATE_CHECK': JSON.stringify(
        enableSafariUpdateCheck ? 'true' : 'false',
      ),
      'import.meta.env.VOYAGER_BUILD_TARGET': JSON.stringify('safari'),
    },
    plugins: [
      crx({
        manifest: safariManifest,
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
      // JavaScript syntax floor only. It does not imply Safari 14 can run MV3;
      // runtime quota messaging uses the actual Safari product version.
      target: 'safari14',
    },
  }),
);
