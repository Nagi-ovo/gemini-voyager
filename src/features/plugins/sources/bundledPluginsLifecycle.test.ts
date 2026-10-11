import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DeclarativeEngine } from '../runtime/declarativeEngine';
import { matchesAnyPattern } from '../sites/matchPattern';
import { DEFAULT_ADAPTERS } from '../sites/registry';
import type { PluginManifest, PluginSettingValue, SiteAdapter } from '../types';
import { BundledCatalogPluginSource } from './BundledCatalogPluginSource';

/**
 * Plan §8 / P2 acceptance: every bundled declarative plugin must mount, accept
 * a settings change and unmount without leaving a trace on the host document.
 * The checks are generic on purpose so a new plugin is covered the moment its
 * files land under `catalog/sites/<site>/plugins/<id>/`.
 */

function probeUrl(pattern: string): string {
  return pattern.replace(/^(\w+):\/\/\*\./, '$1://x.').replace(/\*$/, '');
}

function adapterFor(manifest: PluginManifest): SiteAdapter {
  const adapter = DEFAULT_ADAPTERS.find((candidate) =>
    manifest.matches.some((pattern) => matchesAnyPattern(probeUrl(pattern), candidate.matches)),
  );
  if (!adapter) throw new Error(`${manifest.id}: no bundled site adapter covers its matches`);
  return adapter;
}

function defaultSettings(manifest: PluginManifest): Record<string, PluginSettingValue> {
  return Object.fromEntries(
    Object.entries(manifest.contributes.settings ?? {}).map(([key, field]) => [key, field.default]),
  );
}

/** A value different from the default for every declared setting. */
function changedSettings(manifest: PluginManifest): Record<string, PluginSettingValue> {
  return Object.fromEntries(
    Object.entries(manifest.contributes.settings ?? {}).map(([key, field]) => {
      if (field.type === 'boolean') return [key, field.default !== true];
      if (field.type === 'number') {
        const current = Number(field.default);
        const next =
          current === field.min ? (field.max ?? current + 1) : (field.min ?? current - 1);
        return [key, next];
      }
      return [key, `${String(field.default)}-changed`];
    }),
  );
}

/** Head markup minus the engine's one-time base stylesheet, which persists by design. */
function headWithoutBaseStyle(): string {
  const clone = document.head.cloneNode(true) as HTMLElement;
  clone.querySelector('#gv-plugin-base-style')?.remove();
  return clone.innerHTML;
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  document.body.removeAttribute('class');
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('class');
});

describe('bundled plugin lifecycle (parametric)', async () => {
  const manifests = await new BundledCatalogPluginSource().list();
  const sitesDir = resolve(process.cwd(), 'src/features/plugins/catalog/sites');
  // Generate cases from disk: a skipped invalid plugin must still get a failing lifecycle test.
  const diskPlugins = readdirSync(sitesDir, { recursive: true, encoding: 'utf8' })
    .map((path) => path.split(sep).join('/'))
    .filter((path) => /^[^/]+\/plugins\/[^/]+\/plugin\.json$/.test(path))
    .sort()
    .map((path) => ({
      path,
      id: (JSON.parse(readFileSync(resolve(sitesDir, path), 'utf8')) as { id: string }).id,
    }));
  expect(diskPlugins.length).toBeGreaterThan(0);

  for (const { path, id } of diskPlugins) {
    function loadedManifest(): PluginManifest {
      const matches = manifests.filter((manifest) => manifest.id === id);
      expect(matches, `${path}: expected exactly one loaded plugin`).toHaveLength(1);
      return matches[0];
    }

    it(`${id}: mount → updateSettings → unmount restores the host`, () => {
      const manifest = loadedManifest();
      document.body.className = 'host-class';
      document.body.setAttribute('style', '--host-var: 1px;');
      // Semantic answer operations need real target markup, not an empty body;
      // the DeepSeek code block is long enough for code folding to collapse it.
      document.body.innerHTML =
        '<div class="ds-message"><div class="ds-assistant-message-main-content"><pre><code>sample</code></pre>' +
        '<div class="md-code-block"><div class="md-code-block-banner"><div><div role="button">Copy</div></div></div>' +
        `<pre>${'line\n'.repeat(40)}</pre></div></div></div>`;
      const before = {
        head: headWithoutBaseStyle(),
        body: document.body.outerHTML,
        root: document.documentElement.getAttribute('class'),
      };
      const engine = new DeclarativeEngine({ doc: document, adapter: adapterFor(manifest) });

      engine.mount(manifest, defaultSettings(manifest));
      expect(engine.isActive(manifest.id)).toBe(true);
      const styles = manifest.contributes.styles ?? [];
      const styleEl = document.getElementById(`gv-plugin-style-${manifest.id}`);
      if (styles.length > 0) {
        expect(styleEl).not.toBeNull();
        expect(styleEl?.textContent?.length ?? 0).toBeGreaterThan(0);
      }
      // Only ops that address page elements change the host markup; a
      // primitive-only plugin (`native` op) runs code instead.
      if (manifest.contributes.domOps?.some((op) => op.op !== 'native')) {
        expect(document.body.outerHTML).not.toBe(before.body);
      }

      engine.updateSettings(manifest.id, changedSettings(manifest));
      expect(engine.isActive(manifest.id)).toBe(true);

      engine.unmount(manifest.id);
      expect(engine.isActive(manifest.id)).toBe(false);
      expect(headWithoutBaseStyle()).toBe(before.head);
      expect(document.body.outerHTML).toBe(before.body);
      expect(document.documentElement.getAttribute('class')).toBe(before.root);
    });

    it(`${id}: every semantic target resolves on its site adapter`, () => {
      const manifest = loadedManifest();
      const adapter = adapterFor(manifest);
      for (const op of manifest.contributes.domOps ?? []) {
        if (op.op === 'native') continue;
        if (op.target.kind === 'semantic') {
          expect(adapter.selectors[op.target.key], `${manifest.id}: ${op.target.key}`).toBeTruthy();
        }
      }
    });
  }
});
