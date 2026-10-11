import { describe, expect, it } from 'vitest';

import type { PluginSettings, SettingsSchema } from '../types';
import {
  collectNativeParamSettingReferences,
  hasNativeParamTemplates,
  nativeParamSettingIssues,
  renderNativeParams,
} from './nativeParamSettings';

const schema: SettingsSchema = {
  count: { type: 'number', label: 'Count', default: 12 },
  enabled: { type: 'boolean', label: 'Enabled', default: true },
  metric: {
    type: 'select',
    label: 'Metric',
    default: 'lines',
    options: [
      { value: 'lines', label: 'Lines' },
      { value: '', label: 'None' },
    ],
  },
};

describe('native param settings', () => {
  it('preserves numeric, boolean and select values for exact whole-value tokens', () => {
    expect(
      renderNativeParams(
        { count: '{{count}}', enabled: '{{enabled}}', metric: '{{metric}}' },
        schema,
        { count: 0, enabled: false, metric: '' },
      ),
    ).toEqual({ success: true, data: { count: 0, enabled: false, metric: '' } });
  });

  it('stringifies embedded tokens and falls back to declared defaults', () => {
    expect(
      renderNativeParams(
        { selector: '.item-{{count}}-{{enabled}}-{{metric}}', spaced: ' {{count}} ' },
        schema,
        {},
      ),
    ).toEqual({
      success: true,
      data: { selector: '.item-12-true-lines', spaced: ' 12 ' },
    });
  });

  it('renders nested array and object values without changing keys or static data', () => {
    const params = {
      '{{count}}': [{ value: '{{count}}', values: ['{{metric}}', '.n-{{count}}'] }],
      untouched: [null, 5, true, 'literal', '{{}}'],
    };
    const snapshot = structuredClone(params);
    expect(renderNativeParams(params, schema, { count: 4 })).toEqual({
      success: true,
      data: {
        '{{count}}': [{ value: 4, values: ['lines', '.n-4'] }],
        untouched: [null, 5, true, 'literal', '{{}}'],
      },
    });
    expect(params).toEqual(snapshot);
  });

  it('substituted setting text does not expand another setting token', () => {
    const tokenSchema: SettingsSchema = {
      first: { type: 'string', label: 'First', default: '{{second}}' },
      second: { type: 'string', label: 'Second', default: 'expanded' },
    };
    for (const fields of [tokenSchema, Object.fromEntries(Object.entries(tokenSchema).reverse())]) {
      expect(
        renderNativeParams({ whole: '{{first}}', embedded: 'a{{first}}b' }, fields, {}),
      ).toEqual({ success: true, data: { whole: '{{second}}', embedded: 'a{{second}}b' } });
    }
  });

  it('collects precise nested reference paths and leaves templated keys alone', () => {
    const params = {
      '{{ignored}}': 'literal',
      nested: [{ numeric: '{{count}}', selector: '.{{metric}}-{{enabled}}' }],
    };
    expect(collectNativeParamSettingReferences(params, 'contributes.domOps[2].params')).toEqual([
      { key: 'count', path: 'contributes.domOps[2].params.nested[0].numeric', wholeValue: true },
      { key: 'metric', path: 'contributes.domOps[2].params.nested[0].selector', wholeValue: false },
      {
        key: 'enabled',
        path: 'contributes.domOps[2].params.nested[0].selector',
        wholeValue: false,
      },
    ]);
    expect(hasNativeParamTemplates(params)).toBe(true);
    expect(hasNativeParamTemplates({ '{{ignored}}': '{{}}' })).toBe(false);
  });

  it('fails closed for unknown keys with the path of each referenced value', () => {
    const params = { nested: ['{{missing}}', { text: 'prefix{{other}}' }] };
    const issues = [
      {
        path: 'params.nested[0]',
        message: 'unknown setting "missing"; must refer to a setting in the same plugin',
      },
      {
        path: 'params.nested[1].text',
        message: 'unknown setting "other"; must refer to a setting in the same plugin',
      },
    ];
    expect(nativeParamSettingIssues(params, schema)).toEqual(issues);
    expect(renderNativeParams(params, schema, { missing: 'stored' })).toEqual({
      success: false,
      error: issues,
    });
    expect(renderNativeParams({ count: '{{count}}' }, undefined, {})).toEqual({
      success: false,
      error: [
        {
          path: 'params.count',
          message: 'unknown setting "count"; must refer to a setting in the same plugin',
        },
      ],
    });
  });

  it('matches setting keys literally, including spaces, without trimming tokens', () => {
    const spacedSchema: SettingsSchema = {
      ' count ': { type: 'number', label: 'Count', default: 7 },
    };
    expect(renderNativeParams({ count: '{{ count }}' }, spacedSchema, {})).toEqual({
      success: true,
      data: { count: 7 },
    });
    expect(nativeParamSettingIssues({ count: '{{ count }}' }, schema)).toHaveLength(1);
  });

  it('does not resolve prototype keys in settings declarations or stored settings', () => {
    const inheritedSchema: SettingsSchema = Object.create(schema);
    expect(renderNativeParams({ count: '{{count}}' }, inheritedSchema, {})).toMatchObject({
      success: false,
      error: [{ path: 'params.count' }],
    });
    expect(renderNativeParams({ value: '{{constructor}}' }, {}, {})).toMatchObject({
      success: false,
      error: [{ path: 'params.value' }],
    });
    const inheritedSettings: PluginSettings = Object.create({ count: 42 });
    expect(renderNativeParams({ count: '{{count}}' }, schema, inheritedSettings)).toEqual({
      success: true,
      data: { count: 12 },
    });
  });
});
