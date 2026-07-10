import { ManifestV3Export, crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import { defineConfig, mergeConfig } from 'vite';

import baseConfig, { baseBuildOptions, baseManifest } from './vite.config.base';

const outDir = resolve(__dirname, 'dist_firefox');
const FIREFOX_CHANGELOG_BANNER_RESOURCES = [
  'changelog-promo-banner.png',
  'changelog-promo-banner-cn.png',
  'changelog-promo-banner-jp.png',
];
const FIREFOX_SAKURA_RENDERER_RESOURCE = 'src/pages/sakuraRenderer/index.html';
const FIREFOX_CONTENT_MATCHES = [
  'https://gemini.google.com/*',
  'https://business.gemini.google/*',
  'https://aistudio.google.com/*',
  'https://aistudio.google.cn/*',
];

type WebAccessibleResourceLike = {
  resources?: string[];
};

type FirefoxManifestLike<TResource extends WebAccessibleResourceLike = WebAccessibleResourceLike> =
  {
    web_accessible_resources?: TResource[];
  };

function appendFirefoxChangelogResources<
  TManifest extends FirefoxManifestLike<TResource>,
  TResource extends WebAccessibleResourceLike,
>(manifest: TManifest): TManifest {
  const existingEntries = manifest.web_accessible_resources ?? [];
  if (existingEntries.length === 0) return manifest;

  const [first, ...rest] = existingEntries;
  const existingResources = first.resources ?? [];
  const mergedResources = Array.from(
    new Set([...existingResources, ...FIREFOX_CHANGELOG_BANNER_RESOURCES]),
  );

  return {
    ...manifest,
    web_accessible_resources: [
      {
        resources: [FIREFOX_SAKURA_RENDERER_RESOURCE],
        matches: FIREFOX_CONTENT_MATCHES,
      } as unknown as TResource,
      {
        ...first,
        resources: mergedResources,
      },
      ...rest,
    ],
  } as TManifest;
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    define: {
      'import.meta.env.VOYAGER_BUILD_TARGET': JSON.stringify('firefox'),
    },
    plugins: [
      crx({
        manifest: appendFirefoxChangelogResources({
          ...baseManifest,
          browser_specific_settings: {
            gecko: {
              id: 'gemini-voyager@nagi-ovo',
              // Keep the min version low so existing users aren't dropped. The MV3
              // optional_host_permissions key is only honored from Firefox 128
              // (Bugzilla 1766026); on older Firefox the plugin / custom-website
              // host-grant flow is feature-gated off with an explanation rather
              // than left to silently fail (see supportsOptionalHostPermissions()).
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
        } as unknown as FirefoxManifestLike) as unknown as ManifestV3Export,
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
      rollupOptions: {
        input: {
          sakuraRenderer: resolve(__dirname, 'src/pages/sakuraRenderer/index.html'),
        },
      },
    },
    publicDir: resolve(__dirname, 'public'),
  }),
);
