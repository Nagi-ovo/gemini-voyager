import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '@/contexts/LanguageContext';
import { StorageKeys } from '@/core/types/common';
import { getModifierKey } from '@/core/utils/browser';
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

const browserTarget = vi.hoisted(() => ({ safari: false }));
vi.mock('@/core/utils/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/utils/browser')>()),
  isSafari: () => browserTarget.safari,
}));

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
  // With no width stored; a stored custom width is the derived case below.
  { id: OFFICIAL_PLUGIN_IDS.geminiChatWidth, key: StorageKeys.CHAT_WIDTH_ENABLED, missing: false },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
    key: StorageKeys.CHAT_FONT_SIZE_ENABLED,
    missing: false,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
    key: StorageKeys.CHAT_LINE_HEIGHT_ENABLED,
    missing: false,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiEditInputWidth,
    key: StorageKeys.EDIT_INPUT_WIDTH_ENABLED,
    missing: false,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiSidebarWidth,
    key: StorageKeys.SIDEBAR_WIDTH_ENABLED,
    missing: false,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide,
    key: StorageKeys.GV_SIDEBAR_AUTO_HIDE,
    missing: false,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide,
    key: StorageKeys.GV_SIDEBAR_FULL_HIDE,
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
  {
    id: OFFICIAL_PLUGIN_IDS.geminiInputCollapse,
    key: StorageKeys.INPUT_COLLAPSE_ENABLED,
    missing: false,
  },
  { id: OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend, key: StorageKeys.CTRL_ENTER_SEND, missing: false },
  { id: OFFICIAL_PLUGIN_IDS.geminiVimInput, key: StorageKeys.INPUT_VIM_MODE, missing: false },
  { id: OFFICIAL_PLUGIN_IDS.geminiDraftSave, key: StorageKeys.DRAFT_AUTO_SAVE, missing: false },
] as const;

/** Moved switches that only show on one site or browser, each checked on its own tab. */
const AI_STUDIO = 'https://aistudio.google.com/prompts/new_chat';

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
  'input-collapse-enabled',
  'input-collapse-when-not-empty',
  'input-vim-mode',
  'ctrl-enter-send',
  'aistudio-enter-send',
  'safari-enter-fix',
  'draft-auto-save',
  'sidebar-auto-hide',
  'sidebar-full-hide',
];

