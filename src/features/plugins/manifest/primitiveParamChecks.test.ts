import { describe, expect, it, vi } from 'vitest';

import { requireBundledSiteAdapter } from '../catalog/sites';
import copyThinking from '../catalog/sites/deepseek/plugins/copy-thinking/plugin.json';
import { resolveManifestEngine } from '../engineVersion';
import { findIncompatibility } from '../runtime/pluginStatus';
import type { PluginManifest, SettingsSchema, SiteAdapter } from '../types';
import { primitiveParamIssues } from './primitiveChecks';
import { validateManifest } from './validate';

vi.mock('../verbs/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../verbs/contracts')>();
  return {
    ...actual,
    getPrimitiveContract: (name: string) =>
      name === 'fixture'
        ? {
            name,
            sinceEngine: '1.4.0',
            semantic: [],
            description: 'Fixture with a required param and semantic key params',
            params: {
              title: { type: 'string', required: true, description: '' },
              target: {
                type: 'semanticKey',
                required: false,
                allowedKeys: ['userTurn', 'assistantTurn'],
                description: '',
              },
              anchor: { type: 'semanticKey', required: false, description: '' },
            },
          }
        : actual.getPrimitiveContract(name),
  };
});

const SETTINGS: SettingsSchema = {
  label: { type: 'string', label: 'Label', default: 'Hi' },
  turn: {
    type: 'select',
    label: 'Turn',
    default: 'userTurn',
    options: [
      { value: 'userTurn', label: 'User' },
      { value: 'assistantTurn', label: 'Assistant' },
    ],
  },
  anyTurn: {
    type: 'select',
    label: 'Any turn',
    default: 'userTurn',
    options: [
      { value: 'userTurn', label: 'User' },
      { value: 'codeBlock', label: 'Code' },
    ],
  },
};

function manifest(params: Record<string, unknown>): PluginManifest {
  return {
    id: 'me.param-checks',
    name: 'Param checks',
    version: '1.0.0',
    description: 'Fixture',
    author: 'Me',
    category: 'other',
    license: 'MIT',
    engine: '>=1.8.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*'],
    contributes: {
      settings: SETTINGS,
      domOps: [
        { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-test' },
        { op: 'native', handler: 'fixture', params },
      ],
    },
  };
}

/** Every issue the load gate and the plugin:check / local-import param check raise. */
function allIssues(input: PluginManifest) {
  const loaded = validateManifest(input);
  return [...(loaded.success ? [] : loaded.error), ...primitiveParamIssues(input)];
}

function adapter(selectors: SiteAdapter['selectors']): SiteAdapter {
  return { ...requireBundledSiteAdapter('claude'), selectors };
}

describe('required primitive params', () => {
  it('reports a missing required param at its param path', () => {
    expect(primitiveParamIssues(manifest({}))).toEqual([
      {
        path: 'contributes.domOps[1].params.title',
        message: 'missing required parameter for primitive "fixture"',
      },
    ]);
  });

  it('counts a settings token as present', () => {
    expect(allIssues(manifest({ title: '{{label}}' }))).toEqual([]);
  });
});

describe('semanticKey primitive params', () => {
  it('refuses a key outside the allowed list or the vocabulary', () => {
    for (const target of ['codeBlock', 'thinking', '']) {
      expect(primitiveParamIssues(manifest({ title: 'x', target }))).toEqual([
        {
          path: 'contributes.domOps[1].params.target',
          message: 'must be one of userTurn, assistantTurn',
        },
      ]);
    }
    expect(primitiveParamIssues(manifest({ title: 'x', target: 3 }))).toEqual([
      { path: 'contributes.domOps[1].params.target', message: 'must be a semanticKey' },
    ]);
    // Without allowedKeys any vocabulary key fits, and only those.
    expect(primitiveParamIssues(manifest({ title: 'x', anchor: 'codeBlock' }))).toEqual([]);
    expect(
      primitiveParamIssues(manifest({ title: 'x', anchor: 'messageList' }))[0].message,
    ).toMatch(/^must be one of userTurn, assistantTurn, thinkingBlock, codeBlock,/);
  });

  it('checks every option of a select setting the param reads, not only its default', () => {
    expect(allIssues(manifest({ title: 'x', target: '{{turn}}' }))).toEqual([]);
    expect(allIssues(manifest({ title: 'x', target: '{{anyTurn}}' }))).toContainEqual({
      path: 'contributes.domOps[1].params.target',
      message: 'setting "anyTurn" offers "codeBlock"; must be one of userTurn, assistantTurn',
    });
  });

  it('leaves a token it cannot enumerate to the primitive at activation', () => {
    expect(primitiveParamIssues(manifest({ title: 'x', target: '{{label}}' }))).toEqual([]);
    expect(primitiveParamIssues(manifest({ title: 'x', target: 'user{{label}}' }))).toEqual([]);
  });

  it('reports needs-semantic when the adapter lacks a key a param names', () => {
    const check = (params: Record<string, unknown>, selectors: SiteAdapter['selectors']) =>
      findIncompatibility({
        manifest: manifest(params),
        adapter: adapter(selectors),
        hasPrimitive: () => true,
        engineVersion: '1.8.0',
      });
    expect(check({ title: 'x', target: 'assistantTurn' }, { userTurn: '.u' })).toMatchObject({
      kind: 'needs-semantic',
      missingSemantic: ['assistantTurn'],
    });
    expect(check({ title: 'x', target: 'assistantTurn' }, { assistantTurn: '.a' })).toBeNull();
    // A key the primitive refuses is a param error, not a key the site should declare.
    expect(check({ title: 'x', target: 'codeBlock' }, { userTurn: '.u' })).toBeNull();
    // A select token needs every option it offers.
    expect(check({ title: 'x', target: '{{turn}}' }, { userTurn: '.u' })).toMatchObject({
      kind: 'needs-semantic',
      missingSemantic: ['assistantTurn'],
    });
  });
});

describe('copy-thinking (copyButton without requires.semantic)', () => {
  const loaded = validateManifest(resolveManifestEngine(copyThinking));
  if (!loaded.success) throw new Error(JSON.stringify(loaded.error));
  const plugin = loaded.data;

  it('needs thinkingBlock on an adapter that lacks it', () => {
    expect(plugin.requires?.semantic).toBeUndefined();
    const deepseek = requireBundledSiteAdapter('deepseek');
    const { thinkingBlock: _omitted, ...withoutThinking } = deepseek.selectors;
    const base = { manifest: plugin, hasPrimitive: () => true };
    expect(findIncompatibility({ ...base, adapter: deepseek })).toBeNull();
    expect(
      findIncompatibility({ ...base, adapter: { ...deepseek, selectors: withoutThinking } }),
    ).toMatchObject({ kind: 'needs-semantic', missingSemantic: ['thinkingBlock'] });
  });
});
