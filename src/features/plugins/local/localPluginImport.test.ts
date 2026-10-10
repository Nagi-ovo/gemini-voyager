import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { loadPluginState, setPluginEnabled } from '../storage/pluginState';
import { LocalPluginSource } from './LocalPluginSource';
import {
  type LocalPluginImportDeps,
  exportLocalPluginJson,
  importLocalPlugin,
  importLocalPluginFiles,
  readLocalPluginFiles,
  removeLocalPlugin,
} from './localPluginImport';
import { type LocalPluginRecordMap, loadLocalPluginRecords } from './localPluginStore';

function authored(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'me.wide-chat',
    name: 'Wide chat',
    version: '1.0.0',
    description: 'Widen the Claude chat column',
    author: 'Me',
    category: 'layout',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*'],
    contributes: {
      styles: [{ css: '.gv-wide{max-width:none}' }],
      domOps: [{ op: 'addClass', target: 'body', className: 'gv-wide' }],
    },
    ...overrides,
  };
}

/** In-memory chrome.storage.local so the real store and state modules run. */
let memory: Record<string, unknown>;
beforeEach(() => {
  memory = {};
  (chrome.storage.local.get as unknown as Mock).mockImplementation(
    async (defaults: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [key, fallback] of Object.entries(defaults)) {
        out[key] = key in memory ? structuredClone(memory[key]) : fallback;
      }
      return out;
    },
  );
  (chrome.storage.local.set as unknown as Mock).mockImplementation(
    async (items: Record<string, unknown>) => {
      Object.assign(memory, structuredClone(items));
    },
  );
});
afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
  (chrome.storage.local.set as unknown as Mock).mockReset();
});

describe('readLocalPluginFiles', () => {
  it('reads one manifest with its CSS inlined', async () => {
    const result = await readLocalPluginFiles([
      { name: 'plugin.json', text: JSON.stringify(authored()) },
    ]);
    expect(result.success && (result.data as { id: string }).id).toBe('me.wide-chat');
  });

  it('inlines style files picked with the manifest, by relative path or unique name', async () => {
    const manifest = authored({
      contributes: { styles: [{ file: 'styles/wide.css' }] },
    });
    const byPath = await readLocalPluginFiles([
      { name: 'wide/plugin.json', text: JSON.stringify(manifest) },
      { name: 'wide/styles/wide.css', text: '.gv-wide{max-width:none}' },
    ]);
    expect(byPath.success && byPath.data).toMatchObject({
      contributes: { styles: [{ css: '.gv-wide{max-width:none}' }] },
    });
    const byName = await readLocalPluginFiles([
      { name: 'plugin.json', text: JSON.stringify(manifest) },
      { name: 'wide.css', text: '.gv-wide{width:100%}' },
    ]);
    expect(byName.success && byName.data).toMatchObject({
      contributes: { styles: [{ css: '.gv-wide{width:100%}' }] },
    });
  });

  it('caps style entries and the expanded CSS before expanding or scanning any of it', async () => {
    const loads = { count: 0 };
    const css = {
      name: 'a.css',
      get text() {
        loads.count += 1;
        return `.gv-a{color:red}${' '.repeat(100_000)}`;
      },
    };
    const many = authored({
      contributes: { styles: Array.from({ length: 10_000 }, () => ({ file: 'a.css' })) },
    });
    const flood = await readLocalPluginFiles([
      { name: 'plugin.json', text: JSON.stringify(many) },
      css,
    ]);
    expect(!flood.success && flood.error[0].path).toBe('contributes.styles');

    // Few entries, but expanding them would still read far more than one import may.
    const repeated = authored({
      contributes: { styles: Array.from({ length: 20 }, () => ({ file: 'a.css' })) },
    });
    const expanded = await readLocalPluginFiles([
      { name: 'plugin.json', text: JSON.stringify(repeated) },
      { name: 'a.css', text: `.gv-a{color:red}${' '.repeat(100_000)}` },
    ]);
    expect(!expanded.success && expanded.error[0].path).toBe('contributes.styles');
    expect(loads.count).toBeLessThanOrEqual(2);
  });

  it('reports what is wrong with the picked files', async () => {
    const none = await readLocalPluginFiles([{ name: 'a.css', text: '' }]);
    expect(!none.success && none.error[0].path).toBe('file');
    const broken = await readLocalPluginFiles([{ name: 'plugin.json', text: '{ nope' }]);
    expect(!broken.success && broken.error[0].path).toBe('');
    const missingCss = await readLocalPluginFiles([
      {
        name: 'plugin.json',
        text: JSON.stringify(authored({ contributes: { styles: [{ file: 'gone.css' }] } })),
      },
    ]);
    expect(!missingCss.success && missingCss.error[0].path).toBe('contributes.styles');
  });
});

