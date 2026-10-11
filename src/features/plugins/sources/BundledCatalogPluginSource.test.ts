import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BUNDLED_SITE_ADAPTERS } from '../catalog/sites';
import { pluginsToOriginPatterns } from '../runtime/siteRegistration';
import { engineSatisfied } from '../semver';
import { usesCatalogDataStores } from '../sites/hostPolicy';
import { patternWithinAny } from '../sites/matchPattern';
import type { PluginManifest } from '../types';
import { EFFECTIVE_PLUGIN_ENGINE_VERSION } from '../verbs/contracts';
import { BundledCatalogPluginSource } from './BundledCatalogPluginSource';

const sitesDir = resolve(process.cwd(), 'src/features/plugins/catalog/sites');
const diskPlugins = readdirSync(sitesDir, { recursive: true, encoding: 'utf8' })
  .map((path) => path.split(sep).join('/'))
  .filter((path) => /^[^/]+\/plugins\/[^/]+\/plugin\.json$/.test(path))
  .sort()
  .map((path) => ({
    path,
    manifest: JSON.parse(readFileSync(resolve(sitesDir, path), 'utf8')) as Omit<
      PluginManifest,
      'contributes'
    > & {
      contributes: { styles?: { file?: string; css?: string }[] };
    },
  }));

