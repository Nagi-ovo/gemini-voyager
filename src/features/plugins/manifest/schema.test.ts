/**
 * The published JSON Schemas (`docs/public/plugin.schema.json`,
 * `docs/public/site.schema.json`) are hand-written editor tooling; the runtime
 * validators are the authority. That split only helps authors while the two
 * agree, so this pins them together:
 *
 *   - every bundled `plugin.json` / `site.json` satisfies BOTH the schema and
 *     its validator;
 *   - every key a validator emits is described by the schema (checked in a
 *     strict mode that rejects any property the schema does not name), against
 *     the shipped DeepSeek formula-copy manifest and a hand-built manifest that
 *     exercises every documented field;
 *   - the enums and bounds a schema copies out of the source — the semantic
 *     vocabulary, the primitive name pattern, the manifest format, the DOM-op
 *     and stylesheet ceilings — still match their constants.
 *
 * For local plugins the check runs both ways against `validateLocalManifest`:
 * every example the authoring material teaches satisfies the schema, and each
 * rule the schema tightened (gv- classes, the attribute allowlist, the
 * semantic and primitive vocabularies, select options) is refused by the
 * import gate as well, so the schema never flags what the popup would import.
 *
 * The structural checker below is deliberately tiny and local: the repository
 * ships no JSON Schema validator (D17: no schema library), and adding ajv to
 * assert this would be a runtime dependency bought for one test file. It covers
 * exactly the keywords these schemas use: $ref (within a file, or to a file
 * beside it: the site schema keeps its large sections in `site-sections/`),
 * type, const, enum, pattern, minLength/maxLength, minimum/maximum,
 * minItems/maxItems, items, properties, additionalProperties, required,
 * propertyNames, if/then/else, anyOf/oneOf, and `format: "regex"` (the one
 * format they assert). Annotations such as description, default and examples
 * carry no constraint. It lives in `__tests__/jsonSchemaCheck.ts`; the site
 * schema's own cases are in `schema.site.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAX_DOM_OPS, MAX_STYLE_LENGTH, PLUGIN_MANIFEST_FORMAT } from '../constants';
import { buildPluginContract } from '../local/authoring/pluginContract';
import { buildPluginExample } from '../local/authoring/pluginExamples';
import { validateLocalManifest } from '../local/validateLocalManifest';
import { DEFAULT_ADAPTERS } from '../sites/registry';
import { SEMANTIC_SELECTOR_KEYS } from '../sites/semanticKeys';
import { resolveStyleFileContributions } from '../sources/styleFiles';
import { PRIMITIVE_CONTRACTS, PRIMITIVE_NAME_PATTERN } from '../verbs/contracts';
import {
  type JsonSchema,
  catalogSites,
  check,
  listDirs,
  pluginSchema,
  readJson,
  repoRoot,
  serialized,
  siteSchema,
} from './__tests__/jsonSchemaCheck';
import { ALLOWED_ATTRIBUTE_NAMES, attributeNameIssue } from './sinkGuards';
import { validateManifest } from './validate';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface BundledPlugin {
  readonly label: string;
  readonly dir: string;
  readonly raw: Record<string, unknown>;
}

function listBundledPlugins(): readonly BundledPlugin[] {
  const plugins: BundledPlugin[] = [];
  for (const site of listDirs(catalogSites)) {
    for (const plugin of listDirs(join(catalogSites, site, 'plugins'))) {
      const dir = join(catalogSites, site, 'plugins', plugin);
      plugins.push({
        label: relative(repoRoot, dir),
        dir,
        raw: readJson(join(dir, 'plugin.json')) as Record<string, unknown>,
      });
    }
  }
  return plugins;
}

async function inlineStyles(plugin: BundledPlugin): Promise<unknown> {
  return resolveStyleFileContributions(plugin.raw, plugin.label, async (file) =>
    readFileSync(join(plugin.dir, file), 'utf8'),
  );
}

/**
 * Every field a manifest may carry, so the "schema describes what the validator
 * emits" check has something to bite on. `formulaCopy` is a real primitive; the
 * manifest validator does not resolve handlers, so any name would do, but using
 * a real one keeps the fixture honest.
 */
