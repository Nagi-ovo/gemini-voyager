import { ManifestV3Export, crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import { defineConfig, mergeConfig } from 'vite';

import baseConfig, { baseBuildOptions, baseManifest } from './vite.config.base';

const outDir = resolve(
  __dirname,
  process.env.VOYAGER_BUILD_TARGET === 'edge' ? 'dist_edge' : 'dist_chrome',
);
const chromeSharedContentScripts = (
  baseManifest as unknown as { content_scripts?: Array<Record<string, unknown>> }
).content_scripts;
const chromeMainWorldObservers = [
  {
    matches: ['https://gemini.google.com/*', 'https://business.gemini.google/*'],
    js: ['public/usage-observer.js'],
    run_at: 'document_start' as const,
    world: 'MAIN' as const,
  },
  {
    matches: ['https://gemini.google.com/*', 'https://business.gemini.google/*'],
    js: ['public/conversation-history-observer.js'],
    run_at: 'document_start' as const,
    world: 'MAIN' as const,
  },
];

export const chromeManifest = {
  ...baseManifest,
  // Browser-managed MAIN-world scripts avoid Gemini's Trusted Types/CSP
  // blocking the old DOM <script src="chrome-extension://..."> bridge. Edge
  // builds reuse this manifest, so keep the observers statically registered.
  content_scripts: [...(chromeSharedContentScripts ?? []), ...chromeMainWorldObservers],
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
