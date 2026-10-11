/**
 * Page-wide runtimes on the sites that already run plugins (Claude, ChatGPT,
 * DeepSeek). Formula copy and Vim input are one per page, so two plugins that
 * start the same one never run together: the official plugin and a user's
 * local copy used to run side by side, now one of them is blocked. Every
 * other primitive keeps composing as before.
 *
 * The runtimes are replaced by counters that also let a test hold a release
 * open, so "never two at once" and "hand over only after the release" are
 * observable.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BUILTIN_PLUGINS } from '../builtin';
import deepseekFormulaJson from '../catalog/sites/deepseek/plugins/formula-copy/plugin.json';
import deepseekVimJson from '../catalog/sites/deepseek/plugins/vim-input/plugin.json';
import { validateManifest } from '../manifest/validate';
import type { PluginManifest, PluginSource } from '../types';
import { PluginHost } from './PluginHost';
import type { PluginStatus } from './pluginStatus';

const runtimes = vi.hoisted(() => {
  interface FakeRuntime {
    live: number;
    maxLive: number;
    starts: number;
    /** While true, each stop waits for the test to finish it. */
    holdRelease: boolean;
    pendingReleases: Array<() => void>;
  }
  const create = (): FakeRuntime => ({
    live: 0,
    maxLive: 0,
    starts: 0,
    holdRelease: false,
    pendingReleases: [],
  });
  const formula = create();
  const vim = create();
  const start = (runtime: FakeRuntime): (() => void | Promise<void>) => {
    runtime.starts += 1;
    runtime.live += 1;
    runtime.maxLive = Math.max(runtime.maxLive, runtime.live);
    return () => {
      if (!runtime.holdRelease) {
        runtime.live -= 1;
        return;
      }
      return new Promise<void>((resolve) => {
        runtime.pendingReleases.push(() => {
          runtime.live -= 1;
          resolve();
        });
      });
    };
  };
  const reset = (): void => {
    for (const runtime of [formula, vim]) Object.assign(runtime, create());
  };
  return { formula, vim, start, reset };
});

vi.mock('@/features/formulaCopy', () => ({
  activateFormulaCopy: (scope: { effect: (run: () => () => void, label: string) => void }) => {
    scope.effect(() => runtimes.start(runtimes.formula), 'formula-copy');
  },
}));

vi.mock('@/pages/content/chatInput/vimMode', () => ({
  startInputVimMode: async () => runtimes.start(runtimes.vim),
}));

type RuntimeName = 'formula' | 'vim';

function parsed(raw: unknown): PluginManifest {
  const result = validateManifest(raw);
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data;
}

function builtin(id: string): PluginManifest {
  const manifest = BUILTIN_PLUGINS.find((plugin) => plugin.id === id);
  if (!manifest) throw new Error(`missing builtin ${id}`);
  return manifest;
}

interface SiteCase {
  readonly name: string;
  readonly url: string;
  readonly official: Record<RuntimeName, PluginManifest>;
}

const SITES: readonly SiteCase[] = [
  {
    name: 'Claude',
    url: 'https://claude.ai/chat/1',
    official: { formula: builtin('voyager.formula-copy'), vim: builtin('voyager.input-vim') },
  },
  {
    name: 'ChatGPT',
    url: 'https://chatgpt.com/c/1',
    official: { formula: builtin('voyager.formula-copy'), vim: builtin('voyager.input-vim') },
  },
  {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com/a/chat/s/1',
    official: { formula: parsed(deepseekFormulaJson), vim: parsed(deepseekVimJson) },
  },
];

function localCopy(official: PluginManifest, id: string): PluginManifest {
  return { ...official, id, author: 'me', i18n: undefined };
}

const unrelated = (url: string): PluginManifest => ({
  id: 'local.me.tweak',
  name: 'Tweak',
  version: '1.0.0',
  description: 'd',
  author: 'me',
  category: 'other',
  license: 'MIT',
  engine: '>=1.0.0',
  tier: 'declarative',
  matches: [`${new URL(url).origin}/*`],
  contributes: {
    domOps: [{ op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-tweak' }],
  },
});

let state: Record<string, { enabled: boolean; installedAt: number }> = {};

function enable(...ids: string[]): void {
  state = Object.fromEntries(ids.map((id) => [id, { enabled: true, installedAt: 1 }]));
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ gvPluginsState: state });
}

