import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '@/contexts/LanguageContext';
import { StorageKeys } from '@/core/types/common';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { TRANSLATIONS } from '@/utils/translations';

import Popup from '../../Popup';

const extensionApi = vi.hoisted(() => ({
  storage: {
    sync: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), getBytesInUse: vi.fn() },
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), getBytesInUse: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: { get: vi.fn(), query: vi.fn(), sendMessage: vi.fn(), create: vi.fn() },
  runtime: {
    id: 'test-extension-id',
    lastError: undefined as { message: string } | undefined,
    getManifest: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  permissions: { contains: vi.fn(), request: vi.fn() },
  notifications: { create: vi.fn() },
  i18n: { getUILanguage: vi.fn(() => 'en'), getMessage: vi.fn((key: string) => key) },
}));

// Keep Popup, its hooks and the packaged manifests real; replace only browser APIs.
vi.mock('webextension-polyfill', () => ({ default: extensionApi }));

function readStorage(keys: unknown, stored: Record<string, unknown>): Record<string, unknown> {
  if (typeof keys === 'string') return { [keys]: stored[keys] };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, stored[key]]));
  if (keys && typeof keys === 'object') {
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [
        key,
        Object.hasOwn(stored, key) ? stored[key] : fallback,
      ]),
    );
  }
  return { ...stored };
}

/**
 * Each moved switch, its old sync key, and whether a user who never touched it
 * sees it on. Written out, not derived from the bindings, so a changed default
 * fails here. The halo row is inverted: on means the halo is hidden.
 */
const MOVED_SWITCHES = [
  {
    id: OFFICIAL_PLUGIN_IDS.geminiHideInputHalo,
    key: StorageKeys.INPUT_HALO_HIDDEN,
    missing: false,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
    key: StorageKeys.CODE_BLOCK_COLLAPSE_ENABLED,
    missing: true,
  },
  { id: OFFICIAL_PLUGIN_IDS.geminiUserLatex, key: StorageKeys.USER_LATEX_ENABLED, missing: true },
  { id: OFFICIAL_PLUGIN_IDS.geminiMermaid, key: StorageKeys.MERMAID_ENABLED, missing: true },
  { id: OFFICIAL_PLUGIN_IDS.geminiWaveDrom, key: StorageKeys.WAVEDROM_ENABLED, missing: true },
  { id: OFFICIAL_PLUGIN_IDS.geminiECharts, key: StorageKeys.ECHARTS_ENABLED, missing: true },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiPromptHistory,
    key: StorageKeys.PROMPT_HISTORY_ENABLED,
    missing: false,
  },
  { id: OFFICIAL_PLUGIN_IDS.geminiQuoteReply, key: StorageKeys.QUOTE_REPLY_ENABLED, missing: true },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll,
    key: StorageKeys.PREVENT_AUTO_SCROLL_ENABLED,
    missing: false,
  },
  { id: OFFICIAL_PLUGIN_IDS.geminiFork, key: StorageKeys.FORK_ENABLED, missing: false },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiResearchPack,
    key: StorageKeys.RESEARCH_PACK_ENABLED,
    missing: false,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
    key: StorageKeys.DEFAULT_MODEL_AUTO_APPLY,
    missing: true,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiUsageStatus,
    key: StorageKeys.USAGE_STATUS_ENABLED,
    missing: false,
  },
] as const;

/** The switches each old card used to hold; none may render twice. */
const RETIRED_SWITCH_IDS = [
  'hide-input-halo',
  'code-block-collapse-enabled',
  'user-latex-enabled',
  'mermaid-enabled',
  'wavedrom-enabled',
  'echarts-enabled',
  'prompt-history-enabled',
  'quote-reply-enabled',
  'prevent-auto-scroll',
  'fork-enabled',
  'research-pack-enabled',
  'default-model-auto-apply',
  'usage-status-enabled',
];

