/**
 * Storage-level safety of local plugin mutations: what an observer of
 * chrome.storage can see mid-import, what a failed read or write leaves behind,
 * and what two popups mutating at once end up with.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { setPluginEnabled } from '../storage/pluginState';
import { importLocalPlugin } from './localPluginImport';
import {
  loadLocalPluginRecords,
  localPluginRecordSnapshot,
  removeLocalPluginRecord,
  saveLocalPluginRecord,
} from './localPluginStore';

const RECORDS = StorageKeys.PLUGIN_LOCAL_MANIFESTS;
const STATE = StorageKeys.PLUGINS_STATE;
const ID = 'local.me.wide-chat';

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
    contributes: { styles: [{ css: '.gv-wide{max-width:none}' }] },
    ...overrides,
  };
}

function stored(id: string, version = '1.0.0') {
  return {
    manifest: { ...authored({ version }), id },
    importedAt: 1,
    updatedAt: 1,
  };
}

let memory: Record<string, unknown>;
let failGet: ((keys: string[]) => boolean) | null;
let failSet: ((items: Record<string, unknown>) => boolean) | null;
let hangSetAfter: number | null;
/** While set, a write of plugin state alone waits for this gate (a slow late writer). */
let holdStateOnlySet: Promise<void> | null;
let setCalls: number;
let snapshots: Array<Record<string, unknown>>;

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  memory = {};
  failGet = null;
  failSet = null;
  hangSetAfter = null;
  holdStateOnlySet = null;
  setCalls = 0;
  snapshots = [];
  (chrome.storage.local.get as unknown as Mock).mockImplementation(
    async (defaults: Record<string, unknown>) => {
      await tick();
      if (failGet?.(Object.keys(defaults))) throw new Error('get failed');
      const out: Record<string, unknown> = {};
      for (const [key, fallback] of Object.entries(defaults)) {
        out[key] = key in memory ? structuredClone(memory[key]) : fallback;
      }
      return out;
    },
  );
  (chrome.storage.local.set as unknown as Mock).mockImplementation(
    async (items: Record<string, unknown>) => {
      setCalls += 1;
      if (hangSetAfter !== null && setCalls > hangSetAfter) return new Promise(() => {});
      const keys = Object.keys(items);
      if (holdStateOnlySet && keys.length === 1 && keys[0] === STATE) await holdStateOnlySet;
      await tick();
      if (failSet?.(items)) throw new Error('set failed');
      Object.assign(memory, structuredClone(items));
      snapshots.push(structuredClone(memory));
    },
  );
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
  (chrome.storage.local.set as unknown as Mock).mockReset();
  Reflect.deleteProperty(navigator, 'locks');
});

function versionIn(snapshot: Record<string, unknown>): string | undefined {
  const records = snapshot[RECORDS] as
    | Record<string, { manifest: { version: string } }>
    | undefined;
  return records?.[ID]?.manifest.version;
}

function enabledIn(snapshot: Record<string, unknown>): boolean {
  const state = snapshot[STATE] as Record<string, { enabled: boolean }> | undefined;
  return state?.[ID]?.enabled === true;
}

