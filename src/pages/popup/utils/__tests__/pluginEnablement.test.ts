import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { importLocalPlugin } from '@/features/plugins/local/localPluginImport';
import { listPluginManifestsWithSources } from '@/features/plugins/sources/defaultSources';
import type { PluginManifest } from '@/features/plugins/types';

import { setPluginEnabledWithSiteAccess } from '../pluginEnablement';

const { containsMock, requestMock } = vi.hoisted(() => ({
  containsMock: vi.fn(),
  requestMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    permissions: { contains: containsMock, request: requestMock },
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
  },
}));

vi.mock('@/core/utils/browser', () => ({
  isFirefox: () => false,
  supportsOptionalHostPermissions: () => true,
  supportsDynamicContentScriptRegistration: () => true,
}));

const STATE = StorageKeys.PLUGINS_STATE;
const ID = 'local.me.wide-chat';
const CLAUDE = 'https://claude.ai/chat/1';

function authored(css: string): Record<string, unknown> {
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
    i18n: { zh: { name: '宽聊天', settings: { width: { label: '宽度' } } } },
    contributes: {
      settings: { width: { type: 'number', label: 'Width', default: 60, min: 40, max: 100 } },
      styles: [{ css }],
    },
  };
}

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
  containsMock.mockReset();
  requestMock.mockReset();
});

/** The manifest the popup renders, listed the way `usePopupPlugins` lists it. */
async function shownManifest(): Promise<PluginManifest> {
  const records = await listPluginManifestsWithSources(undefined, {
    url: CLAUDE,
    host: 'claude.ai',
  });
  const record = records.find(({ manifest }) => manifest.id === ID);
  if (!record) throw new Error('local plugin not listed');
  return record.manifest;
}

function enabled(): boolean {
  const state = memory[STATE] as Record<string, { enabled: boolean }> | undefined;
  return state?.[ID]?.enabled === true;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('enabling a local plugin from the popup', () => {
  it('enables the reviewed content', async () => {
    await importLocalPlugin(authored('.gv-wide{max-width:none}'));
    containsMock.mockResolvedValue(true);
    const onChange = vi.fn();
    const outcome = await setPluginEnabledWithSiteAccess(
      await shownManifest(),
      true,
      CLAUDE,
      onChange,
    );
    expect(outcome).toBe('enabled');
    expect(enabled()).toBe(true);
  });

  it('refuses when the same id was re-imported with other content while the enable was pending', async () => {
    await importLocalPlugin(authored('.gv-wide{max-width:none}'));
    const seen = await shownManifest();
    const access = deferred<boolean>();
    containsMock.mockReturnValue(access.promise);
    const onChange = vi.fn();

    const pending = setPluginEnabledWithSiteAccess(seen, true, CLAUDE, onChange);
    // Same version, different CSS: a version check alone would let it through.
    const reimport = await importLocalPlugin(authored('body{display:none}'));
    expect(reimport.ok).toBe(true);
    access.resolve(true);

    expect(await pending).toBe('changed');
    expect(enabled()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('refuses the optimistic enable before the permission prompt when the content changed', async () => {
    await importLocalPlugin(authored('.gv-wide{max-width:none}'));
    const seen = await shownManifest();
    await importLocalPlugin(authored('body{display:none}'));
    containsMock.mockResolvedValue(false);
    const onChange = vi.fn();

    expect(await setPluginEnabledWithSiteAccess(seen, true, CLAUDE, onChange)).toBe('changed');
    expect(requestMock).not.toHaveBeenCalled();
    expect(enabled()).toBe(false);
  });

  it('reports a storage failure as a failed save, not as a re-import', async () => {
    await importLocalPlugin(authored('.gv-wide{max-width:none}'));
    const seen = await shownManifest();
    containsMock.mockResolvedValue(true);
    (chrome.storage.local.set as unknown as Mock).mockRejectedValue(new Error('quota'));
    const onChange = vi.fn();

    expect(await setPluginEnabledWithSiteAccess(seen, true, CLAUDE, onChange)).toBe('write_failed');
    expect(enabled()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('reports a failed optimistic write before the permission prompt without prompting', async () => {
    await importLocalPlugin(authored('.gv-wide{max-width:none}'));
    const seen = await shownManifest();
    containsMock.mockResolvedValue(false);
    (chrome.storage.local.set as unknown as Mock).mockRejectedValue(new Error('quota'));

    expect(await setPluginEnabledWithSiteAccess(seen, true, CLAUDE, vi.fn())).toBe('write_failed');
    expect(requestMock).not.toHaveBeenCalled();
  });
});