/** Deliver a plugin-state change to every storage.onChanged subscriber. */
function setEnabled(id: string, enabled: boolean): void {
  state = { ...state, [id]: { enabled, installedAt: 1 } };
  const listeners = (chrome.storage.onChanged.addListener as unknown as Mock).mock.calls;
  for (const [listener] of listeners) listener({ gvPluginsState: { newValue: state } }, 'local');
}

function host(url: string, plugins: readonly PluginManifest[], extra = {}): PluginHost {
  const official: PluginSource = {
    id: 'static',
    list: async () => plugins.filter((plugin) => !plugin.id.startsWith('local.')),
  };
  const local: PluginSource = {
    id: 'local',
    kind: 'local',
    list: async () => plugins.filter((plugin) => plugin.id.startsWith('local.')),
  };
  return new PluginHost({
    url,
    sources: [official, local],
    doc: document,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
    ...extra,
  });
}

function statusOf(pluginHost: PluginHost, id: string): Partial<PluginStatus> {
  const status = pluginHost.getStatuses().find((entry) => entry.id === id);
  if (!status) return {};
  const { kind, blockedReason, blockedBy } = status;
  // A mounted plugin may already carry a health verdict; both mean it runs.
  return kind === 'no-effect'
    ? { kind: 'mounted' }
    : { kind, ...(blockedReason ? { blockedReason } : {}), ...(blockedBy ? { blockedBy } : {}) };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  runtimes.reset();
  state = {};
  document.body.className = '';
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset?.();
  (chrome.storage.onChanged.addListener as unknown as Mock).mockClear?.();
});

describe.each(SITES)('one page-wide runtime on $name', (site) => {
  describe.each(['formula', 'vim'] as const)('%s', (runtimeName) => {
    const official = site.official[runtimeName];
    const alice = localCopy(official, `local.alice.${runtimeName}`);
    const bob = localCopy(official, `local.bob.${runtimeName}`);
    const runtime = () => runtimes[runtimeName];

    it('official + local: only the official plugin runs; the local one is blocked by it', async () => {
      enable(official.id, alice.id);
      const pluginHost = host(site.url, [alice, official]);
      await pluginHost.start();
      await flush();

      expect(runtime().starts).toBe(1);
      expect(runtime().maxLive).toBe(1);
      expect(statusOf(pluginHost, official.id)).toEqual({ kind: 'mounted' });
      expect(statusOf(pluginHost, alice.id)).toEqual({
        kind: 'blocked',
        blockedReason: 'conflict',
        blockedBy: official.id,
      });
      pluginHost.stop();
    });

    it('a running local plugin keeps the runtime when the official one is turned on', async () => {
      enable(alice.id);
      const pluginHost = host(site.url, [alice, official]);
      await pluginHost.start();
      await flush();
      expect(statusOf(pluginHost, alice.id)).toEqual({ kind: 'mounted' });

      setEnabled(official.id, true);
      await flush();
      expect(runtime().starts).toBe(1);
      expect(statusOf(pluginHost, alice.id)).toEqual({ kind: 'mounted' });
      expect(statusOf(pluginHost, official.id)).toEqual({
        kind: 'blocked',
        blockedReason: 'conflict',
        blockedBy: alice.id,
      });
      pluginHost.stop();
    });

    it('local + local: the lower id runs, the other is blocked by it', async () => {
      enable(bob.id, alice.id);
      const pluginHost = host(site.url, [bob, alice]);
      await pluginHost.start();
      await flush();

      expect(runtime().starts).toBe(1);
      expect(statusOf(pluginHost, alice.id)).toEqual({ kind: 'mounted' });
      expect(statusOf(pluginHost, bob.id)).toEqual({
        kind: 'blocked',
        blockedReason: 'conflict',
        blockedBy: alice.id,
      });
      pluginHost.stop();
    });

    it('turning the holder off hands the runtime over only once its release has finished', async () => {
      enable(official.id, alice.id);
      const pluginHost = host(site.url, [alice, official]);
      await pluginHost.start();
      await flush();
      runtime().holdRelease = true;

      setEnabled(official.id, false);
      await flush();
      expect(runtime().pendingReleases).toHaveLength(1);
      expect(runtime().starts).toBe(1);
      expect(statusOf(pluginHost, alice.id)).toEqual({
        kind: 'blocked',
        blockedReason: 'releasing',
        blockedBy: official.id,
      });

      runtime().pendingReleases.shift()?.();
      await flush();
      expect(runtime().starts).toBe(2);
      expect(runtime().maxLive).toBe(1);
      expect(statusOf(pluginHost, alice.id)).toEqual({ kind: 'mounted' });
      pluginHost.stop();
    });

    it('turning the holder off and on again before its release finishes brings it back', async () => {
      enable(official.id, alice.id);
      const pluginHost = host(site.url, [alice, official]);
      await pluginHost.start();
      await flush();
      runtime().holdRelease = true;

      setEnabled(official.id, false);
      await flush();
      setEnabled(official.id, true);
      await flush();
      expect(statusOf(pluginHost, official.id)).toEqual({
        kind: 'blocked',
        blockedReason: 'releasing',
        blockedBy: official.id,
      });
      expect(statusOf(pluginHost, alice.id)).toMatchObject({ blockedReason: 'conflict' });

      runtime().pendingReleases.shift()?.();
      await flush();
      expect(runtime().starts).toBe(2);
      expect(runtime().maxLive).toBe(1);
      expect(statusOf(pluginHost, official.id)).toEqual({ kind: 'mounted' });
      expect(statusOf(pluginHost, alice.id)).toEqual({
        kind: 'blocked',
        blockedReason: 'conflict',
        blockedBy: official.id,
      });
      pluginHost.stop();
    });

    it('an unrelated plugin runs beside the contest, even while a release never finishes', async () => {
      const tweak = unrelated(site.url);
      enable(official.id, alice.id, tweak.id);
      const pluginHost = host(site.url, [alice, official, tweak]);
      await pluginHost.start();
      await flush();
      expect(document.body.classList.contains('gv-tweak')).toBe(true);
      runtime().holdRelease = true;

      setEnabled(official.id, false);
      await flush();
      setEnabled(tweak.id, false);
      await flush();
      expect(document.body.classList.contains('gv-tweak')).toBe(false);
      setEnabled(tweak.id, true);
      await flush();

      // The release is never finished: only the plugin that needs it waits.
      expect(document.body.classList.contains('gv-tweak')).toBe(true);
      expect(statusOf(pluginHost, tweak.id)).toEqual({ kind: 'mounted' });
      expect(statusOf(pluginHost, alice.id)).toMatchObject({ blockedReason: 'releasing' });
      expect(runtime().starts).toBe(1);
      pluginHost.stop();
    });
  });
});