describe('re-importing an enabled local plugin', () => {
  beforeEach(() => {
    memory[RECORDS] = { [ID]: stored(ID) };
    memory[STATE] = { [ID]: { enabled: true, installedAt: 1 } };
  });

  it('never lets an observer see the new version enabled', async () => {
    const result = await importLocalPlugin(authored({ version: '2.0.0' }));
    expect(result.ok).toBe(true);
    expect(snapshots.some((s) => versionIn(s) === '2.0.0' && enabledIn(s))).toBe(false);
    expect(versionIn(memory)).toBe('2.0.0');
    expect(enabledIn(memory)).toBe(false);
  });

  it('writes the new version and its disabled state in one write, so closing the popup mid-import is safe', async () => {
    hangSetAfter = 0; // the popup closes while its one write is in flight
    vi.resetModules();
    const closingPopup = await import('./localPluginImport');
    void closingPopup.importLocalPlugin(authored({ version: '2.0.0' }));
    for (let i = 0; i < 10; i += 1) await tick();
    expect(setCalls).toBe(1);
    // Nothing landed: the reviewed version keeps running, the new one never ran.
    expect(versionIn(memory)).toBe('1.0.0');

    hangSetAfter = null;
    setCalls = 0;
    await importLocalPlugin(authored({ version: '2.0.0' }));
    expect(setCalls).toBe(1);
    expect(versionIn(memory)).toBe('2.0.0');
    expect(enabledIn(memory)).toBe(false);
  });

  it('fails the import and keeps the installed version when the disable write fails', async () => {
    failSet = (items) => STATE in items;
    const result = await importLocalPlugin(authored({ version: '2.0.0' }));
    expect(result.ok).toBe(false);
    expect(versionIn(memory)).toBe('1.0.0');
  });
});

describe('a failed storage read', () => {
  it('rejects a save and keeps every installed plugin', async () => {
    memory[RECORDS] = { 'local.me.a': stored('local.me.a'), 'local.me.b': stored('local.me.b') };
    failGet = (keys) => keys.includes(RECORDS);
    await expect(saveLocalPluginRecord({ ...authored(), id: 'local.me.c' })).rejects.toThrow();
    await expect(removeLocalPluginRecord('local.me.a')).rejects.toThrow();
    expect(Object.keys(memory[RECORDS] as object).sort()).toEqual(['local.me.a', 'local.me.b']);
  });

  it('reports a failed import instead of wiping the other plugins', async () => {
    memory[RECORDS] = { 'local.me.a': stored('local.me.a') };
    failGet = (keys) => keys.includes(RECORDS);
    const result = await importLocalPlugin(authored());
    expect(result.ok).toBe(false);
    expect(Object.keys(memory[RECORDS] as object)).toEqual(['local.me.a']);
  });

  it('never wipes the enable state of other plugins', async () => {
    memory[STATE] = { 'voyager.formula-copy': { enabled: true, installedAt: 1 } };
    failGet = (keys) => keys.includes(STATE);
    await setPluginEnabled('voyager.vim', true);
    expect(memory[STATE]).toEqual({ 'voyager.formula-copy': { enabled: true, installedAt: 1 } });
  });

  it('keeps stored entries this build cannot read when it changes another one', async () => {
    memory[RECORDS] = { 'local.me.a': stored('local.me.a'), 'local.me.future': { shape: 2 } };
    await saveLocalPluginRecord({ ...authored(), id: 'local.me.c' });
    expect(Object.keys(memory[RECORDS] as object).sort()).toEqual([
      'local.me.a',
      'local.me.c',
      'local.me.future',
    ]);
  });
});

