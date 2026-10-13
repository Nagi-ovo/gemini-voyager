// @vitest-environment-options { "url": "https://gemini.google.com/app/shared" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import type { PluginHost } from '@/features/plugins/runtime/PluginHost';
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';
import type { StarredMessagesData } from '@/features/savedLibrary/starTypes';
import type { TimelineHierarchyData } from '@/features/timeline/hierarchyTypes';

import {
  type ExtensionFake,
  GeminiPage,
  SURFACE,
  dotFor,
  installExtension,
  installLayout,
  longPress,
  openLevelMenu,
  settle,
  starredDotLabels,
} from '../timeline/__tests__/geminiTimelineHarness';

vi.mock('webextension-polyfill', async () =>
  (await import('../timeline/__tests__/geminiTimelineHarness')).polyfillMock(),
);

const OFFICIAL = 'voyager.gemini-timeline';
const LOCAL = 'local.me.shared-rail';
const OTHER = 'local.me.zz-second-rail';
const CSS = 'local.me.page-style';
const CID = 'gemini:conv:shared';
const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const CATALOG_KEY = `${StorageKeys.CATALOG_TIMELINE_HIERARCHY_PREFIX}gemini`;
const TURNS = [
  { prompt: 'Shared first question', serverId: FIRST },
  { prompt: 'Shared second question', serverId: SECOND },
  { prompt: 'Shared third question', serverId: 'cccccccccccccccc' },
];
let ext: ExtensionFake;
let host: PluginHost | null;
let admission: OfficialAdmissionController;
let cleanup: CleanupManager;
let coreStops: Array<() => void>;
let restoreLayout: () => void;
let releaseRead: (() => void) | undefined;
let releaseDisposer: (() => void) | undefined;

async function flush(): Promise<void> {
  for (let round = 0; round < 80; round++) await Promise.resolve();
}

async function manifest(id = LOCAL, matches = ['https://gemini.google.com/*']) {
  const { EFFECTIVE_PLUGIN_ENGINE_VERSION } = await import('@/features/plugins/verbs/contracts');
  return {
    id,
    name: 'Shared Gemini rail',
    version: '1.0.0',
    description: 'Use Gemini stars and levels with the shared rail',
    author: 'Me',
    category: 'productivity',
    license: 'MIT',
    engine: `>=${EFFECTIVE_PLUGIN_ENGINE_VERSION}`,
    tier: 'declarative',
    matches,
    contributes: {
      settings: {
        timelineStyle: {
          type: 'select',
          label: 'Style',
          default: 'dots',
          options: [{ value: 'dots', label: 'Dots' }],
        },
        markerLevel: { type: 'boolean', label: 'Levels', default: true },
      },
      domOps: [{ op: 'native', handler: 'turnNavigator', params: { dataBackend: 'shared' } }],
    },
  };
}

async function install(id = LOCAL): Promise<void> {
  const { importLocalPlugin } = await import('@/features/plugins/local/localPluginImport');
  const { enableLocalPluginIfUnchanged } =
    await import('@/features/plugins/local/localPluginStore');
  const result = await importLocalPlugin(await manifest(id));
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  expect(await enableLocalPluginIfUnchanged(result.manifest)).toBe('enabled');
}

async function setEnabled(id: string, enabled: boolean): Promise<void> {
  const { setPluginEnabled } = await import('@/features/plugins/storage/pluginState');
  await setPluginEnabled(id, enabled);
  await settle();
}

async function startCore(): Promise<void> {
  const historyService = await import('../timestamp/historyTimestampPageService');
  const messageService = await import('../timestamp/messageTimestampPageService');
  coreStops.push(historyService.startHistoryTimestampPageService());
  coreStops.push(messageService.startMessageTimestampPageService());
  await flush();
}

async function admit(): Promise<void> {
  const { createGeminiBuiltinStartup } = await import('../geminiBuiltinStartup');
  await createGeminiBuiltinStartup(admission, cleanup).startTimeline();
  admission.close();
  await settle();
}