describe('page-wide runtime releases across a host restart', () => {
  const site = SITES[0];
  const official = site.official.formula;

  it('a stop()→start() never starts the runtime again before the old release finishes', async () => {
    enable(official.id);
    const pluginHost = host(site.url, [official]);
    await pluginHost.start();
    await flush();
    runtimes.formula.holdRelease = true;

    pluginHost.stop();
    await pluginHost.start();
    await flush();
    expect(runtimes.formula.starts).toBe(1);
    expect(statusOf(pluginHost, official.id)).toEqual({
      kind: 'blocked',
      blockedReason: 'releasing',
      blockedBy: official.id,
    });

    runtimes.formula.pendingReleases.shift()?.();
    await flush();
    expect(runtimes.formula.starts).toBe(2);
    expect(runtimes.formula.maxLive).toBe(1);
    expect(statusOf(pluginHost, official.id)).toEqual({ kind: 'mounted' });
    pluginHost.stop();
  });

  it('a release that lands after stop() queues nothing for the stopped host', async () => {
    enable(official.id);
    const pluginHost = host(site.url, [official]);
    await pluginHost.start();
    await flush();
    runtimes.formula.holdRelease = true;
    setEnabled(official.id, false);
    await flush();
    setEnabled(official.id, true);
    await flush();
    expect(statusOf(pluginHost, official.id)).toMatchObject({ blockedReason: 'releasing' });

    pluginHost.stop();
    runtimes.formula.pendingReleases.shift()?.();
    await flush();
    expect(runtimes.formula.starts).toBe(1);
    expect(runtimes.formula.live).toBe(0);
  });
});

