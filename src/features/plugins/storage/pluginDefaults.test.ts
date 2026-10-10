import { type Mock, beforeEach, describe, expect, it } from 'vitest';

import { loadEnabledPlugins } from '@/pages/background/enabledPlugins';
import { canUseVisualEffects } from '@/pages/popup/utils/visualEffectsAvailability';

import { BUILTIN_PLUGINS } from '../builtin';
import { hasEnabledPluginForUrl } from '../remote/hostCatalogPolicy';
import { isPluginEnabled } from './pluginDefaults';
import { setPluginSetting } from './pluginState';

const FOLDERS = 'voyager.chatgpt-folders';
const EXPORT = 'voyager.chatgpt-export';
const STATE_KEY = 'gvPluginsState';

const get = () => chrome.storage.local.get as unknown as Mock;
const set = () => chrome.storage.local.set as unknown as Mock;

function storeState(state: unknown): void {
  get().mockResolvedValue({ [STATE_KEY]: state });
}
function writtenState(): Record<string, { enabled: boolean; settings?: object }> {
  const [[written]] = set().mock.calls;
  return written[STATE_KEY];
}
async function enabledIds(): Promise<string[]> {
  const enabled = await loadEnabledPlugins(async () => BUILTIN_PLUGINS);
  return enabled.map((plugin) => plugin.id);
}

beforeEach(() => {
  get().mockReset();
  set().mockReset();
  set().mockResolvedValue(undefined);
});

describe('ChatGPT folders is on by default', () => {
  it('is on for a user who never touched it, and off for one who turned it off', () => {
    expect(isPluginEnabled({}, FOLDERS)).toBe(true);
    expect(isPluginEnabled({ [FOLDERS]: { enabled: false } }, FOLDERS)).toBe(false);
    expect(isPluginEnabled({ [FOLDERS]: { enabled: true } }, FOLDERS)).toBe(true);
    // Other plugins stay opt-in.
    expect(isPluginEnabled({}, EXPORT)).toBe(false);
    expect(isPluginEnabled({ [EXPORT]: { enabled: true } }, EXPORT)).toBe(true);
  });

  it('is registered by the background unless the user turned it off', async () => {
    storeState({});
    expect(await enabledIds()).toEqual([FOLDERS]);

    storeState({ [FOLDERS]: { enabled: false, installedAt: 1 } });
    expect(await enabledIds()).toEqual([]);

    storeState({ [EXPORT]: { enabled: true, installedAt: 1 } });
    expect((await enabledIds()).sort()).toEqual([EXPORT, FOLDERS].sort());
  });

  it('stays on when a setting changes before the user ever flipped it', async () => {
    storeState({});
    await setPluginSetting(FOLDERS, 'hideFiledChats', true);
    expect(writtenState()[FOLDERS]).toMatchObject({
      enabled: true,
      settings: { hideFiledChats: true },
    });
  });

  it('stays off when a setting changes after the user turned it off', async () => {
    storeState({ [FOLDERS]: { enabled: false, installedAt: 1 } });
    await setPluginSetting(FOLDERS, 'hideFiledChats', true);
    expect(writtenState()[FOLDERS]).toMatchObject({ enabled: false, installedAt: 1 });

    set().mockClear();
    storeState({});
    await setPluginSetting(EXPORT, 'any', true);
    expect(writtenState()[EXPORT].enabled).toBe(false);
  });

  it('never by itself offers visual effects or makes Voyager contact the catalog host', () => {
    const folders = BUILTIN_PLUGINS.filter((plugin) => plugin.id === FOLDERS);
    const effects = (pluginState: Parameters<typeof canUseVisualEffects>[0]['pluginState']) =>
      canUseVisualEffects({
        isPluginSite: true,
        activeSiteDomain: 'chatgpt.com',
        customWebsites: [],
        sitePluginIds: [FOLDERS],
        pluginState,
      });
    // No host access may have been granted, so no content script may run there.
    expect(effects({})).toBe(false);
    expect(effects({ [FOLDERS]: { enabled: true, installedAt: 1 } })).toBe(true);
    expect(hasEnabledPluginForUrl(folders, {}, 'https://chatgpt.com/')).toBe(false);
    expect(
      hasEnabledPluginForUrl(
        folders,
        { [FOLDERS]: { enabled: true, installedAt: 1 } },
        'https://chatgpt.com/',
      ),
    ).toBe(true);
  });
});
