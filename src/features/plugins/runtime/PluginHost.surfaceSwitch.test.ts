/**
 * The AI Studio master switch (`GV_AISTUDIO_ENABLED`) turns Voyager fully off on
 * AI Studio, local plugins included, and the host follows it live.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import type { PluginManifest, PluginSource } from '../types';
import { PluginHost } from './PluginHost';

const SWITCH = StorageKeys.GV_AISTUDIO_ENABLED;

function localPlugin(matches: string[]): PluginManifest {
  return {
    id: 'local.me.tweak',
    name: 'Tweak',
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'other',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches,
    contributes: {
      domOps: [
        { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-tweak' },
      ],
    },
  };
}

function localSource(plugin: PluginManifest): PluginSource {
  return { id: 'local', kind: 'local', list: async () => [plugin] };
}

function setSwitch(value: boolean | undefined): void {
  (chrome.storage.sync.get as unknown as Mock).mockImplementation(
    async (defaults: Record<string, unknown>) => ({
      ...defaults,
      ...(value === undefined ? {} : { [SWITCH]: value }),
    }),
  );
}

function fireSwitch(value: boolean): void {
  const listeners = (chrome.storage.onChanged.addListener as unknown as Mock).mock.calls;
  for (const [listener] of listeners) listener({ [SWITCH]: { newValue: value } }, 'sync');
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
}

const mounted = () => document.body.classList.contains('gv-tweak');

beforeEach(() => {
  document.body.className = '';
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
    gvPluginsState: { 'local.me.tweak': { enabled: true, installedAt: 1 } },
  });
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
  (chrome.storage.sync.get as unknown as Mock).mockReset();
  (chrome.storage.onChanged.addListener as unknown as Mock).mockClear();
});

function host(url: string, matches: string[]): PluginHost {
  return new PluginHost({
    url,
    sources: [localSource(localPlugin(matches))],
    doc: document,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
}

describe('AI Studio master switch', () => {
  it('keeps local plugins off while Voyager is off on AI Studio, and mounts them when it is turned on', async () => {
    setSwitch(false);
    const h = host('https://aistudio.google.com/prompts/new_chat', [
      'https://aistudio.google.com/*',
    ]);
    await h.start();
    expect(mounted()).toBe(false);

    fireSwitch(true);
    await flush();
    expect(mounted()).toBe(true);
    h.stop();
  });

  it('unmounts them when Voyager is turned off on AI Studio at runtime', async () => {
    setSwitch(undefined); // never set: on by default
    const h = host('https://aistudio.google.cn/', ['https://aistudio.google.cn/*']);
    await h.start();
    expect(mounted()).toBe(true);

    fireSwitch(false);
    await flush();
    expect(mounted()).toBe(false);

    fireSwitch(true);
    await flush();
    expect(mounted()).toBe(true);
    h.stop();
  });

  it('only gates AI Studio: Gemini has no master switch and other sites ignore this one', async () => {
    setSwitch(false);
    const gemini = host('https://gemini.google.com/app', ['https://gemini.google.com/*']);
    await gemini.start();
    expect(mounted()).toBe(true);
    gemini.stop();
    expect(mounted()).toBe(false);

    const claude = host('https://claude.ai/new', ['https://claude.ai/*']);
    await claude.start();
    expect(mounted()).toBe(true);
    claude.stop();
  });
});
