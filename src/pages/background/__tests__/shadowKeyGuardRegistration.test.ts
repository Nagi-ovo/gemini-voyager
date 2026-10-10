import { describe, expect, it, vi } from 'vitest';

import { BUILTIN_PLUGINS } from '@/features/plugins/builtin';
import type { PluginManifest } from '@/features/plugins/types';

import {
  SHADOW_KEY_GUARD_SCRIPT_ID,
  type ShadowKeyGuardSync,
  findShadowKeyGuardScript,
  syncShadowKeyGuardRegistration,
} from '../shadowKeyGuardRegistration';

const GUARD_JS = 'assets/shadowKeyGuardEntry.ts-Ay7ZSi6Q.js';
const HOST_ID = 'gv-plugin-content-script';

/** The built manifest's content scripts, as Chrome reports them. */
const MANIFEST = {
  manifest_version: 3,
  name: 'Voyager',
  version: '1.0.0',
  content_scripts: [
    { matches: ['https://gemini.google.com/*'], js: ['assets/index.tsx-loader-x.js'] },
    { matches: ['https://gemini.google.com/*'], js: [GUARD_JS], run_at: 'document_start' },
    {
      matches: ['https://gemini.google.com/*'],
      js: ['assets/usageObserverLoader.ts-loader-y.js'],
      run_at: 'document_start',
    },
  ],
} as chrome.runtime.Manifest;

function plugin(id: string): PluginManifest {
  const manifest = BUILTIN_PLUGINS.find((candidate) => candidate.id === id);
  if (!manifest) throw new Error(`no builtin ${id}`);
  return manifest;
}

function fakeScripting(registered: string[] = []) {
  const ids = new Set(registered);
  return {
    ids,
    getRegisteredContentScripts: vi.fn(async () => [...ids].map((id) => ({ id }))),
    unregisterContentScripts: vi.fn(async ({ ids: gone }: { ids?: string[] }) => {
      for (const id of gone ?? []) ids.delete(id);
    }),
    registerContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
      for (const script of scripts) ids.add(script.id);
    }),
  };
}

function sync(
  scripting: ReturnType<typeof fakeScripting>,
  overrides: Partial<ShadowKeyGuardSync> = {},
): Promise<void> {
  return syncShadowKeyGuardRegistration({
    scripting: scripting as unknown as ShadowKeyGuardSync['scripting'],
    manifest: MANIFEST,
    enabledPlugins: [plugin('voyager.chatgpt-folders')],
    filterGranted: async (patterns) => patterns.filter((p) => p.startsWith('https://chatgpt.com')),
    toResource: (path) => path,
    ...overrides,
  });
}

describe('shadow key guard registration', () => {
  it('finds the guard in the built manifest', () => {
    expect(findShadowKeyGuardScript(MANIFEST)).toEqual([GUARD_JS]);
  });

  it('registers the guard at document_start on granted ChatGPT origins, in its own call', async () => {
    const scripting = fakeScripting([HOST_ID]);
    await sync(scripting);

    expect(scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    expect(scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: SHADOW_KEY_GUARD_SCRIPT_ID,
        js: [GUARD_JS],
        matches: ['https://chatgpt.com/*'],
        allFrames: false,
        runAt: 'document_start',
        persistAcrossSessions: true,
      },
    ]);
  });

  it('removes the guard but keeps the plugin host when folders are off and another ChatGPT plugin is on', async () => {
    const scripting = fakeScripting([HOST_ID, SHADOW_KEY_GUARD_SCRIPT_ID]);
    await sync(scripting, { enabledPlugins: [plugin('voyager.chatgpt-export')] });

    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
    expect([...scripting.ids]).toEqual([HOST_ID]);
  });

  it('registers nothing where the user has not granted ChatGPT', async () => {
    const scripting = fakeScripting();
    await sync(scripting, { filterGranted: async () => [] });
    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it('registers nothing, and drops a stale guard, when the build ships no guard', async () => {
    const scripting = fakeScripting([SHADOW_KEY_GUARD_SCRIPT_ID]);
    const manifest = { ...MANIFEST, content_scripts: MANIFEST.content_scripts?.slice(0, 1) };
    await sync(scripting, { manifest });
    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
    expect(scripting.ids.size).toBe(0);
  });

  it('passes the guard path through the browser’s resource mapping', async () => {
    const scripting = fakeScripting();
    await sync(scripting, { toResource: (path) => `mapped/${path}` });
    expect(scripting.registerContentScripts.mock.calls[0][0][0].js).toEqual([`mapped/${GUARD_JS}`]);
  });

  it('contains a failed registration', async () => {
    const scripting = fakeScripting();
    scripting.registerContentScripts.mockRejectedValueOnce(new Error('Duplicate script ID'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(sync(scripting)).resolves.toBeUndefined();
  });
});
