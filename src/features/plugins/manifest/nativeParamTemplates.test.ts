import { describe, expect, it, vi } from 'vitest';

import { validateLocalManifest } from '../local/validateLocalManifest';
import type { PluginManifest } from '../types';
import { primitiveParamIssues, primitiveShippabilityIssues } from './primitiveChecks';
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
            description: 'Typed fixture',
            params: {
              amount: { type: 'number', required: false, description: '' },
              flag: { type: 'boolean', required: false, description: '' },
              title: { type: 'string', required: false, description: '' },
              names: { type: 'string[]', required: false, description: '' },
            },
          }
        : actual.getPrimitiveContract(name),
  };
});

function manifest(params: Record<string, unknown>, engine = '>=1.8.0'): PluginManifest {
  return {
    id: 'me.param-settings',
    name: 'Param settings',
    version: '1.0.0',
    description: 'Fixture',
    author: 'Me',
    category: 'other',
    license: 'MIT',
    engine,
    tier: 'declarative',
    matches: ['https://claude.ai/*'],
    contributes: {
      settings: {
        amount: { type: 'number', label: 'Amount', default: 4 },
        flag: { type: 'boolean', label: 'Flag', default: false },
        mode: {
          type: 'select',
          label: 'Mode',
          default: 'word',
          options: [{ value: 'word', label: 'Word' }],
        },
      },
      domOps: [
        { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-test' },
        { op: 'native', handler: 'fixture', params },
      ],
    },
  };
}

function issues(input: PluginManifest) {
  const result = validateManifest(input);
  return result.success ? [] : result.error;
}

describe('native param template manifest gate', () => {
  it('accepts typed whole tokens, embedded text and string-array leaves', () => {
    const input = manifest({
      amount: '{{amount}}',
      flag: '{{flag}}',
      title: 'a{{flag}}/{{mode}}',
      names: ['{{mode}}'],
    });
    expect(issues(input)).toEqual([]);
    expect(primitiveParamIssues(input)).toEqual([]);
    const result = validateManifest(input);
    expect(result.success && result.data.contributes.domOps).toEqual(input.contributes.domOps);
  });

  it('reports an unknown nested reference at its original op and value path', () => {
    expect(issues(manifest({ title: { values: ['x{{missing}}'] } }))).toEqual([
      {
        path: 'contributes.domOps[1].params.title.values[0]',
        message: 'unknown setting "missing"; must refer to a setting in the same plugin',
      },
    ]);
  });

  it.each([
    [{ title: '{{amount}}' }, 'title', 'number', 'string'],
    [{ amount: 'x{{amount}}' }, 'amount', 'string', 'number'],
    [{ flag: '{{mode}}' }, 'flag', 'string', 'boolean'],
    [{ names: ['{{flag}}'] }, 'names[0]', 'boolean', 'string'],
    [{ names: '{{mode}}' }, 'names', 'string', 'string[]'],
  ] as const)(
    'rejects statically incompatible references (%j)',
    (params, path, provided, expected) => {
      expect(issues(manifest(params))).toContainEqual({
        path: `contributes.domOps[1].params.${path}`,
        message: expect.stringContaining(
          `supplies ${provided}, but primitive "fixture" requires ${expected}`,
        ),
      });
    },
  );

  it('rejects a default that disagrees with the setting type and primitive contract', () => {
    const input = manifest({ amount: '{{amount}}' });
    const broken = {
      ...input,
      contributes: {
        ...input.contributes,
        settings: { amount: { type: 'number', label: 'Amount', default: 'four' } },
      },
    };
    const result = validateManifest(broken);
    expect(result.success ? [] : result.error).toContainEqual({
      path: 'contributes.domOps[1].params.amount',
      message: 'must be a number',
    });
  });

  it.each(['>=1.7.0', '*', 'invalid'])(
    'refuses a template on an engine range lacking the capability (%s)',
    (engine) => {
      const input = manifest({ amount: '{{amount}}' }, engine);
      expect(issues(input)).toContainEqual({
        path: 'engine',
        message: expect.stringContaining('need engine ">=1.8.0"'),
      });
      expect(primitiveShippabilityIssues(input)).toContainEqual({
        path: 'engine',
        message: expect.stringContaining('1.8.0'),
      });
    },
  );

  it('admits contributor next and later concrete engines without moving the feature floor', () => {
    for (const engine of ['>=next', '>=1.8.0', '>=1.9.0'])
      expect(issues(manifest({ amount: '{{amount}}' }, engine))).toEqual([]);
    expect(issues(manifest({ amount: 4 }, '>=1.4.0'))).toEqual([]);
  });

  it('accepts a local existing-primitive template and refuses its old-engine variant', () => {
    const input: PluginManifest = {
      ...manifest({}),
      contributes: {
        settings: {
          composer: {
            type: 'select',
            label: 'Composer',
            default: 'textarea',
            options: [{ value: 'textarea', label: 'Text input' }],
          },
        },
        domOps: [{ op: 'native', handler: 'vimInput', params: { composer: '{{composer}}' } }],
      },
    };
    expect(validateLocalManifest(input).success).toBe(true);
    const result = validateLocalManifest({ ...input, engine: '>=1.7.0' });
    expect(result.success ? [] : result.error).toContainEqual({
      path: 'engine',
      message: expect.stringContaining('need engine ">=1.8.0"'),
    });
  });
});