const EVERY_FIELD_MANIFEST: Record<string, unknown> = {
  $schema: 'https://voyager.nagi.fun/plugin.schema.json',
  id: 'fixture.every-field',
  name: 'Fixture · Every Field',
  version: '2.0.1',
  description: 'A manifest that uses every documented field.',
  author: 'voyager-official',
  category: 'productivity',
  license: 'MIT',
  homepage: 'https://example.invalid/fixture',
  engine: '>=1.3.0',
  tier: 'declarative',
  format: 1,
  changelog: 'Uses every field at once.',
  matches: ['https://demo.example/*'],
  theme: { brand: '#d97757' },
  requires: { handlers: ['formulaCopy'], semantic: ['composer'] },
  contributes: {
    styles: [{ css: 'body { color: red; }', source: 'style.css' }],
    settings: {
      width: {
        type: 'number',
        label: 'Reading width (px)',
        default: 768,
        min: 600,
        max: 1600,
        minLabel: 'Narrower',
        maxLabel: 'Wider',
      },
      centered: { type: 'boolean', label: 'Center content', default: false },
      title: { type: 'string', label: 'Title', default: 'Hello' },
      accent: { type: 'color', label: 'Accent', default: '#00ff00' },
      density: {
        type: 'select',
        label: 'Density',
        default: 'cozy',
        options: [
          { value: 'cozy', label: 'Cozy' },
          { value: 'compact', label: 'Compact' },
        ],
      },
    },
    domOps: [
      { op: 'addClass', target: 'body', className: 'gv-plugin-fixture' },
      {
        op: 'setAttribute',
        target: { kind: 'css', selector: 'body' },
        name: 'data-gv-fixture',
        value: 'on',
      },
      {
        op: 'setStyle',
        target: { kind: 'semantic', key: 'composer' },
        styles: { '--gv-plugin-reading-width': '768px' },
      },
      { op: 'hide', target: { kind: 'semantic', key: 'sidebar' } },
      {
        op: 'native',
        handler: 'formulaCopy',
        params: { scope: 'assistant', nested: { on: true } },
      },
    ],
  },
  i18n: {
    zh: {
      name: '固件 · 全字段',
      description: '一个用到全部字段的清单。',
      changelog: '一次用到全部字段。',
      settings: {
        width: { label: '阅读宽度', minLabel: '更窄', maxLabel: '更宽' },
        density: { label: '密度', options: { cozy: '舒适', compact: '紧凑' } },
      },
    },
  },
};

// ---------------------------------------------------------------------------