async function startHost(url = location.href): Promise<void> {
  const { createOfficialAdmission } = await import('@/features/plugins/runtime/officialAdmission');
  const { BuiltinPluginSource } = await import('@/features/plugins/sources/BuiltinPluginSource');
  const { LocalPluginSource } = await import('@/features/plugins/local/LocalPluginSource');
  const { PluginHost } = await import('@/features/plugins/runtime/PluginHost');
  const { registerBuiltinNativeHandlers } = await import('../pluginNativeRegistration');
  admission = createOfficialAdmission();
  registerBuiltinNativeHandlers();
  host = new PluginHost({
    url,
    sources: [new BuiltinPluginSource(), new LocalPluginSource()],
    admission,
    doc: document,
    isTopFrame: true,
    requestCatalogRefresh: () => {},
  });
  await host.start();
  await flush();
}

function status(id: string) {
  return host!.getStatuses().find((item) => item.id === id);
}

function nativeData() {
  return {
    stars: ext.read<StarredMessagesData>('local', StorageKeys.SAVED_LIBRARY_STARS),
    hierarchy: ext.read<TimelineHierarchyData>('local', StorageKeys.TIMELINE_HIERARCHY),
    catalog: ext.read('local', CATALOG_KEY),
  };
}

function holdRead(key: string): () => boolean {
  const original = chrome.storage.local.get as unknown as (
    keys?: unknown,
    callback?: (items: Record<string, unknown>) => void,
  ) => Promise<Record<string, unknown>>;
  let held = false;
  vi.spyOn(chrome.storage.local, 'get').mockImplementation(((
    keys: unknown,
    callback?: (items: Record<string, unknown>) => void,
  ) => {
    const targets =
      typeof keys === 'string'
        ? [keys]
        : Array.isArray(keys)
          ? keys
          : Object.keys((keys ?? {}) as object);
    if (held || !targets.includes(key)) return original(keys, callback);
    held = true;
    return original(keys).then(
      (snapshot) =>
        new Promise<Record<string, unknown>>((resolve) => {
          releaseRead = () => {
            callback?.(snapshot);
            resolve(snapshot);
          };
        }),
    );
  }) as typeof chrome.storage.local.get);
  return () => held;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  history.replaceState({}, '', '/app/shared');
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-environment');
  localStorage.clear();
  ext = installExtension();
  restoreLayout = installLayout();
  host = null;
  cleanup = new CleanupManager();
  coreStops = [];
  releaseRead = undefined;
  releaseDisposer = undefined;
  ext.seed('sync', {
    [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false,
    [StorageKeys.TIMELINE_MARKER_LEVEL]: true,
    geminiTimelineStyle: 'dots',
  });
  ext.seed('local', {
    [StorageKeys.SAVED_LIBRARY_STARS]: {
      messages: {
        [CID]: [
          {
            turnId: `s-${SECOND}`,
            content: TURNS[1].prompt,
            conversationId: CID,
            conversationUrl: location.href,
            starredAt: 1,
          },
        ],
      },
    },
    [StorageKeys.TIMELINE_HIERARCHY]: {
      conversations: {
        [CID]: {
          conversationUrl: location.href,
          levels: { [`s-${SECOND}`]: 2 },
          collapsed: [],
          updatedAt: 1,
        },
      },
    },
    [CATALOG_KEY]: { untouched: 'catalog data must not become Gemini storage' },
  });
  new GeminiPage(TURNS);
});

afterEach(async () => {
  host?.stop();
  releaseRead?.();
  releaseDisposer?.();
  cleanup.executeCleanups();
  coreStops.reverse().forEach((stop) => stop());
  await settle();
  restoreLayout();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-environment');
});