describe('a manifest that starts one runtime twice', () => {
  const url = 'https://claude.ai/chat/1';
  const vim = builtin('voyager.input-vim');
  const twice: PluginManifest = {
    ...localCopy(vim, 'local.me.vim-twice'),
    contributes: {
      styles: [{ css: '.gv-vim-twice{color:red}' }],
      domOps: [
        { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-vim-twice' },
        { op: 'native', handler: 'vimInput', params: {} },
        { op: 'native', handler: 'vimInput', params: { composer: 'textarea' } },
      ],
    },
  };

  it('never activates any of it and reports why, enabled or not', async () => {
    enable(twice.id);
    const pluginHost = host(url, [twice]);
    await pluginHost.start();
    await flush();

    expect(runtimes.vim.starts).toBe(0);
    expect(document.body.classList.contains('gv-vim-twice')).toBe(false);
    expect(document.head.innerHTML).not.toContain('.gv-vim-twice');
    expect(statusOf(pluginHost, twice.id)).toEqual({
      kind: 'blocked',
      blockedReason: 'duplicate-claim',
    });

    setEnabled(twice.id, false);
    await flush();
    expect(statusOf(pluginHost, twice.id)).toEqual({
      kind: 'blocked',
      blockedReason: 'duplicate-claim',
    });
    pluginHost.stop();
  });
});

describe('a composite plugin waiting on a release that never finishes', () => {
  const url = 'https://claude.ai/chat/1';
  const formulaOp = builtin('voyager.formula-copy').contributes.domOps ?? [];
  const vimOp = builtin('voyager.input-vim').contributes.domOps ?? [];
  const named = (id: string, domOps: PluginManifest['contributes']['domOps']): PluginManifest => ({
    ...localCopy(builtin('voyager.formula-copy'), id),
    contributes: { domOps },
  });
  // Priority among local plugins is by id: B is placed before C.
  const vimA = named('local.a.vim', vimOp);
  const compositeB = named('local.b.vim-formula', [...vimOp, ...formulaOp]);
  const formulaC = named('local.c.formula', formulaOp);

  /** A holds Vim, then is switched off (release held open) as B and C are switched on. */
  async function handOver(): Promise<PluginHost> {
    enable(vimA.id);
    const pluginHost = host(url, [vimA, compositeB, formulaC]);
    await pluginHost.start();
    await flush();
    expect(statusOf(pluginHost, vimA.id)).toEqual({ kind: 'mounted' });
    runtimes.vim.holdRelease = true;
    state = {
      [vimA.id]: { enabled: false, installedAt: 1 },
      [compositeB.id]: { enabled: true, installedAt: 1 },
      [formulaC.id]: { enabled: true, installedAt: 1 },
    };
    const listeners = (chrome.storage.onChanged.addListener as unknown as Mock).mock.calls;
    for (const [listener] of listeners) listener({ gvPluginsState: { newValue: state } }, 'local');
    await flush();
    return pluginHost;
  }

  it('blocks only the runtime still shutting down: a plugin needing the free one starts', async () => {
    const pluginHost = await handOver();
    expect(runtimes.vim.pendingReleases).toHaveLength(1);
    expect(statusOf(pluginHost, compositeB.id)).toEqual({
      kind: 'blocked',
      blockedReason: 'releasing',
      blockedBy: vimA.id,
    });
    expect(statusOf(pluginHost, formulaC.id)).toEqual({ kind: 'mounted' });
    expect(runtimes.formula.starts).toBe(1);

    // Once A is gone, B still finds Formula held by C, which keeps it.
    runtimes.vim.pendingReleases.shift()?.();
    await flush();
    expect(runtimes.vim.starts).toBe(1);
    expect(statusOf(pluginHost, compositeB.id)).toEqual({
      kind: 'blocked',
      blockedReason: 'conflict',
      blockedBy: formulaC.id,
    });
    expect(statusOf(pluginHost, formulaC.id)).toEqual({ kind: 'mounted' });
    pluginHost.stop();
  });

  it('starts the composite plugin after the release once nothing else holds its other runtime', async () => {
    const pluginHost = await handOver();
    setEnabled(formulaC.id, false);
    await flush();
    expect(statusOf(pluginHost, compositeB.id)).toMatchObject({ blockedReason: 'releasing' });

    runtimes.vim.pendingReleases.shift()?.();
    await flush();
    expect(statusOf(pluginHost, compositeB.id)).toEqual({ kind: 'mounted' });
    expect(runtimes.vim.maxLive).toBe(1);
    expect(runtimes.formula.maxLive).toBe(1);
    pluginHost.stop();
  });
});