/** The old layout cards' sliders and switches, labelled by their card title. */
const RETIRED_LAYOUT_LABELS = [
  TRANSLATIONS.en.chatWidth,
  TRANSLATIONS.en.chatFontSize,
  TRANSLATIONS.en.chatLineHeight,
  TRANSLATIONS.en.chatParagraphSpacing,
  TRANSLATIONS.en.editInputWidth,
  TRANSLATIONS.en.sidebarWidth,
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
    browserTarget.safari = false;
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
  // The row's own switch; an enabled row's inline settings hold switches too.
  const toggle = (id: string) =>
    row(id)!.querySelector<HTMLInputElement>('input[aria-describedby]')!;
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
        rows: [
          OFFICIAL_PLUGIN_IDS.geminiHideInputHalo,
          OFFICIAL_PLUGIN_IDS.geminiChatWidth,
          OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
          OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
          OFFICIAL_PLUGIN_IDS.geminiEditInputWidth,
          OFFICIAL_PLUGIN_IDS.geminiSidebarWidth,
          OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide,
          OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide,
        ],
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
        rows: [
          OFFICIAL_PLUGIN_IDS.geminiPromptHistory,
          OFFICIAL_PLUGIN_IDS.geminiQuoteReply,
          OFFICIAL_PLUGIN_IDS.geminiInputCollapse,
          OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend,
          OFFICIAL_PLUGIN_IDS.geminiVimInput,
          OFFICIAL_PLUGIN_IDS.geminiDraftSave,
        ],
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
    for (const label of RETIRED_LAYOUT_LABELS) {
      expect(container.querySelector(`input[aria-label="${label}"]`), label).toBeNull();
    }
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
    [TRANSLATIONS.en.allowCollapseWhenNotEmpty, OFFICIAL_PLUGIN_IDS.geminiInputCollapse],
    ['回车', OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend],
    [TRANSLATIONS.en.inputVimMode, OFFICIAL_PLUGIN_IDS.geminiVimInput],
    [TRANSLATIONS.zh.draftAutoSave, OFFICIAL_PLUGIN_IDS.geminiDraftSave],
    ['字号', OFFICIAL_PLUGIN_IDS.geminiChatFontSize],
    ['行高', OFFICIAL_PLUGIN_IDS.geminiChatLineHeight],
    [TRANSLATIONS.en.chatParagraphSpacing, OFFICIAL_PLUGIN_IDS.geminiChatLineHeight],
    ['message width', OFFICIAL_PLUGIN_IDS.geminiChatWidth],
    ['编辑框', OFFICIAL_PLUGIN_IDS.geminiEditInputWidth],
    ['nav rail', OFFICIAL_PLUGIN_IDS.geminiSidebarWidth],
    [TRANSLATIONS.en.sidebarAutoHide, OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide],
    [TRANSLATIONS.zh.sidebarFullHide, OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide],
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
    [
      TRANSLATIONS.en.inputCollapseOptions,
      [
        OFFICIAL_PLUGIN_IDS.geminiInputCollapse,
        OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend,
        OFFICIAL_PLUGIN_IDS.geminiVimInput,
        OFFICIAL_PLUGIN_IDS.geminiDraftSave,
      ],
    ],
    [
      TRANSLATIONS.zh.inputCollapseOptions,
      [OFFICIAL_PLUGIN_IDS.geminiInputCollapse, OFFICIAL_PLUGIN_IDS.geminiVimInput],
    ],
    [TRANSLATIONS.en.chatWidth, [OFFICIAL_PLUGIN_IDS.geminiChatWidth]],
    [TRANSLATIONS.zh.chatFontSize, [OFFICIAL_PLUGIN_IDS.geminiChatFontSize]],
    [TRANSLATIONS.en.chatLineHeight, [OFFICIAL_PLUGIN_IDS.geminiChatLineHeight]],
    [TRANSLATIONS.en.editInputWidth, [OFFICIAL_PLUGIN_IDS.geminiEditInputWidth]],
    [TRANSLATIONS.zh.sidebarWidth, [OFFICIAL_PLUGIN_IDS.geminiSidebarWidth]],
    [
      TRANSLATIONS.en.sidebarAutoHide,
      [OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide, OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide],
    ],
  ])(
    'a remembered search for the old card title "%s" still shows its moved rows',
    async (query, ids) => {
      local[StorageKeys.GV_POPUP_SETTINGS_SEARCH_QUERY] = query;
      await mount();
      for (const id of ids) expect(row(id), id).not.toBeNull();
    },
  );

  it.each([
    ['missing', undefined, false],
    ['false', false, false],
    ['true', true, true],
  ] as const)(
    'on AI Studio, lists only Enter send and shows a %s stored switch as the page reads it',
    async (_label, stored, expected) => {
      extensionApi.tabs.query.mockResolvedValue([{ id: 8, url: AI_STUDIO }]);
      if (stored !== undefined) sync[StorageKeys.AISTUDIO_ENTER_SEND] = stored;
      await mount();
      expect(listedIds()).toEqual([OFFICIAL_PLUGIN_IDS.aistudioEnterSend]);
      expect(toggle(OFFICIAL_PLUGIN_IDS.aistudioEnterSend).checked).toBe(expected);
      expect(container.querySelector('#changelog-notify-badge')).not.toBeNull();
    },
  );

  it('the AI Studio Enter send switch writes only its own sync key', async () => {
    extensionApi.tabs.query.mockResolvedValue([{ id: 8, url: AI_STUDIO }]);
    await mount();
    await act(async () => toggle(OFFICIAL_PLUGIN_IDS.aistudioEnterSend).click());
    expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
      [StorageKeys.AISTUDIO_ENTER_SEND]: true,
    });
    expect(sync[StorageKeys.CTRL_ENTER_SEND]).toBeUndefined();
  });

  it('offers the Safari Enter fix only in Safari', async () => {
    await mount();
    expect(row(OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix)).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    browserTarget.safari = true;
    await mount();
    expect(listedIds()).toContain(OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix);
  });

  it.each([
    ['missing', undefined, false],
    ['false', false, false],
    ['true', true, true],
  ] as const)(
    'shows a %s stored Safari Enter fix the way the page reads it, and writes only its key',
    async (_label, stored, expected) => {
      browserTarget.safari = true;
      if (stored !== undefined) sync[StorageKeys.SAFARI_ENTER_FIX] = stored;
      await mount();
      expect(toggle(OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix).checked).toBe(expected);
      await act(async () => toggle(OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix).click());
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.SAFARI_ENTER_FIX]: !expected,
      });
    },
  );

  describe('the input collapse row', () => {
    const withContent = () =>
      row(OFFICIAL_PLUGIN_IDS.geminiInputCollapse)!.querySelector<HTMLInputElement>(
        `input[aria-label="${TRANSLATIONS.en.allowCollapseWhenNotEmpty}"]`,
      );

    it.each([
      ['missing', undefined, false],
      ['false', false, false],
      ['true', true, true],
    ] as const)(
      'shows a %s stored "collapse with content" the way the page reads it',
      async (_label, stored, expected) => {
        sync[StorageKeys.INPUT_COLLAPSE_ENABLED] = true;
        if (stored !== undefined) sync[StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY] = stored;
        await mount();
        expect(withContent()!.checked).toBe(expected);
      },
    );

    it('offers "collapse with content" only while collapse is on, keeping its stored value', async () => {
      sync[StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY] = true;
      await mount();
      expect(withContent()).toBeNull();

      await act(async () => toggle(OFFICIAL_PLUGIN_IDS.geminiInputCollapse).click());
      expect(withContent()!.checked).toBe(true);
      await act(async () => toggle(OFFICIAL_PLUGIN_IDS.geminiInputCollapse).click());
      expect(withContent()).toBeNull();
      expect(sync[StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY]).toBe(true);
      expect(extensionApi.storage.sync.set.mock.calls.map(([payload]) => payload)).toEqual([
        { [StorageKeys.INPUT_COLLAPSE_ENABLED]: true },
        { [StorageKeys.INPUT_COLLAPSE_ENABLED]: false },
      ]);
    });

    it('writes "collapse with content" at once to its old sync key, not the plugin state', async () => {
      sync[StorageKeys.INPUT_COLLAPSE_ENABLED] = true;
      await mount();
      await act(async () => withContent()!.click());
      expect(withContent()!.checked).toBe(true);
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY]: true,
      });
      expect(local[StorageKeys.PLUGINS_STATE]).toBeUndefined();
    });
  });

  describe('the appearance sliders', () => {
    const sliders = (id: string) => [
      ...row(id)!.querySelectorAll<HTMLInputElement>('input[type="range"]'),
    ];
    const slider = (id: string, label: string) =>
      sliders(id).find(
        (input) =>
          container.querySelector(`#${input.getAttribute('aria-labelledby')}`)?.textContent ===
          label,
      )!;
    const drag = (input: HTMLInputElement, value: number) => {
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const release = async (input: HTMLInputElement) => {
      await act(async () => input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    };
    const pluginStateWritten = () =>
      extensionApi.storage.local.set.mock.calls.some(([updates]) =>
        Object.hasOwn(updates as object, StorageKeys.PLUGINS_STATE),
      );

    it.each([
      [
        'a chat width of 840px (70%, the default)',
        StorageKeys.CHAT_WIDTH,
        840,
        OFFICIAL_PLUGIN_IDS.geminiChatWidth,
        false,
      ],
      [
        'a chat width of 720px (60%)',
        StorageKeys.CHAT_WIDTH,
        720,
        OFFICIAL_PLUGIN_IDS.geminiChatWidth,
        true,
      ],
      [
        'an edit input width of 720px (60%, the default)',
        StorageKeys.EDIT_INPUT_WIDTH,
        720,
        OFFICIAL_PLUGIN_IDS.geminiEditInputWidth,
        false,
      ],
      [
        'an edit input width of 80%',
        StorageKeys.EDIT_INPUT_WIDTH,
        80,
        OFFICIAL_PLUGIN_IDS.geminiEditInputWidth,
        true,
      ],
      [
        'a sidebar width of 26%',
        StorageKeys.SIDEBAR_WIDTH,
        26,
        OFFICIAL_PLUGIN_IDS.geminiSidebarWidth,
        true,
      ],
      [
        'a sidebar width of 312px (the default)',
        StorageKeys.SIDEBAR_WIDTH,
        312,
        OFFICIAL_PLUGIN_IDS.geminiSidebarWidth,
        false,
      ],
    ] as const)(
      'with no stored switch, %s reads on or off as the page does',
      async (_label, widthKey, width, id, expected) => {
        sync[widthKey] = width;
        await mount();
        expect(toggle(id).checked).toBe(expected);
        expect(extensionApi.storage.sync.set).not.toHaveBeenCalled();
      },
    );

    it('a stored off switch stays off whatever width is stored', async () => {
      sync[StorageKeys.CHAT_WIDTH] = 32;
      sync[StorageKeys.CHAT_WIDTH_ENABLED] = false;
      sync[StorageKeys.SIDEBAR_WIDTH] = 26;
      sync[StorageKeys.SIDEBAR_WIDTH_ENABLED] = false;
      await mount();
      expect(toggle(OFFICIAL_PLUGIN_IDS.geminiChatWidth).checked).toBe(false);
      expect(toggle(OFFICIAL_PLUGIN_IDS.geminiSidebarWidth).checked).toBe(false);
    });

    it('shows each slider only while its row is on, with the stored value', async () => {
      sync[StorageKeys.CHAT_FONT_SIZE] = 120;
      await mount();
      expect(sliders(OFFICIAL_PLUGIN_IDS.geminiChatFontSize)).toHaveLength(0);
      expect(sliders(OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide)).toHaveLength(0);
      await act(async () => toggle(OFFICIAL_PLUGIN_IDS.geminiChatFontSize).click());
      const fontSize = slider(OFFICIAL_PLUGIN_IDS.geminiChatFontSize, TRANSLATIONS.en.chatFontSize);
      expect(fontSize.value).toBe('120');
      expect(fontSize.getAttribute('aria-valuetext')).toBe('120%');
      await act(async () => toggle(OFFICIAL_PLUGIN_IDS.geminiChatFontSize).click());
      expect(sliders(OFFICIAL_PLUGIN_IDS.geminiChatFontSize)).toHaveLength(0);
      expect(sync[StorageKeys.CHAT_FONT_SIZE]).toBe(120);
    });

    it('saves a width on keyboard release, not on every step, to its old sync key only', async () => {
      sync[StorageKeys.CHAT_WIDTH_ENABLED] = true;
      await mount();
      const width = slider(OFFICIAL_PLUGIN_IDS.geminiChatWidth, TRANSLATIONS.en.chatWidth);
      drag(width, 85);
      expect(width.getAttribute('aria-valuetext')).toBe('85%');
      expect(extensionApi.storage.sync.set).not.toHaveBeenCalled();
      await act(async () =>
        width.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })),
      );
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.CHAT_WIDTH]: 85,
      });
      expect(pluginStateWritten()).toBe(false);
    });

    it('saves paragraph spacing apart from line height on pointer release', async () => {
      sync[StorageKeys.CHAT_LINE_HEIGHT_ENABLED] = true;
      await mount();
      const paragraph = slider(
        OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
        TRANSLATIONS.en.chatParagraphSpacing,
      );
      drag(paragraph, 20);
      expect(paragraph.getAttribute('aria-valuetext')).toBe('20px');
      expect(extensionApi.storage.sync.set).not.toHaveBeenCalled();
      await release(paragraph);
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.CHAT_PARAGRAPH_SPACING]: 20,
      });
      expect(
        slider(OFFICIAL_PLUGIN_IDS.geminiChatLineHeight, TRANSLATIONS.en.chatLineHeight).value,
      ).toBe('160');
    });

    it('a width that turned its row on keeps it on when moved back to the default', async () => {
      // No stored switch: a 60% chat width reads on, and 70% would read off again.
      sync[StorageKeys.CHAT_WIDTH] = 60;
      await mount();
      const width = slider(OFFICIAL_PLUGIN_IDS.geminiChatWidth, TRANSLATIONS.en.chatWidth);
      drag(width, 70);
      await release(width);
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.CHAT_WIDTH]: 70,
        [StorageKeys.CHAT_WIDTH_ENABLED]: true,
      });
      expect(toggle(OFFICIAL_PLUGIN_IDS.geminiChatWidth).checked).toBe(true);
    });

    it('shows a stored 26% sidebar as 312px and keeps it until a new width is picked', async () => {
      sync[StorageKeys.SIDEBAR_WIDTH] = 26;
      sync[StorageKeys.SIDEBAR_WIDTH_ENABLED] = true;
      await mount();
      const width = slider(OFFICIAL_PLUGIN_IDS.geminiSidebarWidth, TRANSLATIONS.en.sidebarWidth);
      expect(width.getAttribute('aria-valuetext')).toBe('312px');
      expect(width.value).not.toBe('180');
      // A click without a move writes nothing.
      await release(width);
      expect(extensionApi.storage.sync.set).not.toHaveBeenCalled();
      expect(sync[StorageKeys.SIDEBAR_WIDTH]).toBe(26);

      drag(width, 360);
      await release(width);
      expect(extensionApi.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
        [StorageKeys.SIDEBAR_WIDTH]: 360,
      });
    });
  });

  describe('usage hints', () => {
    const collapseHint = () =>
      TRANSLATIONS.en.inputCollapseShortcutHint.replace('{modifier}', getModifierKey());

    it.each([
      [OFFICIAL_PLUGIN_IDS.geminiInputCollapse, StorageKeys.INPUT_COLLAPSE_ENABLED, collapseHint],
      [
        OFFICIAL_PLUGIN_IDS.geminiVimInput,
        StorageKeys.INPUT_VIM_MODE,
        () => TRANSLATIONS.en.inputVimModeHint,
      ],
    ] as const)('%s shows how to use it only while on', async (id, key, hint) => {
      await mount();
      expect(row(id)!.textContent).not.toContain(hint());
      await act(async () => toggle(id).click());
      expect(sync[key]).toBe(true);
      expect(row(id)!.textContent).toContain(hint());
      expect(hint()).not.toContain('{modifier}');
    });
  });
});