describe('published JSON Schemas', () => {
  it('are draft 2020-12 documents published at their documented URLs', () => {
    expect(pluginSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(pluginSchema.$id).toBe('https://voyager.nagi.fun/plugin.schema.json');
    expect(siteSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(siteSchema.$id).toBe('https://voyager.nagi.fun/site.schema.json');
  });

  it('copy the semantic vocabulary, primitive pattern and bounds from the source', () => {
    const selectors = (siteSchema.properties as Record<string, JsonSchema>).selectors;
    const propertyNames = selectors.propertyNames as { enum: string[] };
    expect([...propertyNames.enum].sort()).toEqual([...SEMANTIC_SELECTOR_KEYS].sort());

    const defs = pluginSchema.$defs as Record<string, JsonSchema>;
    const nativeOp = (defs.domOperation.oneOf as JsonSchema[]).find(
      (branch) => branch.title === 'native',
    );
    if (!nativeOp) throw new Error('plugin.schema.json lost its native DOM-op branch');
    const handler = (nativeOp.properties as Record<string, JsonSchema>).handler;
    expect(handler.pattern).toBe(PRIMITIVE_NAME_PATTERN.source);

    // A primitive or semantic key added in code must reach the schema's enums
    // too, or editors flag a plugin the gates accept. The primitive enums are
    // generated (sorted, like PRIMITIVE_CONTRACTS) by the CLI build.
    const primitiveNames = PRIMITIVE_CONTRACTS.map((contract) => contract.name);
    const requires = (pluginSchema.properties as Record<string, JsonSchema>).requires
      .properties as Record<string, JsonSchema>;
    const stale = 'plugin.schema.json primitive enums are stale: run `bun run skills:build`';
    expect(handler.enum, stale).toEqual(primitiveNames);
    expect((requires.handlers.items as JsonSchema).enum, stale).toEqual(primitiveNames);
    const semanticRef = (defs.selectorRef.anyOf as JsonSchema[])[2];
    expect((semanticRef.properties as Record<string, JsonSchema>).key.enum).toEqual([
      ...SEMANTIC_SELECTOR_KEYS,
    ]);
    expect((requires.semantic.items as JsonSchema).enum).toEqual([...SEMANTIC_SELECTOR_KEYS]);

    const properties = pluginSchema.properties as Record<string, JsonSchema>;
    expect(properties.format.const).toBe(PLUGIN_MANIFEST_FORMAT);
    const contributes = defs.contributions.properties as Record<string, JsonSchema>;
    expect(contributes.domOps.maxItems).toBe(MAX_DOM_OPS);
    const inlineCss = (defs.styleContribution.anyOf as JsonSchema[])[1];
    expect((inlineCss.properties as Record<string, JsonSchema>).css.maxLength).toBe(
      MAX_STYLE_LENGTH,
    );
  });
});

describe('plugin.schema.json', () => {
  const bundled = listBundledPlugins();

  it('finds the bundled plugins', () => {
    expect(bundled.length).toBeGreaterThan(0);
  });

  it.each(bundled.map((plugin) => [plugin.label, plugin] as const))(
    'accepts %s, and so does validateManifest',
    async (_label, plugin) => {
      expect(check(plugin.raw, pluginSchema)).toEqual([]);
      const result = validateManifest(await inlineStyles(plugin));
      expect(result.success ? [] : result.error).toEqual([]);
    },
  );

  it('describes every key validateManifest emits for the DeepSeek formula-copy plugin', async () => {
    const plugin = bundled.find((entry) => entry.label.includes('deepseek/plugins/formula-copy'));
    if (!plugin) throw new Error('the DeepSeek formula-copy plugin is missing from the catalog');

    const result = validateManifest(await inlineStyles(plugin));
    expect(result.success).toBe(true);
    if (!result.success) return;
    // It is the only bundled plugin carrying `requires`, `changelog` and a
    // `native` op, so it is the one that exercises those schema branches.
    expect(result.data.requires).toEqual({ handlers: ['formulaCopy'] });
    expect(check(serialized(result.data), pluginSchema, { strictProperties: true })).toEqual([]);
  });

  it('describes every key of a manifest that uses every field', () => {
    expect(check(EVERY_FIELD_MANIFEST, pluginSchema)).toEqual([]);

    const result = validateManifest(EVERY_FIELD_MANIFEST);
    expect(result.success ? [] : result.error).toEqual([]);
    if (!result.success) return;
    expect(check(serialized(result.data), pluginSchema, { strictProperties: true })).toEqual([]);
  });

  it('notices an undescribed key in strict mode, and ignores it otherwise', () => {
    // Guards the two checks above: without this, "the schema describes every
    // emitted key" would still pass if strict mode quietly did nothing.
    const extra = { ...EVERY_FIELD_MANIFEST, sideEffects: ['none'] };
    expect(check(extra, pluginSchema)).toEqual([]);
    expect(check(extra, pluginSchema, { strictProperties: true })).toEqual([
      '$.sideEffects: not described by the schema',
    ]);
    // The validator ignores it too — the schema is not stricter than the code.
    expect(validateManifest(extra).success).toBe(true);
  });

  it('rejects manifests the validator also rejects', () => {
    const base = EVERY_FIELD_MANIFEST;
    const without = (key: string): unknown => {
      const copy = { ...base } as Record<string, unknown>;
      delete copy[key];
      return copy;
    };

    expect(check(without('id'), pluginSchema)).toContain('$: missing required "id"');
    expect(check(without('contributes'), pluginSchema)).toContain(
      '$: missing required "contributes"',
    );
    expect(check({ ...base, tier: 'native' }, pluginSchema).join('\n')).toMatch(/\$\.tier/);
    expect(check({ ...base, format: 2 }, pluginSchema).join('\n')).toMatch(/\$\.format/);
    expect(check({ ...base, theme: { brand: 'red' } }, pluginSchema).join('\n')).toMatch(
      /\$\.theme\.brand/,
    );
    expect(check({ ...base, matches: [] }, pluginSchema).join('\n')).toMatch(/\$\.matches/);

    // Same shapes, through the validator: the schema is not stricter than it.
    for (const broken of [
      without('id'),
      without('contributes'),
      { ...base, tier: 'native' },
      { ...base, format: 2 },
      { ...base, theme: { brand: 'red' } },
      { ...base, matches: [] },
    ]) {
      expect(validateManifest(broken).success).toBe(false);
    }
  });

  it('rejects a DOM operation whose op is not a known variant', () => {
    const manifest = {
      ...EVERY_FIELD_MANIFEST,
      contributes: { domOps: [{ op: 'eval', target: 'body', code: 'alert(1)' }] },
    };
    expect(check(manifest, pluginSchema).join('\n')).toMatch(/domOps\[0\].*oneOf/s);
    expect(validateManifest(manifest).success).toBe(false);
  });
});

describe('plugin.schema.json and the local plugin gate', () => {
  const chatgpt = DEFAULT_ADAPTERS.find((site) => site.id === 'chatgpt')!;
  const composer = { kind: 'semantic', key: 'composer' };
  const withOps = (domOps: unknown[], extra: Record<string, unknown> = {}) => {
    const manifest = buildPluginExample(chatgpt);
    return { ...manifest, ...extra, contributes: { ...(manifest.contributes as object), domOps } };
  };
  const withSetting = (field: Record<string, unknown>) => {
    const manifest = buildPluginExample(chatgpt);
    const contributes = { ...(manifest.contributes as object), settings: { size: field } };
    return { ...manifest, contributes };
  };

  it('accepts every example the authoring material teaches, on every site', () => {
    for (const site of DEFAULT_ADAPTERS) {
      for (const audience of ['chat', 'agent'] as const) {
        for (const example of buildPluginContract(site, { audience }).examples) {
          expect(check(example.manifest, pluginSchema)).toEqual([]);
        }
      }
    }
  });

  it('allows exactly the attribute names the sink guard allows', () => {
    const defs = pluginSchema.$defs as Record<string, JsonSchema>;
    const setAttribute = (defs.domOperation.oneOf as JsonSchema[]).find(
      (branch) => branch.title === 'setAttribute',
    )!;
    const pattern = new RegExp(
      (setAttribute.properties as Record<string, JsonSchema>).name.pattern as string,
    );
    const allowed = ['data-gv-x', 'data-1', 'aria-label'];
    const refused = ['href', 'src', 'onclick', 'class', 'id', 'DATA-X', 'data-', 'data-X'];
    const edges = ['aria-', 'aria-x1', 'xlink:href', 'style2', ' title'];
    const names = [...ALLOWED_ATTRIBUTE_NAMES, ...allowed, ...refused, ...edges];
    for (const name of names) {
      expect(pattern.test(name), name).toBe(attributeNameIssue(name) === null);
    }
  });

  it.each([
    [
      'a class without the gv- prefix',
      withOps([{ op: 'addClass', target: composer, className: 'big' }]),
    ],
    [
      'two classes in one addClass',
      withOps([{ op: 'addClass', target: composer, className: 'gv-a gv-b' }]),
    ],
    [
      'an href attribute',
      withOps([{ op: 'setAttribute', target: composer, name: 'href', value: '#x' }]),
    ],
    [
      'a class attribute',
      withOps([{ op: 'setAttribute', target: composer, name: 'class', value: 'x' }]),
    ],
    [
      'an unknown semantic key',
      withOps([{ op: 'hide', target: { kind: 'semantic', key: 'footer' } }]),
    ],
    [
      'an unknown primitive',
      withOps([{ op: 'native', handler: 'confetti', params: {} }], { engine: '>=1.7.0' }),
    ],
    ['an unknown required primitive', withOps([], { requires: { handlers: ['confetti'] } })],
    ['an unknown required semantic key', withOps([], { requires: { semantic: ['footer'] } })],
    ['a select without options', withSetting({ type: 'select', label: 'Size', default: 's' })],
    [
      'a select with no options',
      withSetting({ type: 'select', label: 'Size', default: 's', options: [] }),
    ],
    [
      'a select with a number default',
      withSetting({
        type: 'select',
        label: 'Size',
        default: 1,
        options: [{ value: '1', label: 'One' }],
      }),
    ],
  ])('flags %s, which the import also refuses', (_label, manifest) => {
    expect(check(manifest, pluginSchema)).not.toEqual([]);
    const result = validateLocalManifest(manifest);
    expect(result.success).toBe(false);
  });
});