describe('BundledCatalogPluginSource', () => {
  it('loads the bundled official declarative plugins with resolved CSS', async () => {
    const manifests = await new BundledCatalogPluginSource().list();

    // Discovery order: site directory, then plugin directory.
    expect(diskPlugins.length).toBeGreaterThan(0);
    expect(manifests.map((plugin) => plugin.id)).toEqual(
      diskPlugins.map(({ manifest }) => manifest.id),
    );
    expect(new Set(manifests.map((plugin) => plugin.id)).size).toBe(diskPlugins.length);

    for (const [index, manifest] of manifests.entries()) {
      expect(engineSatisfied(manifest.engine, EFFECTIVE_PLUGIN_ENGINE_VERSION)).toBe(true);
      const declaredStyles = diskPlugins[index].manifest.contributes.styles ?? [];
      expect(manifest.contributes.styles ?? [], manifest.id).toHaveLength(declaredStyles.length);
      for (const [styleIndex, style] of (manifest.contributes.styles ?? []).entries()) {
        const declared = declaredStyles[styleIndex];
        if (declared.file) {
          const file = declared.file.trim().replace(/^\.\//, '');
          expect(style.source).toBe(file);
          expect(style.css).toBe(
            readFileSync(resolve(sitesDir, dirname(diskPlugins[index].path), file), 'utf8'),
          );
        } else {
          expect(style.css).toBe(declared.css);
        }
        expect(typeof style.css).toBe('string');
        expect('file' in (style as unknown as Record<string, unknown>)).toBe(false);
      }
    }
  });

  it('keeps the bundled CSS source files non-empty', () => {
    for (const { path } of diskPlugins) {
      const pluginDir = dirname(resolve(sitesDir, path));
      for (const file of readdirSync(pluginDir).filter((file) => file.endsWith('.css'))) {
        expect(
          readFileSync(resolve(pluginDir, file), 'utf8').length,
          `${path}: ${file}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps ChatGPT footer structural wrapper full-width', () => {
    const file = '../catalog/sites/chatgpt/plugins/reading-width/style.css';
    const css = readFileSync(new URL(file, import.meta.url), 'utf8');

    expect(css).not.toContain(':not(#thread-bottom-container)');
    expect(css).toMatch(
      /\.gv-plugin-chatgpt-readable \[class\*='--thread-content-max-width'\]\s*\{[\s\S]*max-width:\s*var\(--gv-plugin-reading-width, 768px\)\s*!important;/,
    );
    expect(css).toMatch(
      /#thread-bottom-container\s*\{[\s\S]*width:\s*100%\s*!important;[\s\S]*max-width:\s*none\s*!important;/,
    );
    expect(css).toContain("[data-gv-center-conversation='true']");
    expect(css).toContain("section[data-testid^='conversation-turn-']");
    expect(css).toContain("[data-message-author-role='user']");
    expect(css).toContain('align-items: center !important');
    expect(css).not.toContain('48rem');

    const regularWidthRule = css.indexOf(
      ".gv-plugin-chatgpt-readable [class*='--thread-content-max-width'] {",
    );
    const footerOverride = css.indexOf('.gv-plugin-chatgpt-readable #thread-bottom-container {');
    const centeredTurnRule = css.indexOf(
      ".gv-plugin-chatgpt-readable[data-gv-center-conversation='true']",
    );
    expect(regularWidthRule).toBeGreaterThanOrEqual(0);
    expect(footerOverride).toBeGreaterThan(regularWidthRule);
    expect(centeredTurnRule).toBeGreaterThan(footerOverride);
  });

  it('supports a scoped DeepSeek reading width setting', async () => {
    const manifests = await new BundledCatalogPluginSource().list();
    const deepseekWidth = manifests.find(
      (plugin) => plugin.id === 'voyager.deepseek-reading-width',
    );
    const file = '../catalog/sites/deepseek/plugins/reading-width/style.css';
    const css = readFileSync(new URL(file, import.meta.url), 'utf8');

    expect(deepseekWidth?.matches).toEqual(['https://chat.deepseek.com/*']);
    expect(deepseekWidth?.contributes.settings?.width).toEqual({
      type: 'number',
      label: 'Reading width (px)',
      minLabel: 'Narrower',
      maxLabel: 'Wider',
      default: 712,
      min: 600,
      max: 1600,
    });
    expect(deepseekWidth?.contributes.domOps).toContainEqual({
      op: 'setStyle',
      target: { kind: 'css', selector: 'body' },
      styles: { '--gv-plugin-reading-width': '{{width}}px' },
    });
    expect(css).toContain('.gv-plugin-deepseek-readable');
    expect(css).toContain('var(--gv-plugin-reading-width, 712px)');
    expect(css).toContain('.ds-virtual-list');
  });

  it('widens Claude document artifacts inside their cross-origin frame', async () => {
    const manifests = await new BundledCatalogPluginSource().list();
    const claudeWidth = manifests.find((plugin) => plugin.id === 'voyager.claude-reading-width');
    const file = '../catalog/sites/claude/plugins/reading-width/style.css';
    const css = readFileSync(new URL(file, import.meta.url), 'utf8');

    expect(claudeWidth?.matches).toEqual([
      'https://claude.ai/*',
      'https://*.frame.claudeusercontent.com/*',
    ]);
    expect(css).toMatch(
      /body\.gv-plugin-claude-readable > \.wrap\s*\{[\s\S]*box-sizing:\s*border-box\s*!important;[\s\S]*max-width:\s*var\(--gv-plugin-reading-width, 768px\)\s*!important;/,
    );
  });

  it('offers an opt-in centered conversation mode without narrowing the reading width', async () => {
    const manifests = await new BundledCatalogPluginSource().list();
    const chatgptWidth = manifests.find((plugin) => plugin.id === 'voyager.chatgpt-reading-width');

    expect(chatgptWidth?.contributes.settings?.centerConversation).toEqual({
      type: 'boolean',
      label: 'Center conversation content',
      default: false,
    });
    expect(chatgptWidth?.i18n?.zh?.settings?.centerConversation).toEqual({
      label: '对话内容居中',
    });
    expect(chatgptWidth?.contributes.domOps).toContainEqual({
      op: 'setAttribute',
      target: { kind: 'css', selector: 'body' },
      name: 'data-gv-center-conversation',
      value: '{{centerConversation}}',
    });
  });

  it('keeps localized setting labels inside the plugin data layer', async () => {
    const manifests = await new BundledCatalogPluginSource().list();
    const claudeWidth = manifests.find((plugin) => plugin.id === 'voyager.claude-reading-width');

    expect(claudeWidth?.contributes.settings?.width.label).toBe('Reading width (px)');
    expect(claudeWidth?.i18n?.zh?.settings?.width).toEqual({
      label: '阅读宽度（px）',
      minLabel: '更窄',
      maxLabel: '更宽',
    });
  });

  it('exposes the origins needed by the bundled official plugins', async () => {
    const manifests = await new BundledCatalogPluginSource().list();

    const origins = pluginsToOriginPatterns(manifests);
    expect(origins.length).toBeGreaterThan(0);
    // Bundled plugins never widen host access beyond the plugin platforms Voyager supports;
    // Gemini and AI Studio are injected statically, so their plugins request no origin at all.
    const siteMatches = BUNDLED_SITE_ADAPTERS.filter((site) =>
      usesCatalogDataStores(site.id),
    ).flatMap((site) => site.matches);
    for (const origin of origins) {
      expect(patternWithinAny(origin, siteMatches), origin).toBe(true);
    }
  });
});