describe('importLocalPlugin', () => {
  function memoryDeps(initial: LocalPluginRecordMap = {}) {
    let records: LocalPluginRecordMap = initial;
    const enabled = new Map<string, boolean>();
    const deps: LocalPluginImportDeps = {
      loadRecords: async () => records,
      installDisabled: vi.fn(async (manifest) => {
        const id = manifest.id as string;
        records = { ...records, [id]: { manifest, importedAt: 1, updatedAt: 2 } };
        enabled.set(id, false);
      }),
    };
    return { deps, enabled, records: () => records };
  }

  it('keeps the installed version and writes nothing when a re-import fails validation', async () => {
    const installed = { ...authored(), id: 'local.me.wide-chat' };
    const store = memoryDeps({
      'local.me.wide-chat': { manifest: installed, importedAt: 1, updatedAt: 1 },
    });

    const result = await importLocalPlugin(
      authored({
        version: '2.0.0',
        contributes: { styles: [{ css: 'body{background:url(https://t.example/p.gif)}' }] },
      }),
      store.deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.previousVersion).toBe('1.0.0');
    expect(result.issues.map((issue) => issue.path)).toContain('contributes.styles[0].css');
    expect(result.issues.every((issue) => issue.message.length > 0)).toBe(true);
    expect(store.deps.installDisabled).not.toHaveBeenCalled();
    expect(store.records()['local.me.wide-chat'].manifest).toBe(installed);
  });

  it('replaces the previous version on a valid re-import and lands disabled', async () => {
    const store = memoryDeps({
      'local.me.wide-chat': {
        manifest: { ...authored(), id: 'local.me.wide-chat' },
        importedAt: 1,
        updatedAt: 1,
      },
    });
    const result = await importLocalPlugin(authored({ version: '1.1.0' }), store.deps);
    expect(result).toMatchObject({ ok: true, previousVersion: '1.0.0' });
    expect(store.records()['local.me.wide-chat'].manifest.version).toBe('1.1.0');
    expect(store.enabled.get('local.me.wide-chat')).toBe(false);
  });
});

describe('local plugin storage round trip', () => {
  it('persists an import, serves it from LocalPluginSource, exports and removes it', async () => {
    // A stale enable state (e.g. restored from Drive) must not switch the import on.
    await setPluginEnabled('local.me.wide-chat', true);
    expect((await loadPluginState())['local.me.wide-chat'].enabled).toBe(true);

    const result = await importLocalPluginFiles([
      { name: 'plugin.json', text: JSON.stringify(authored()) },
    ]);
    expect(result.ok).toBe(true);
    expect((await loadPluginState())['local.me.wide-chat'].enabled).toBe(false);

    const records = await loadLocalPluginRecords();
    expect(Object.keys(records)).toEqual(['local.me.wide-chat']);
    expect(memory[StorageKeys.PLUGIN_LOCAL_MANIFESTS]).toBeDefined();

    const listed = await new LocalPluginSource().list();
    expect(listed.map((plugin) => plugin.id)).toEqual(['local.me.wide-chat']);

    // Export is re-importable as-is.
    const exported = exportLocalPluginJson(records['local.me.wide-chat']);
    const again = await importLocalPluginFiles([{ name: 'plugin.json', text: exported }]);
    expect(again).toMatchObject({ ok: true, previousVersion: '1.0.0' });

    await removeLocalPlugin('local.me.wide-chat');
    expect(await loadLocalPluginRecords()).toEqual({});
    expect(await loadPluginState()).not.toHaveProperty('local.me.wide-chat');
  });
});
