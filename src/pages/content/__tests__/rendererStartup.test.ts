/**
 * Gemini's renderer start points under either owner. The native modules are
 * counters behind the real toggle controller and cleanup manager; the owner
 * table is given to the start points, so the plugin-owned case runs before any
 * entry is flipped in the shipped table.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import {
  FEATURE_OWNERS,
  type FeatureOwner,
  OFFICIAL_PLUGIN_IDS,
  type OwnedFeature,
  type OwnedFeatureId,
  type PackagedSiteId,
} from '@/features/plugins/sites/featureOwners';

import { createGeminiRendererStartup, readNativeToggle } from '../rendererStartup';

const native = vi.hoisted(() => ({
  starts: {} as Record<string, number>,
  live: {} as Record<string, number>,
}));

function counter(name: string): () => () => void {
  return () => {
    native.starts[name] = (native.starts[name] ?? 0) + 1;
    native.live[name] = (native.live[name] ?? 0) + 1;
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      native.live[name] -= 1;
    };
  };
}

vi.mock('../codeBlockCollapse', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../codeBlockCollapse')>()),
  startCodeBlockCollapse: () => counter('codeCollapse')(),
}));
vi.mock('../userLatex/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../userLatex/index')>()),
  startUserLatex: () => counter('userLatex')(),
}));
vi.mock('../mermaid/index', () => ({ startMermaid: () => counter('mermaid')() }));
vi.mock('../wavedrom/index', () => ({ startWaveDrom: () => counter('waveDrom')() }));
vi.mock('../echarts/index', () => ({ startEcharts: () => counter('echarts')() }));

const COLLAPSE_KEY = StorageKeys.CODE_BLOCK_COLLAPSE_ENABLED;
const LATEX_KEY = StorageKeys.USER_LATEX_ENABLED;
const RENDERERS: readonly OwnedFeatureId[] = [
  'codeCollapse',
  'userLatex',
  'waveDrom',
  'echarts',
  'mermaid',
];

const syncGet = () => chrome.storage.sync.get as unknown as Mock;

function withRenderersOwnedBy(owner: FeatureOwner): readonly OwnedFeature[] {
  return FEATURE_OWNERS.map((entry) =>
    entry.site === 'gemini' && RENDERERS.includes(entry.feature) ? { ...entry, owner } : entry,
  );
}

function ownerOf(owners: readonly OwnedFeature[]) {
  return (site: PackagedSiteId, feature: OwnedFeatureId): FeatureOwner =>
    owners.find((entry) => entry.site === site && entry.feature === feature)?.owner ?? 'legacy';
}

function storedSwitches(values: Record<string, unknown>): void {
  syncGet().mockImplementation(async (keys: string[]) =>
    Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])),
  );
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  native.starts = {};
  native.live = {};
  storedSwitches({});
});

afterEach(() => {
  syncGet().mockReset();
});

describe('Gemini renderer start points while the native modules own them', () => {
  it('starts every native renderer once, collapse and LaTeX on by default, and admits no official plugin', async () => {
    const admission = createOfficialAdmission();
    const startup = createGeminiRendererStartup(admission, new CleanupManager());

    await startup.startCodeBlockCollapse();
    await startup.startRenderers();
    admission.close();

    expect(native.starts).toEqual({
      codeCollapse: 1,
      mermaid: 1,
      waveDrom: 1,
      echarts: 1,
      userLatex: 1,
    });
    for (const { feature, officialPluginId } of FEATURE_OWNERS) {
      if (RENDERERS.includes(feature)) expect(admission.stateOf(officialPluginId)).toBe('denied');
    }
  });

  it('turns code block collapse off and on live from the popup switch while the native module owns it', async () => {
    const cleanups = new CleanupManager();
    const startup = createGeminiRendererStartup(createOfficialAdmission(), cleanups);
    await startup.startCodeBlockCollapse();
    expect(native.live.codeCollapse).toBe(1);

    startup.handleStorageChange({ [COLLAPSE_KEY]: { newValue: false } }, 'sync');
    await flush();
    expect(native.live.codeCollapse).toBe(0);

    // Another area's write to the same key is not the popup switch.
    startup.handleStorageChange({ [COLLAPSE_KEY]: { newValue: true } }, 'local');
    await flush();
    expect(native.live.codeCollapse).toBe(0);

    startup.handleStorageChange({ [COLLAPSE_KEY]: { newValue: true } }, 'sync');
    await flush();
    expect(native.live.codeCollapse).toBe(1);
    expect(native.starts.codeCollapse).toBe(2);

    cleanups.executeCleanups();
    expect(native.live.codeCollapse).toBe(0);
  });

  it('turns user LaTeX off and on live from the popup switch while the native module owns it', async () => {
    storedSwitches({ [LATEX_KEY]: false });
    const cleanups = new CleanupManager();
    const startup = createGeminiRendererStartup(createOfficialAdmission(), cleanups);
    await startup.startRenderers();
    expect(native.starts.userLatex).toBeUndefined();

    startup.handleStorageChange({ [LATEX_KEY]: { newValue: true } }, 'sync');
    await flush();
    expect(native.live.userLatex).toBe(1);

    startup.handleStorageChange({ [LATEX_KEY]: { newValue: false } }, 'sync');
    await flush();
    expect(native.live.userLatex).toBe(0);

    cleanups.executeCleanups();
    expect(native.live.userLatex).toBe(0);
  });

  it('keeps the switch flipped during the startup read instead of the late initial value', async () => {
    let answerRead: (stored: Record<string, unknown>) => void = () => {};
    syncGet().mockImplementation(
      () =>
        new Promise((resolve) => {
          answerRead = resolve;
        }),
    );
    const startup = createGeminiRendererStartup(createOfficialAdmission(), new CleanupManager());
    const starting = startup.startCodeBlockCollapse();
    await flush();

    startup.handleStorageChange({ [COLLAPSE_KEY]: { newValue: false } }, 'sync');
    answerRead({ [COLLAPSE_KEY]: true });
    await starting;
    await flush();

    expect(native.starts.codeCollapse).toBeUndefined();
  });

  it('mounts nothing when the extension context died during the startup read', async () => {
    syncGet().mockRejectedValue(new Error('Extension context invalidated.'));
    const startup = createGeminiRendererStartup(createOfficialAdmission(), new CleanupManager());

    await startup.startCodeBlockCollapse();

    expect(native.starts.codeCollapse).toBeUndefined();
  });
});

describe('readNativeToggle', () => {
  const toggle = { key: COLLAPSE_KEY, isEnabled: (value: unknown) => value !== false };

  it('reads any other failure as the missing key, on by default', async () => {
    syncGet().mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    await expect(readNativeToggle(toggle)).resolves.toBe(true);
  });

  it('reads an invalidated context as off', async () => {
    syncGet().mockRejectedValue(new Error('Extension context invalidated.'));
    await expect(readNativeToggle(toggle)).resolves.toBe(false);
  });
});

describe('Gemini renderer start points once the official plugins own them', () => {
  it('admits the official renderer plugins at the native start points and starts no native renderer', async () => {
    const owners = withRenderersOwnedBy('plugin');
    const admission = createOfficialAdmission(owners);
    const startup = createGeminiRendererStartup(admission, new CleanupManager(), ownerOf(owners));

    await startup.startCodeBlockCollapse();
    await startup.startRenderers();
    admission.close();

    // PluginHost follows the switches now: the native modules neither start nor listen.
    startup.handleStorageChange({ [COLLAPSE_KEY]: { newValue: true } }, 'sync');
    startup.handleStorageChange({ [LATEX_KEY]: { newValue: true } }, 'sync');
    await flush();
    expect(native.starts).toEqual({});
    expect(syncGet()).not.toHaveBeenCalled();
    for (const id of [
      OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
      OFFICIAL_PLUGIN_IDS.geminiUserLatex,
      OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
      OFFICIAL_PLUGIN_IDS.geminiECharts,
      OFFICIAL_PLUGIN_IDS.geminiMermaid,
    ]) {
      expect(admission.stateOf(id)).toBe('admitted');
    }
  });
});