/** A faithful FIFO exclusive Web Locks manager, shared by every "popup". */
function installSharedLocks(): void {
  const queues = new Map<string, Promise<unknown>>();
  const locks = {
    request: <T>(name: string, callback: () => Promise<T>): Promise<T> => {
      const previous = queues.get(name) ?? Promise.resolve();
      const run = previous.then(callback, callback);
      queues.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

async function freshStore() {
  vi.resetModules();
  return import('./localPluginStore');
}

describe('two popups mutating at once', () => {
  it('keeps both imports', async () => {
    installSharedLocks();
    const [a, b] = [await freshStore(), await freshStore()];
    await Promise.all([
      a.saveLocalPluginRecord({ ...authored(), id: 'local.me.a' }),
      b.saveLocalPluginRecord({ ...authored(), id: 'local.me.b' }),
    ]);
    expect(Object.keys(await loadLocalPluginRecords()).sort()).toEqual([
      'local.me.a',
      'local.me.b',
    ]);
  });

  it('never resurrects a plugin removed while another is imported', async () => {
    installSharedLocks();
    memory[RECORDS] = { 'local.me.a': stored('local.me.a'), 'local.me.b': stored('local.me.b') };
    const [a, b] = [await freshStore(), await freshStore()];
    await Promise.all([
      a.saveLocalPluginRecord({ ...authored(), id: 'local.me.c' }),
      b.removeLocalPluginRecord('local.me.a'),
    ]);
    expect(Object.keys(await loadLocalPluginRecords()).sort()).toEqual([
      'local.me.b',
      'local.me.c',
    ]);
  });

  it('serializes mutations inside one popup even without Web Locks', async () => {
    const store = await freshStore();
    await Promise.all([
      store.saveLocalPluginRecord({ ...authored(), id: 'local.me.a' }),
      store.saveLocalPluginRecord({ ...authored(), id: 'local.me.b' }),
    ]);
    expect(Object.keys(await loadLocalPluginRecords()).sort()).toEqual([
      'local.me.a',
      'local.me.b',
    ]);
  });
});

/** Fresh module instances, as in two popups (or a popup and the background). */
async function freshContexts() {
  vi.resetModules();
  const importer = await import('./localPluginImport');
  vi.resetModules();
  const state = await import('../storage/pluginState');
  return { importer, state };
}

describe('a plugin-state write racing a re-import', () => {
  let release: () => void;

  beforeEach(() => {
    installSharedLocks();
    memory[RECORDS] = { [ID]: stored(ID) };
    memory[STATE] = { [ID]: { enabled: true, installedAt: 1 } };
    holdStateOnlySet = new Promise<void>((resolve) => {
      release = resolve;
    });
  });

  /** Start `write` (it reads the old enabled state), then import v2, then let `write` land. */
  async function race(write: () => Promise<unknown>) {
    const { importer } = await freshContexts();
    const late = write();
    for (let i = 0; i < 5; i += 1) await tick();
    const imported = importer.importLocalPlugin(authored({ version: '2.0.0' }));
    for (let i = 0; i < 10; i += 1) await tick();
    release();
    await Promise.all([late, imported]);
  }

  it('keeps the new version disabled when a setting toggle lands late', async () => {
    const { state } = await freshContexts();
    await race(() => state.setPluginSetting(ID, 'compact', true));
    expect(versionIn(memory)).toBe('2.0.0');
    expect(enabledIn(memory)).toBe(false);
    const entry = (memory[STATE] as Record<string, { settings?: Record<string, unknown> }>)[ID];
    expect(entry.settings).toEqual({ compact: true });
  });

  it('keeps the new version disabled when an enable toggle for another plugin lands late', async () => {
    const { state } = await freshContexts();
    await race(() => state.setPluginEnabled('voyager.vim', true));
    expect(versionIn(memory)).toBe('2.0.0');
    expect(enabledIn(memory)).toBe(false);
  });

  it('keeps the new version disabled when a Drive merge restore lands late', async () => {
    const { state } = await freshContexts();
    await race(() =>
      state.restorePluginState({ 'voyager.vim': { enabled: true, installedAt: 2 } }, 'merge'),
    );
    expect(versionIn(memory)).toBe('2.0.0');
    expect(enabledIn(memory)).toBe(false);
  });
});

describe('restoring plugin state from Drive', () => {
  beforeEach(() => {
    memory[RECORDS] = { [ID]: stored(ID, '2.0.0') };
    // v2 was just imported, so it is off until the user reviews it.
    memory[STATE] = { [ID]: { enabled: false, installedAt: 1 } };
  });

  it.each(['merge', 'overwrite'] as const)(
    'never switches on a local plugin the cloud copy has enabled (%s)',
    async (mode) => {
      const { restorePluginState } = await import('../storage/pluginState');
      await restorePluginState(
        {
          [ID]: { enabled: true, installedAt: 1, settings: { compact: true } },
          'voyager.vim': { enabled: true, installedAt: 1 },
        },
        mode,
      );
      const state = memory[STATE] as Record<string, { enabled: boolean; settings?: unknown }>;
      expect(state[ID]).toEqual({ enabled: false, installedAt: 1, settings: { compact: true } });
      expect(state['voyager.vim'].enabled).toBe(true);
    },
  );

  it('lets the cloud copy switch a local plugin off', async () => {
    memory[STATE] = { [ID]: { enabled: true, installedAt: 1 } };
    const { restorePluginState } = await import('../storage/pluginState');
    await restorePluginState({ [ID]: { enabled: false, installedAt: 1 } }, 'merge');
    expect(enabledIn(memory)).toBe(false);
  });

  it('keeps a local plugin enabled when both copies have it on', async () => {
    memory[STATE] = { [ID]: { enabled: true, installedAt: 1 } };
    const { restorePluginState } = await import('../storage/pluginState');
    await restorePluginState({ [ID]: { enabled: true, installedAt: 1 } }, 'overwrite');
    expect(enabledIn(memory)).toBe(true);
  });
});

describe('importing a reviewed manifest over the install it was reviewed against', () => {
  async function reviewedSnapshot(): Promise<string | null> {
    return localPluginRecordSnapshot((await loadLocalPluginRecords())[ID]);
  }

  it('refuses when the id was installed after the review, and overwrites nothing', async () => {
    const reviewed = await reviewedSnapshot(); // nothing installed yet
    memory[RECORDS] = { [ID]: stored(ID, '1.5.0') };
    memory[STATE] = { [ID]: { enabled: true, installedAt: 1 } };
    setCalls = 0;

    const result = await importLocalPlugin(authored({ version: '2.0.0' }), undefined, {
      expectedInstalled: reviewed,
    });

    expect(result).toMatchObject({ ok: false, changedSinceReview: true, previousVersion: '1.5.0' });
    expect(setCalls).toBe(0);
    expect(versionIn(memory)).toBe('1.5.0');
    expect(enabledIn(memory)).toBe(true);
  });

  it('refuses when another import replaced the reviewed version first', async () => {
    memory[RECORDS] = { [ID]: stored(ID, '1.0.0') };
    const reviewed = await reviewedSnapshot();
    // Another popup imports the same id between the preview and Import.
    await importLocalPlugin(authored({ version: '1.0.0', description: 'edited elsewhere' }));

    const result = await importLocalPlugin(authored({ version: '2.0.0' }), undefined, {
      expectedInstalled: reviewed,
    });
    expect(result).toMatchObject({ ok: false, changedSinceReview: true });
    const records = memory[RECORDS] as Record<string, { manifest: { description: string } }>;
    expect(records[ID].manifest.description).toBe('edited elsewhere');
  });

  it('refuses when the reviewed install was removed meanwhile', async () => {
    memory[RECORDS] = { [ID]: stored(ID, '1.0.0') };
    const reviewed = await reviewedSnapshot();
    await removeLocalPluginRecord(ID);

    const result = await importLocalPlugin(authored({ version: '2.0.0' }), undefined, {
      expectedInstalled: reviewed,
    });
    expect(result).toMatchObject({ ok: false, changedSinceReview: true });
    expect(versionIn(memory)).toBeUndefined();
  });

  it('imports when the install is still the reviewed one', async () => {
    memory[RECORDS] = { [ID]: stored(ID, '1.0.0') };
    memory[STATE] = { [ID]: { enabled: true, installedAt: 1 } };
    const reviewed = await reviewedSnapshot();

    const result = await importLocalPlugin(authored({ version: '2.0.0' }), undefined, {
      expectedInstalled: reviewed,
    });
    expect(result).toMatchObject({ ok: true, previousVersion: '1.0.0' });
    expect(versionIn(memory)).toBe('2.0.0');
    expect(enabledIn(memory)).toBe(false);
  });
});