describe('the official plugin list in the popup', () => {
  let container: HTMLDivElement;
  let root: Root;
  let local: Record<string, unknown>;
  let sync: Record<string, unknown>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    vi.stubGlobal('chrome', extensionApi);
    extensionApi.runtime.lastError = undefined;
    local = {};
    sync = {};
    for (const [area, stored] of [
      ['local', local],
      ['sync', sync],
    ] as const) {
      extensionApi.storage[area].get.mockImplementation((keys: unknown, callback?: unknown) => {
        const result = readStorage(keys, stored);
        if (typeof callback === 'function') callback(result);
        return Promise.resolve(result);
      });
      extensionApi.storage[area].set.mockImplementation(
        (updates: Record<string, unknown>, callback?: unknown) => {
          Object.assign(stored, updates);
          if (typeof callback === 'function') callback();
          return Promise.resolve();
        },
      );
      extensionApi.storage[area].getBytesInUse.mockResolvedValue(0);
    }
    extensionApi.runtime.getManifest.mockReturnValue({
      version: '1.8.3',
      update_url: 'https://clients2.google.com/service/update2/crx',
    });
    extensionApi.runtime.sendMessage.mockResolvedValue(undefined);
    extensionApi.tabs.query.mockResolvedValue([{ id: 7, url: 'https://gemini.google.com/app' }]);
    extensionApi.tabs.sendMessage.mockResolvedValue(undefined);
    extensionApi.permissions.contains.mockResolvedValue(false);
    extensionApi.permissions.request.mockResolvedValue(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const mount = async () => {
    await act(async () => {
      root.render(
        <LanguageProvider>
          <Popup />
        </LanguageProvider>,
      );
    });
  };

  const row = (id: string) =>
    container.querySelector<HTMLLIElement>(`[data-official-plugin="${id}"]`);
  const toggle = (id: string) => row(id)!.querySelector<HTMLInputElement>('input')!;
  const listedIds = () =>
    [...container.querySelectorAll<HTMLElement>('[data-official-plugin]')].map(
      (element) => element.dataset.officialPlugin,
    );

  it('lists every moved switch once, in four groups, and no old card repeats one', async () => {
    await mount();
    const groups = [...container.querySelectorAll<HTMLElement>('section[aria-labelledby]')]
      .filter((section) => section.querySelector('[data-official-plugin]'))
      .map((section) => ({
        heading: section.querySelector('h4')!.textContent,
        rows: [...section.querySelectorAll<HTMLElement>('[data-official-plugin]')].map(
          (element) => element.dataset.officialPlugin,
        ),
      }));
    expect(groups).toEqual([
      {
        heading: TRANSLATIONS.en.pluginGroupAppearance,
        rows: [OFFICIAL_PLUGIN_IDS.geminiHideInputHalo],
      },
      {
        heading: TRANSLATIONS.en.pluginGroupContent,
        rows: [
          OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
          OFFICIAL_PLUGIN_IDS.geminiUserLatex,
          OFFICIAL_PLUGIN_IDS.geminiMermaid,
          OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
          OFFICIAL_PLUGIN_IDS.geminiECharts,
        ],
      },
      {
        heading: TRANSLATIONS.en.pluginGroupInput,
        rows: [OFFICIAL_PLUGIN_IDS.geminiPromptHistory, OFFICIAL_PLUGIN_IDS.geminiQuoteReply],
      },
      {
        heading: TRANSLATIONS.en.pluginGroupConversation,
        rows: [
          OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll,
          OFFICIAL_PLUGIN_IDS.geminiFork,
          OFFICIAL_PLUGIN_IDS.geminiResearchPack,
          OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
          OFFICIAL_PLUGIN_IDS.geminiUsageStatus,
        ],
      },
    ]);
    expect(new Set(listedIds()).size).toBe(listedIds().length);
    for (const id of RETIRED_SWITCH_IDS) expect(container.querySelector(`#${id}`)).toBeNull();
    // The manifest name, without its site prefix, labels the switch.
    const mermaidLabel = row(OFFICIAL_PLUGIN_IDS.geminiMermaid)!.querySelector('label')!;
    expect(mermaidLabel.textContent).not.toMatch(/^Gemini/);
    expect(mermaidLabel.htmlFor).toBe(toggle(OFFICIAL_PLUGIN_IDS.geminiMermaid).id);
    expect(toggle(OFFICIAL_PLUGIN_IDS.geminiMermaid).getAttribute('aria-describedby')).toBeTruthy();
  });

  it.each([
    ['missing', undefined],
    ['false', false],
    ['true', true],
  ] as const)('shows a %s stored switch the way the page reads it', async (_label, stored) => {
    for (const { key } of MOVED_SWITCHES) {
      if (stored === undefined) delete sync[key];
      else sync[key] = stored;
    }
    await mount();
    const shown = Object.fromEntries(MOVED_SWITCHES.map(({ id }) => [id, toggle(id).checked]));
    expect(shown).toEqual(
      Object.fromEntries(MOVED_SWITCHES.map(({ id, missing }) => [id, stored ?? missing])),
    );
  });

  it('each switch writes only its old sync key and never the plugin state', async () => {
    await mount();
    for (const { id, key, missing } of MOVED_SWITCHES) {
      extensionApi.storage.sync.set.mockClear();
      await act(async () => toggle(id).click());
      expect(toggle(id).checked).toBe(!missing);
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({ [key]: !missing });
    }
    expect(sync[StorageKeys.INPUT_HALO_HIDDEN]).toBe(true);
    expect(local[StorageKeys.PLUGINS_STATE]).toBeUndefined();
    expect(
      extensionApi.storage.local.set.mock.calls.some(([updates]) =>
        Object.hasOwn(updates as object, StorageKeys.PLUGINS_STATE),
      ),
    ).toBe(false);
  });

  it('a switch whose write fails shows the stored value again', async () => {
    sync[StorageKeys.MERMAID_ENABLED] = false;
    extensionApi.storage.sync.set.mockImplementation((_updates: unknown, callback?: unknown) => {
      if (typeof callback !== 'function') return Promise.reject(new Error('quota'));
      extensionApi.runtime.lastError = { message: 'quota' };
      callback();
      extensionApi.runtime.lastError = undefined;
      return undefined;
    });
    await mount();
    await act(async () => toggle(OFFICIAL_PLUGIN_IDS.geminiMermaid).click());
    expect(toggle(OFFICIAL_PLUGIN_IDS.geminiMermaid).checked).toBe(false);
    expect(sync[StorageKeys.MERMAID_ENABLED]).toBe(false);
  });

  it.each([
    ['光晕', OFFICIAL_PLUGIN_IDS.geminiHideInputHalo],
    ['代码块', OFFICIAL_PLUGIN_IDS.geminiCodeCollapse],
    ['用量', OFFICIAL_PLUGIN_IDS.geminiUsageStatus],
    [TRANSLATIONS.en.enableQuoteReply, OFFICIAL_PLUGIN_IDS.geminiQuoteReply],
    [TRANSLATIONS.zh.enableForkFeature, OFFICIAL_PLUGIN_IDS.geminiFork],
  ])('an old search for "%s" still finds its row', async (query, id) => {
    local[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY] = query;
    await mount();
    expect(row(id)).not.toBeNull();
    // The search still filters: not every row answers.
    expect(listedIds().length).toBeLessThan(MOVED_SWITCHES.length);
  });

  it.each([
    [
      TRANSLATIONS.en.generalOptions,
      [
        OFFICIAL_PLUGIN_IDS.geminiHideInputHalo,
        OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
        OFFICIAL_PLUGIN_IDS.geminiUserLatex,
        OFFICIAL_PLUGIN_IDS.geminiMermaid,
        OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
        OFFICIAL_PLUGIN_IDS.geminiECharts,
        OFFICIAL_PLUGIN_IDS.geminiQuoteReply,
        OFFICIAL_PLUGIN_IDS.geminiResearchPack,
        OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
        OFFICIAL_PLUGIN_IDS.geminiUsageStatus,
      ],
    ],
    [TRANSLATIONS.en.folderOptions, [OFFICIAL_PLUGIN_IDS.geminiFork]],
    [TRANSLATIONS.en.promptManagerOptions, [OFFICIAL_PLUGIN_IDS.geminiPromptHistory]],
    [TRANSLATIONS.en.timelineOptions, [OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll]],
  ])(
    'a remembered search for the old card title "%s" still shows its moved rows',
    async (query, ids) => {
      local[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY] = query;
      await mount();
      for (const id of ids) expect(row(id), id).not.toBeNull();
    },
  );

  it('takes no slot on AI Studio, which has no listed plugin yet', async () => {
    extensionApi.tabs.query.mockResolvedValue([
      { id: 8, url: 'https://aistudio.google.com/prompts/new_chat' },
    ]);
    await mount();
    expect(listedIds()).toEqual([]);
    expect(container.textContent).not.toContain(TRANSLATIONS.en.pluginsNativeDescription);
    expect(container.querySelector('#changelog-notify-badge')).not.toBeNull();
  });
});