describe('local Gemini timeline consumes the same data through the real plugin host', () => {
  it('official off hands the rail to local; local edits survive official reopen without catalog writes', async () => {
    await install();
    await startHost();
    await startCore();
    await admit();
    expect(status(OFFICIAL)?.kind).toBe('mounted');
    expect(status(LOCAL)).toMatchObject({
      kind: 'blocked',
      blockedReason: 'conflict',
      blockedBy: OFFICIAL,
    });
    expect(document.querySelectorAll(SURFACE.bar)).toHaveLength(1);
    const catalog = nativeData().catalog;

    ext.external('sync', { [StorageKeys.GV_TIMELINE_ENABLED]: false });
    await settle();
    expect(status(LOCAL)?.kind).toBe('mounted');
    expect(starredDotLabels()).toEqual([TURNS[1].prompt]);
    expect(dotFor(TURNS[1].prompt).dataset.level).toBe('2');
    const localRail = document.querySelector(SURFACE.bar);
    ext.external('sync', { [StorageKeys.GV_TIMELINE_ENABLED]: false });
    await settle();
    expect(document.querySelector(SURFACE.bar)).toBe(localRail);

    await longPress(dotFor(TURNS[0].prompt));
    openLevelMenu(dotFor(TURNS[1].prompt))!
      .querySelector<HTMLButtonElement>('button[data-level="3"]')!
      .click();
    await settle();
    const stored = nativeData();
    expect(stored.stars?.messages[CID].map((item) => item.turnId)).toEqual(
      expect.arrayContaining([`s-${FIRST}`, `s-${SECOND}`]),
    );
    expect(stored.hierarchy?.conversations[CID]).toMatchObject({
      conversationUrl: location.href,
      levels: { [`s-${SECOND}`]: 3 },
      collapsed: [],
      updatedAt: expect.any(Number),
    });
    expect(stored.catalog).toEqual(catalog);
    await setEnabled(LOCAL, false);
    ext.external('sync', { [StorageKeys.GV_TIMELINE_ENABLED]: true });
    await settle();
    expect(status(OFFICIAL)?.kind).toBe('mounted');
    expect(document.querySelectorAll(SURFACE.bar)).toHaveLength(1);
    expect(starredDotLabels()).toEqual(expect.arrayContaining([TURNS[0].prompt, TURNS[1].prompt]));
    expect(dotFor(TURNS[1].prompt).dataset.level).toBe('3');
    expect(nativeData()).toEqual(stored);
  });

  it('a second local rail waits for the first scope’s slow release and never creates a second rail', async () => {
    ext.seed('sync', { [StorageKeys.GV_TIMELINE_ENABLED]: false });
    await install();
    await install(OTHER);
    const { turnNavigatorPrimitive } = await import('@/features/plugins/verbs/turnNavigator');
    const activate = turnNavigatorPrimitive.activate;
    let retiring = false;
    vi.spyOn(turnNavigatorPrimitive, 'activate').mockImplementation((scope, params, context) => {
      const result = activate(scope, params, context);
      if (context.pluginId === LOCAL)
        scope.effect(
          () => () =>
            new Promise<void>((resolve) => {
              retiring = true;
              releaseDisposer = resolve;
            }),
          'held rail cleanup',
        );
      return result;
    });
    await startHost();
    await startCore();
    await admit();
    expect(status(LOCAL)?.kind).toBe('mounted');
    expect(status(OTHER)).toMatchObject({
      kind: 'blocked',
      blockedReason: 'conflict',
      blockedBy: LOCAL,
    });
    await setEnabled(LOCAL, false);
    expect(retiring).toBe(true);
    expect(document.querySelector(SURFACE.bar)).toBeNull();
    expect(status(OTHER)).toMatchObject({
      kind: 'blocked',
      blockedReason: 'releasing',
      blockedBy: LOCAL,
    });
    releaseDisposer!();
    await settle();
    expect(status(OTHER)?.kind).toBe('mounted');
    expect(document.querySelectorAll(SURFACE.bar)).toHaveLength(1);
    expect(starredDotLabels()).toEqual([TURNS[1].prompt]);
  });

  it('cold local startup waits for the actual native start point and both page services', async () => {
    ext.seed('sync', { [StorageKeys.GV_TIMELINE_ENABLED]: false });
    await install();
    const before = nativeData();
    await startHost();
    await settle(5000);
    expect(status(LOCAL)?.kind).not.toBe('mounted');
    expect(document.querySelector(SURFACE.bar)).toBeNull();
    expect(nativeData()).toEqual(before);
    await startCore();
    await admit();
    expect(status(LOCAL)?.kind).toBe('mounted');
    expect(document.querySelectorAll(SURFACE.bar)).toHaveLength(1);
    expect(dotFor(TURNS[1].prompt).dataset.targetTurnId).toBe(`s-${SECOND}`);
    expect(starredDotLabels()).toEqual([TURNS[1].prompt]);
  });

  it.each([StorageKeys.GV_TURN_IDENTITY_CACHE, StorageKeys.GV_MESSAGE_TIMESTAMPS])(
    'local off while the real %s cache read is pending cannot mount a late rail or write data',
    async (key) => {
      ext.seed('sync', { [StorageKeys.GV_TIMELINE_ENABLED]: false });
      await install();
      await startHost();
      const held = holdRead(key);
      const writes = vi.spyOn(chrome.storage.local, 'set');
      const before = nativeData();
      await startCore();
      await admit();
      expect(held()).toBe(true);
      expect(document.querySelector(SURFACE.bar)).toBeNull();
      expect(nativeData()).toEqual(before);
      expect(writes.mock.calls).toEqual([]);
      await setEnabled(LOCAL, false);
      releaseRead!();
      await settle(5000);
      expect(document.querySelector(SURFACE.bar)).toBeNull();
      expect(nativeData()).toEqual(before);
      await setEnabled(LOCAL, true);
      expect(document.querySelectorAll(SURFACE.bar)).toHaveLength(1);
    },
  );

  it.each(['enterprise URL', 'enterprise DOM', 'business host', 'custom coverage'] as const)(
    '%s does not admit shared data consumers, while ordinary local CSS still runs',
    async (kind) => {
      const url =
        kind === 'business host'
          ? 'https://business.gemini.google/app/shared'
          : kind === 'enterprise URL'
            ? `${location.href}?environment=enterprise`
            : location.href;
      if (kind === 'enterprise DOM') document.documentElement.dataset.environment = 'enterprise';
      if (kind === 'custom coverage')
        ext.seed('sync', { [StorageKeys.PROMPT_CUSTOM_WEBSITES]: ['google.com'] });
      const { importLocalPlugin } = await import('@/features/plugins/local/localPluginImport');
      const { enableLocalPluginIfUnchanged } =
        await import('@/features/plugins/local/localPluginStore');
      const matches =
        kind === 'business host'
          ? ['https://business.gemini.google/*']
          : ['https://gemini.google.com/*'];
      // Previously stored records must still receive the runtime gate, even when import-time policy changes.
      const raw = await manifest(LOCAL, matches);
      ext.seed('local', {
        [StorageKeys.PLUGIN_LOCAL_MANIFESTS]: {
          [LOCAL]: { manifest: raw, importedAt: 1, updatedAt: 1 },
        },
        [StorageKeys.PLUGINS_STATE]: { [LOCAL]: { enabled: true, installedAt: 1 } },
      });
      const css = await importLocalPlugin({
        ...raw,
        id: CSS,
        contributes: {
          styles: [{ css: '.gv-local-style{color:red}' }],
          domOps: [{ op: 'addClass', target: 'body', className: 'gv-local-style' }],
        },
      });
      expect(css).toMatchObject({ ok: true });
      if (!css.ok) throw new Error(JSON.stringify(css.issues));
      expect(await enableLocalPluginIfUnchanged(css.manifest)).toBe('enabled');
      const before = nativeData();
      await startHost(url);
      const { enterInitialization } = await import('../initializationEntry');
      const entry = await enterInitialization(new URL(url), document, {
        settle: (work) => work,
        followCoverage: async () => {},
        mountEdgeNotice: async () => {},
        startEnterprisePanel: async () => {},
      });
      expect(entry).toBe(kind === 'custom coverage' ? 'custom-coverage' : 'enterprise');
      admission.close();
      await settle(5000);
      expect(status(LOCAL)?.kind).not.toBe('mounted');
      expect(document.querySelector(SURFACE.bar)).toBeNull();
      expect(nativeData()).toEqual(before);
      expect(status(CSS)?.kind).toBe('mounted');
      expect(document.body.classList.contains('gv-local-style')).toBe(true);
    },
  );
});
