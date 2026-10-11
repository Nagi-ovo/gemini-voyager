/**
 * A rebuilt engine must not start a page-wide runtime beside one the old
 * engine is still shutting down. The release ledger lives in the host, so a
 * catalog change that swaps the site adapter (old engine unmounted, new one
 * built) still waits for the old release.
 */
import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';

import { getFormulaCopyService } from '@/features/formulaCopy';

import type { PluginManifest, PluginSource } from '../types';
import { PluginHost } from './PluginHost';

const storageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: storageMocks.get },
      onChanged: {
        addListener: storageMocks.addListener,
        removeListener: storageMocks.removeListener,
      },
    },
  },
}));

const vim = vi.hoisted(() => ({ live: 0, maxLive: 0, starts: 0 }));

vi.mock('@/pages/content/chatInput/vimMode', () => ({
  startInputVimMode: async () => {
    vim.starts += 1;
    vim.live += 1;
    vim.maxLive = Math.max(vim.maxLive, vim.live);
    return () => {
      vim.live -= 1;
    };
  },
}));

const PAGE_URL = 'https://claude.ai/chat/1';

// Vim first, formula second: the old scope tears down in reverse, so its Vim
// cleanup waits behind the formula startup that is still reading storage.
const composite: PluginManifest = {
  id: 'local.me.composite',
  name: 'Composite',
  version: '1.0.0',
  description: 'd',
  author: 'me',
  category: 'other',
  license: 'MIT',
  engine: '>=1.4.0',
  tier: 'declarative',
  matches: ['https://claude.ai/*'],
  contributes: {
    domOps: [
      { op: 'native', handler: 'vimInput', params: {} },
      { op: 'native', handler: 'formulaCopy', params: {} },
    ],
  },
};

function siteOverride(userTurn: string) {
  return {
    catalogRevision: Number.MAX_SAFE_INTEGER,
    id: 'claude',
    label: 'Claude (remote)',
    matches: ['https://claude.ai/*'],
    selectors: { userTurn, composer: '[contenteditable="true"]' },
    theme: { hostSelector: ':root', lightSelector: ':root', darkSelector: ':root.dark' },
    brandColor: '#101010',
    capabilities: new Set(['chat' as const]),
  };
}

function fireCatalogChange(): void {
  const listeners = (chrome.storage.onChanged.addListener as unknown as Mock).mock.calls;
  for (const [listener] of listeners) {
    listener(
      {
        'gvPluginHostCatalog:claude.ai': {
          oldValue: { status: 'ok', extensionVersion: 'x', manifests: [] },
          newValue: { status: 'ok', extensionVersion: 'x', manifests: [], site: { id: 'v2' } },
        },
      },
      'local',
    );
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  getFormulaCopyService().dispose();
  (chrome.storage.local.get as unknown as Mock).mockReset?.();
  (chrome.storage.onChanged.addListener as unknown as Mock).mockClear?.();
});

describe('PluginHost release ledger across an engine rebuild', () => {
  it('waits for the old formula startup to settle before the new engine mounts a second owner', async () => {
    let finishFirstRead!: (value: Record<string, unknown>) => void;
    storageMocks.get
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirstRead = resolve)))
      .mockResolvedValue({});
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginsState: { [composite.id]: { enabled: true, installedAt: 1 } },
    });
    let turn = '.first-turn';
    const remote: PluginSource = {
      id: 'host-catalog',
      kind: 'remote',
      list: async () => [],
      isAuthoritative: async () => true,
      siteOverride: async () => siteOverride(turn),
    };
    const local: PluginSource = { id: 'local', kind: 'local', list: async () => [composite] };
    const host = new PluginHost({
      url: PAGE_URL,
      sources: [remote, local],
      doc: document,
      requestCatalogRefresh: () => {},
      isTopFrame: true,
    });
    await host.start();
    await flush();
    const service = getFormulaCopyService();
    expect(vim.starts).toBe(1);
    expect(storageMocks.get).toHaveBeenCalledTimes(1);
    expect(service.isServiceInitialized()).toBe(false);

    turn = '.second-turn';
    fireCatalogChange();
    await flush();
    expect(host.activeAdapter?.selectors.userTurn).toBe('.second-turn');
    // The old scope is still releasing: neither runtime starts a second time.
    expect(vim.starts).toBe(1);
    expect(storageMocks.get).toHaveBeenCalledTimes(1);
    expect(host.getStatuses()).toEqual([
      {
        id: composite.id,
        version: '1.0.0',
        kind: 'blocked',
        blockedReason: 'releasing',
        blockedBy: composite.id,
      },
    ]);

    finishFirstRead({});
    await flush();
    expect(vim.starts).toBe(2);
    expect(vim.maxLive).toBe(1);
    expect(storageMocks.get).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(service.isServiceInitialized()).toBe(true));
    expect(document.documentElement.classList.contains('gv-formula-copy-enabled')).toBe(true);
    expect(host.getStatuses()[0]?.kind).toMatch(/^(mounted|no-effect)$/);

    host.stop();
    await flush();
    expect(vim.live).toBe(0);
    expect(service.isServiceInitialized()).toBe(false);
  });
});
