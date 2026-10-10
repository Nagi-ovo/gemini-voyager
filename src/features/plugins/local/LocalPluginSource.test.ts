import { describe, expect, it } from 'vitest';

import { LocalPluginSource } from './LocalPluginSource';
import { type LocalPluginRecordMap, sanitizeLocalPluginRecords } from './localPluginStore';

function stored(id: string, overrides: Record<string, unknown> = {}) {
  return {
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      description: 'd',
      author: 'Me',
      category: 'layout',
      license: 'MIT',
      engine: '>=1.0.0',
      tier: 'declarative',
      matches: ['https://claude.ai/*'],
      contributes: { styles: [{ css: '.gv-x{color:red}' }] },
      ...overrides,
    },
    importedAt: 1,
    updatedAt: 1,
  };
}

describe('LocalPluginSource', () => {
  it('serves valid stored plugins as kind local', async () => {
    const source = new LocalPluginSource({
      loadRecords: async () => ({ 'local.me.a': stored('local.me.a') }),
    });
    expect(source.kind).toBe('local');
    const listed = await source.list();
    expect(listed.map((plugin) => plugin.id)).toEqual(['local.me.a']);
  });

  it('re-validates stored data and skips records a newer gate rejects', async () => {
    const records: LocalPluginRecordMap = {
      'local.me.ok': stored('local.me.ok'),
      'local.me.tracker': stored('local.me.tracker', {
        contributes: { styles: [{ css: 'body{background:url(https://t.example/p.gif)}' }] },
      }),
      'local.me.anywhere': stored('local.me.anywhere', { matches: ['<all_urls>'] }),
      'local.me.mismatch': stored('local.me.other'),
    };
    const listed = await new LocalPluginSource({ loadRecords: async () => records }).list();
    expect(listed.map((plugin) => plugin.id)).toEqual(['local.me.ok']);
  });

  it('a plugin whose select offers an empty choice stays installed', async () => {
    const records: LocalPluginRecordMap = {
      'local.me.auto': stored('local.me.auto', {
        contributes: {
          styles: [{ css: '.gv-x{color:red}' }],
          settings: {
            width: {
              type: 'select',
              label: 'Width',
              default: '',
              options: [
                { value: '', label: 'Automatic' },
                { value: 'wide', label: 'Wide' },
              ],
            },
          },
        },
      }),
    };
    const listed = await new LocalPluginSource({ loadRecords: async () => records }).list();
    expect(listed.map((plugin) => plugin.id)).toEqual(['local.me.auto']);
  });

  it('never loads a stored record outside the local namespace', () => {
    const sanitized = sanitizeLocalPluginRecords({
      'voyager.formula-copy': stored('voyager.formula-copy'),
      'local.me.a': stored('local.me.a'),
      'local.me.b': 'garbage',
    });
    expect(Object.keys(sanitized)).toEqual(['local.me.a']);
  });
});
