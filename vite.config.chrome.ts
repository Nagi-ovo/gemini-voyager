import { ManifestV3Export, crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import { defineConfig, mergeConfig } from 'vite';

import baseConfig, { baseBuildOptions, baseManifest } from './vite.config.base';

const outDir = resolve(__dirname, 'dist_chrome');

export const chromeManifest = {
  ...baseManifest,
  // declarativeContent is Chrome/Edge-only (absent on Firefox/Safari).
  // Injected here so the shared base manifest stays cross-browser clean.
  permissions: [
    ...((baseManifest as { permissions?: string[] }).permissions ?? []),
    'declarativeContent',
    // unlimitedStorage has no Chrome/Edge permission warning. Keep it required
    // so every install gets predictable local capacity; Voyager's own
    // 25/50/100 MB soft cap still bounds actual usage.
    'unlimitedStorage',
  ],
  // Edge builds reuse this Chrome manifest.
  optional_permissions: (
    (baseManifest as { optional_permissions?: string[] }).optional_permissions ?? []
  ).filter((permission) => permission !== 'unlimitedStorage'),
} as ManifestV3Export;

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: chromeManifest,
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
  }),
);
