import React, { useCallback, useEffect, useMemo, useState } from 'react';

import browser from 'webextension-polyfill';

import {
  type AccountPlatform,
  detectAccountPlatformFromUrl,
  getAccountIsolationStorageKey,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import type { ConversationReference, Folder } from '@/core/types/folder';
import {
  getModifierKey,
  isFirefox,
  isSafari,
  shouldShowSafariUpdateReminder,
} from '@/core/utils/browser';
import { shouldShowUpdateReminderForCurrentVersion } from '@/core/utils/updateReminder';
import { compareVersions } from '@/core/utils/version';
import {
  extractDmgDownloadUrl,
  extractLatestReleaseVersion,
  getCachedLatestVersion,
  getManifestUpdateUrl,
} from '@/pages/popup/utils/latestVersion';

import { DarkModeToggle } from '../../components/DarkModeToggle';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { useLanguage } from '../../contexts/LanguageContext';
import { useWidthAdjuster } from '../../hooks/useWidthAdjuster';
import { CloudSyncSettings } from './components/CloudSyncSettings';
import { ContextSyncSettings } from './components/ContextSyncSettings';
import { KeyboardShortcutSettings } from './components/KeyboardShortcutSettings';
import { StarredHistory } from './components/StarredHistory';
import {
  IconChatGPT,
  IconClaude,
  IconDeepSeek,
  IconGrok,
  IconKimi,
  IconMidjourney,
  IconNotebookLM,
  IconQwen,
} from './components/WebsiteLogos';
import WidthSlider from './components/WidthSlider';

type ScrollMode = 'jump' | 'flow';

/**
 * Reorderable popup section IDs — order here is the default display order.
 */
const POPUP_SECTION_IDS = [
  'cloudSync',
  'contextSync',
  'timeline',
  'folder',
  'folderSpacing',
  'folderTreeIndent',
  'chatWidth',
  'chatFontSize',
  'editInputWidth',
  'sidebarWidth',
  'sidebarBehavior',
  'visualEffect',
  'formulaCopy',
  'keyboardShortcuts',
  'inputCollapse',
  'promptManager',
  'general',
  'nanobanana',
] as const;

type PopupSectionId = (typeof POPUP_SECTION_IDS)[number];

const DEFAULT_SECTION_ORDER: readonly PopupSectionId[] = POPUP_SECTION_IDS;

const ROOT_CONVERSATIONS_ID = '__root_conversations__';

/**
 * Build a folder path string like "Parent / Child / Grandchild"
 */
function buildFolderPath(folderId: string, foldersById: Map<string, Folder>): string {
  const parts: string[] = [];
  let current = foldersById.get(folderId);
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? foldersById.get(current.parentId) : undefined;
  }
  return parts.join(' / ');
}

/**
 * Map language code to a human-readable language name for prompt instructions
 */
function getLanguageName(lang: string): string {
  const map: Record<string, string> = {
    en: 'English',
    zh: '中文',
    zh_TW: '繁體中文',
    ja: '日本語',
    ko: '한국어',
    ar: 'العربية',
    es: 'Español',
    fr: 'Français',
    pt: 'Português',
    ru: 'Русский',
  };
  return map[lang] || 'English';
}

/**
 * Format all conversations and folder structure as a prompt for AI organization.
 *
 * Key design: the output JSON should only contain INCREMENTAL changes —
 * new folders + new conversation-to-folder assignments for currently unfiled
 * conversations. Existing folders/conversations must NOT be re-emitted, so
 * a "Merge" import won't touch the user's carefully curated structure.
 */
function formatFolderStructurePrompt(
  sidebarConversations: Array<{ id: string; title: string; url: string }>,
  folderData: { folders: Folder[]; folderContents: Record<string, ConversationReference[]> },
  language: string,
): string {
  const lines: string[] = [];
  const langName = getLanguageName(language);

  // Build folder lookup
  const foldersById = new Map<string, Folder>();
  for (const folder of folderData.folders) {
    foldersById.set(folder.id, folder);
  }

  // Collect IDs of conversations already in folders
  const organizedIds = new Set<string>();
  for (const [folderId, convs] of Object.entries(folderData.folderContents)) {
    if (folderId === ROOT_CONVERSATIONS_ID) continue;
    for (const conv of convs) {
      organizedIds.add(conv.conversationId);
    }
  }

  // Section 1: Existing folder names (reference only, no conversations listed)
  const sortedFolders = [...folderData.folders].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
  });

  if (sortedFolders.length > 0) {
    lines.push('## Existing Folders (DO NOT re-create or modify)');
    lines.push('');
    for (const folder of sortedFolders) {
      const path = buildFolderPath(folder.id, foldersById);
      const convCount = (folderData.folderContents[folder.id] || []).length;
      lines.push(`- ${path}  (id: ${folder.id}, ${convCount} conversations)`);
    }
    lines.push('');
  }

  // Section 2: Unfiled conversations — these are the ones to organize
  const unfiledConvs = sidebarConversations.filter((c) => !organizedIds.has(c.id));
  if (unfiledConvs.length > 0) {
    lines.push('## Unfiled Conversations (to be organized)');
    lines.push('');
    for (const conv of unfiledConvs) {
      lines.push(`- [${conv.id}] ${conv.title} | ${conv.url}`);
    }
    lines.push('');
  }

  // Section 3: Instructions
  lines.push('## Instructions');
  lines.push('');
  lines.push(`Please respond in **${langName}** (folder names, explanations, etc.).`);
  lines.push('');
  lines.push('Organize the **unfiled conversations** above into folders. Rules:');
  lines.push('');
  lines.push(
    '1. **Do NOT re-output existing folders or their conversations.** The result will be merged (not replaced), so anything you output will be added on top of the current structure.',
  );
  lines.push(
    "2. You MAY place an unfiled conversation into an **existing folder** — just reference that folder's id in `folderContents`.",
  );
  lines.push(
    '3. You MAY create **new folders** as needed. Use a short random hex string (8 chars) as the folder id. Name them in ' +
      langName +
      '.',
  );
  lines.push(
    "4. New folders can be nested under existing folders by setting `parentId` to the existing folder's id.",
  );
  lines.push(
    '5. Each conversation must keep its original `conversationId` and `url` exactly as shown above.',
  );
  lines.push(
    '6. Only output the **incremental** JSON — new folders + new conversation assignments.',
  );
  lines.push('');
  lines.push('Output format (paste-ready for Gemini Voyager import):');
  lines.push('');
  lines.push('```json');
  lines.push('{');
  lines.push('  "format": "gemini-voyager.folders.v1",');
  lines.push(`  "exportedAt": "${new Date().toISOString()}",`);
  lines.push('  "version": "1.3.3",');
  lines.push('  "data": {');
  lines.push('    "folders": [');
  lines.push('      // ONLY new folders here (omit existing ones)');
  lines.push('      {');
  lines.push('        "id": "<8-char-hex>",');
  lines.push(`        "name": "<folder name in ${langName}>",`);
  lines.push('        "parentId": null,');
  lines.push('        "isExpanded": true,');
  lines.push('        "createdAt": <unix-ms>,');
  lines.push('        "updatedAt": <unix-ms>');
  lines.push('      }');
  lines.push('    ],');
  lines.push('    "folderContents": {');
  lines.push('      // Can reference EXISTING folder ids or NEW folder ids');
  lines.push('      "<folder-id>": [');
  lines.push('        {');
  lines.push('          "conversationId": "<id from unfiled list>",');
  lines.push('          "title": "<title>",');
  lines.push('          "url": "<url>",');
  lines.push('          "addedAt": <unix-ms>');
  lines.push('        }');
  lines.push('      ]');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push('```');

  return lines.join('\n');
}

const LEGACY_BASELINE_PX = 1200; // used to migrate old px widths to %
const pxFromPercent = (percent: number) => (percent / 100) * LEGACY_BASELINE_PX;

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const clampPercent = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const normalizePercent = (
  value: number,
  fallback: number,
  min: number,
  max: number,
  legacyBaselinePx: number,
) => {
  if (!Number.isFinite(value)) return fallback;
  if (value > max) {
    const approx = (value / legacyBaselinePx) * 100;
    return clampPercent(approx, min, max);
  }
  return clampPercent(value, min, max);
};

const FOLDER_SPACING = { min: 0, max: 16, defaultValue: 2 };
const FOLDER_TREE_INDENT = { min: -8, max: 32, defaultValue: -8 };
const CHAT_PERCENT = { min: 30, max: 100, defaultValue: 70, legacyBaselinePx: LEGACY_BASELINE_PX };
const CHAT_FONT_SIZE = { min: 80, max: 150, defaultValue: 100 };
const EDIT_PERCENT = { min: 30, max: 100, defaultValue: 60, legacyBaselinePx: LEGACY_BASELINE_PX };
const SIDEBAR_PERCENT = {
  min: 15,
  max: 45,
  defaultValue: 26,
  legacyBaselinePx: LEGACY_BASELINE_PX,
};
const SIDEBAR_PX = {
  min: Math.round(pxFromPercent(SIDEBAR_PERCENT.min)),
  max: Math.round(pxFromPercent(SIDEBAR_PERCENT.max)),
  defaultValue: Math.round(pxFromPercent(SIDEBAR_PERCENT.defaultValue)),
};
const AI_STUDIO_SIDEBAR_PX = {
  min: 240,
  max: 600,
  defaultValue: 280,
};

const clampSidebarPx = (value: number) => clampNumber(value, SIDEBAR_PX.min, SIDEBAR_PX.max);
const normalizeSidebarPx = (value: number) => {
  if (!Number.isFinite(value)) return SIDEBAR_PX.defaultValue;
  // If the stored value looks like a legacy percent, convert to px first.
  if (value <= SIDEBAR_PERCENT.max) {
    const px = pxFromPercent(value);
    return clampSidebarPx(px);
  }
  return clampSidebarPx(value);
};

const LATEST_VERSION_CACHE_KEY = 'gvLatestVersionCache';
const LATEST_VERSION_MAX_AGE = 1000 * 60 * 60 * 6; // 6 hours
const SAFARI_DMG_RETRY_AGE = 1000 * 60 * 30; // 30 min — re-check for DMG if missing

const normalizeVersionString = (version?: string | null): string | null => {
  if (!version) return null;
  const trimmed = version.trim();
  return trimmed ? trimmed.replace(/^v/i, '') : null;
};

const toReleaseTag = (version?: string | null): string | null => {
  if (!version) return null;
  const trimmed = version.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
};

interface SettingsUpdate {
  mode?: ScrollMode | null;
  hideContainer?: boolean;
  draggableTimeline?: boolean;
  timelinePreviewPinned?: boolean;
  markerLevelEnabled?: boolean;
  resetPosition?: boolean;
  folderEnabled?: boolean;
  hideArchivedConversations?: boolean;
  customWebsites?: string[];
  watermarkRemoverEnabled?: boolean;
  hidePromptManager?: boolean;
  promptInsertOnClickEnabled?: boolean;
  inputCollapseEnabled?: boolean;
  inputCollapseWhenNotEmpty?: boolean;
  tabTitleUpdateEnabled?: boolean;
  mermaidEnabled?: boolean;
  quoteReplyEnabled?: boolean;
  ctrlEnterSendEnabled?: boolean;
  draftAutoSaveEnabled?: boolean;
  sidebarAutoHideEnabled?: boolean;
  sidebarFullHideEnabled?: boolean;
  visualEffect?: 'off' | 'snow' | 'sakura' | 'rain';
  preventAutoScrollEnabled?: boolean;
  forkEnabled?: boolean;
  accountIsolationEnabled?: boolean;
  accountIsolationPlatform?: AccountPlatform;
  aiStudioEnabled?: boolean;
  showMessageTimestamps?: boolean;
  folderProjectEnabled?: boolean;
}

function SectionReorderControls({
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  moveUpLabel,
  moveDownLabel,
}: {
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  moveUpLabel: string;
  moveDownLabel: string;
}) {
  return (
    <div className="absolute -top-1 right-1 z-10 flex gap-px rounded-md opacity-0 transition-opacity group-hover/reorder:opacity-100">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMoveUp();
        }}
        disabled={isFirst}
        className="text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-sm p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={moveUpLabel}
        title={moveUpLabel}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMoveDown();
        }}
        disabled={isLast}
        className="text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-sm p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={moveDownLabel}
        title={moveDownLabel}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
}

export default function Popup() {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<ScrollMode>('flow');
  const [hideContainer, setHideContainer] = useState<boolean>(false);
  const [draggableTimeline, setDraggableTimeline] = useState<boolean>(false);
  const [timelinePreviewPinned, setTimelinePreviewPinned] = useState<boolean>(false);
  const [markerLevelEnabled, setMarkerLevelEnabled] = useState<boolean>(false);
  const [folderEnabled, setFolderEnabled] = useState<boolean>(true);
  const [hideArchivedConversations, setHideArchivedConversations] = useState<boolean>(false);
  const [customWebsites, setCustomWebsites] = useState<string[]>([]);
  const [newWebsiteInput, setNewWebsiteInput] = useState<string>('');
  const [websiteError, setWebsiteError] = useState<string>('');
  const [showStarredHistory, setShowStarredHistory] = useState<boolean>(false);
  const [formulaCopyFormat, setFormulaCopyFormat] = useState<
    'latex' | 'unicodemath' | 'no-dollar' | 'notion'
  >('latex');
  const [extVersion, setExtVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [safariDmgUrl, setSafariDmgUrl] = useState<string | null>(null);
  const [watermarkRemoverEnabled, setWatermarkRemoverEnabled] = useState<boolean>(true);
  const [hidePromptManager, setHidePromptManager] = useState<boolean>(false);
  const [promptInsertOnClickEnabled, setPromptInsertOnClickEnabled] = useState<boolean>(false);
  const [inputCollapseEnabled, setInputCollapseEnabled] = useState<boolean>(false);
  const [inputCollapseWhenNotEmpty, setInputCollapseWhenNotEmpty] = useState<boolean>(false);
  const [tabTitleUpdateEnabled, setTabTitleUpdateEnabled] = useState<boolean>(true);
  const [mermaidEnabled, setMermaidEnabled] = useState<boolean>(true);
  const [showMessageTimestamps, setShowMessageTimestamps] = useState<boolean>(false);
  const [quoteReplyEnabled, setQuoteReplyEnabled] = useState<boolean>(true);
  const [folderProjectEnabled, setFolderProjectEnabled] = useState<boolean>(false);
  const [ctrlEnterSendEnabled, setCtrlEnterSendEnabled] = useState<boolean>(false);
  const [draftAutoSaveEnabled, setDraftAutoSaveEnabled] = useState<boolean>(false);
  const [sidebarAutoHideEnabled, setSidebarAutoHideEnabled] = useState<boolean>(false);
  const [sidebarFullHideEnabled, setSidebarFullHideEnabled] = useState<boolean>(false);
  const [visualEffect, setVisualEffect] = useState<'off' | 'snow' | 'sakura' | 'rain'>('off');
  const [preventAutoScrollEnabled, setPreventAutoScrollEnabled] = useState<boolean>(false);
  const [forkEnabled, setForkEnabled] = useState<boolean>(false);
  const [chatWidthEnabled, setChatWidthEnabled] = useState<boolean>(false);
  const [chatFontSizeEnabled, setChatFontSizeEnabled] = useState<boolean>(false);
  const [editInputWidthEnabled, setEditInputWidthEnabled] = useState<boolean>(false);
  const [sidebarWidthEnabled, setSidebarWidthEnabled] = useState<boolean>(false);
  const [accountIsolationEnabledGemini, setAccountIsolationEnabledGemini] =
    useState<boolean>(false);
  const [accountIsolationEnabledAIStudio, setAccountIsolationEnabledAIStudio] =
    useState<boolean>(false);
  const [aiStudioEnabled, setAiStudioEnabled] = useState<boolean>(true);
  const [activeAccountPlatform, setActiveAccountPlatform] = useState<AccountPlatform>('gemini');
  const [aiStructureCopyStatus, setAiStructureCopyStatus] = useState<
    'idle' | 'loading' | 'copied' | 'error'
  >('idle');
  const [sectionOrder, setSectionOrder] = useState<PopupSectionId[]>([...DEFAULT_SECTION_ORDER]);

  const isAIStudio = activeAccountPlatform === 'aistudio';
  const currentIsolationPlatformLabel = isAIStudio ? t('platformAIStudio') : t('platformGemini');

  useEffect(() => {
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        const url = tabs[0]?.url || '';
        setActiveAccountPlatform(detectAccountPlatformFromUrl(url));
      })
      .catch(() => {});
  }, []);

  const handleFormulaCopyFormatChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const format = e.target.value as 'latex' | 'unicodemath' | 'no-dollar' | 'notion';
    setFormulaCopyFormat(format);
    try {
      chrome.storage?.sync?.set({ gvFormulaCopyFormat: format });
    } catch (err) {
      console.error('[Gemini Voyager] Failed to save formula copy format:', err);
    }
  }, []);

  const setSyncStorage = useCallback(async (payload: Record<string, unknown>) => {
    try {
      await browser.storage.sync.set(payload);
      return;
    } catch {
      // Fallback to chrome.* if polyfill is unavailable in this context.
    }

    await new Promise<void>((resolve) => {
      try {
        chrome.storage?.sync?.set(payload, () => resolve());
      } catch {
        resolve();
      }
    });
  }, []);

  // Helper function to apply settings to storage
  const apply = useCallback(
    (settings: SettingsUpdate) => {
      const payload: Record<string, unknown> = {};
      if (settings.mode) payload.geminiTimelineScrollMode = settings.mode;
      if (typeof settings.hideContainer === 'boolean')
        payload.geminiTimelineHideContainer = settings.hideContainer;
      if (typeof settings.draggableTimeline === 'boolean')
        payload.geminiTimelineDraggable = settings.draggableTimeline;
      if (typeof settings.timelinePreviewPinned === 'boolean')
        payload[StorageKeys.TIMELINE_PREVIEW_PINNED] = settings.timelinePreviewPinned;
      if (typeof settings.markerLevelEnabled === 'boolean')
        payload.geminiTimelineMarkerLevel = settings.markerLevelEnabled;
      if (typeof settings.folderEnabled === 'boolean')
        payload.geminiFolderEnabled = settings.folderEnabled;
      if (typeof settings.hideArchivedConversations === 'boolean')
        payload.geminiFolderHideArchivedConversations = settings.hideArchivedConversations;
      if (settings.resetPosition) payload.geminiTimelinePosition = null;
      if (settings.customWebsites) payload.gvPromptCustomWebsites = settings.customWebsites;
      if (typeof settings.watermarkRemoverEnabled === 'boolean')
        payload.geminiWatermarkRemoverEnabled = settings.watermarkRemoverEnabled;
      if (typeof settings.hidePromptManager === 'boolean')
        payload.gvHidePromptManager = settings.hidePromptManager;
      if (typeof settings.promptInsertOnClickEnabled === 'boolean')
        payload[StorageKeys.PROMPT_INSERT_ON_CLICK] = settings.promptInsertOnClickEnabled;
      if (typeof settings.inputCollapseEnabled === 'boolean')
        payload.gvInputCollapseEnabled = settings.inputCollapseEnabled;
      if (typeof settings.inputCollapseWhenNotEmpty === 'boolean')
        payload.gvInputCollapseWhenNotEmpty = settings.inputCollapseWhenNotEmpty;
      if (typeof settings.tabTitleUpdateEnabled === 'boolean')
        payload.gvTabTitleUpdateEnabled = settings.tabTitleUpdateEnabled;
      if (typeof settings.mermaidEnabled === 'boolean')
        payload.gvMermaidEnabled = settings.mermaidEnabled;
      if (typeof settings.quoteReplyEnabled === 'boolean')
        payload.gvQuoteReplyEnabled = settings.quoteReplyEnabled;
      if (typeof settings.folderProjectEnabled === 'boolean')
        payload[StorageKeys.FOLDER_PROJECT_ENABLED] = settings.folderProjectEnabled;
      if (typeof settings.ctrlEnterSendEnabled === 'boolean')
        payload.gvCtrlEnterSend = settings.ctrlEnterSendEnabled;
      if (typeof settings.draftAutoSaveEnabled === 'boolean')
        payload[StorageKeys.DRAFT_AUTO_SAVE] = settings.draftAutoSaveEnabled;
      if (typeof settings.sidebarAutoHideEnabled === 'boolean')
        payload.gvSidebarAutoHide = settings.sidebarAutoHideEnabled;
      if (typeof settings.sidebarFullHideEnabled === 'boolean')
        payload.gvSidebarFullHide = settings.sidebarFullHideEnabled;
      if (settings.visualEffect) {
        payload.gvVisualEffect = settings.visualEffect;
        // Clear legacy key
        payload.gvSnowEffect = false;
      }
      if (typeof settings.preventAutoScrollEnabled === 'boolean')
        payload.gvPreventAutoScrollEnabled = settings.preventAutoScrollEnabled;
      if (typeof settings.forkEnabled === 'boolean')
        payload[StorageKeys.FORK_ENABLED] = settings.forkEnabled;
      if (typeof settings.accountIsolationEnabled === 'boolean') {
        const isolationPlatform = settings.accountIsolationPlatform ?? activeAccountPlatform;
        payload[getAccountIsolationStorageKey(isolationPlatform)] =
          settings.accountIsolationEnabled;
      }
      if (typeof settings.aiStudioEnabled === 'boolean')
        payload[StorageKeys.GV_AISTUDIO_ENABLED] = settings.aiStudioEnabled;
      if (typeof settings.showMessageTimestamps === 'boolean')
        payload[StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS] = settings.showMessageTimestamps;
      void setSyncStorage(payload);
    },
    [activeAccountPlatform, setSyncStorage],
  );

  // Copy folder structure for AI organization
  const handleCopyFolderStructureForAI = useCallback(async () => {
    setAiStructureCopyStatus('loading');
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) {
        setAiStructureCopyStatus('error');
        return;
      }

      const response = (await browser.tabs.sendMessage(tabId, {
        type: 'gv.folders.getStructureForAI',
      })) as {
        ok: boolean;
        sidebarConversations: Array<{ id: string; title: string; url: string }>;
        folderData: { folders: Folder[]; folderContents: Record<string, ConversationReference[]> };
      };

      if (!response?.ok) {
        setAiStructureCopyStatus('error');
        return;
      }

      const { sidebarConversations, folderData } = response;
      const prompt = formatFolderStructurePrompt(sidebarConversations, folderData, language);
      await navigator.clipboard.writeText(prompt);
      setAiStructureCopyStatus('copied');
      setTimeout(() => setAiStructureCopyStatus('idle'), 2000);
    } catch {
      setAiStructureCopyStatus('error');
      setTimeout(() => setAiStructureCopyStatus('idle'), 2000);
    }
  }, [language]);

  // Width adjuster for chat width
  const chatWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiChatWidth',
    defaultValue: CHAT_PERCENT.defaultValue,
    normalize: (v) =>
      normalizePercent(
        v,
        CHAT_PERCENT.defaultValue,
        CHAT_PERCENT.min,
        CHAT_PERCENT.max,
        CHAT_PERCENT.legacyBaselinePx,
      ),
    onApply: useCallback((widthPercent: number) => {
      const normalized = normalizePercent(
        widthPercent,
        CHAT_PERCENT.defaultValue,
        CHAT_PERCENT.min,
        CHAT_PERCENT.max,
        CHAT_PERCENT.legacyBaselinePx,
      );
      try {
        chrome.storage?.sync?.set({ geminiChatWidth: normalized });
      } catch {}
    }, []),
  });

  // Font size adjuster for chat messages
  const chatFontSizeAdjuster = useWidthAdjuster({
    storageKey: StorageKeys.CHAT_FONT_SIZE,
    defaultValue: CHAT_FONT_SIZE.defaultValue,
    normalize: (v) => clampNumber(v, CHAT_FONT_SIZE.min, CHAT_FONT_SIZE.max),
    onApply: useCallback((value: number) => {
      const clamped = clampNumber(value, CHAT_FONT_SIZE.min, CHAT_FONT_SIZE.max);
      try {
        chrome.storage?.sync?.set({ [StorageKeys.CHAT_FONT_SIZE]: clamped });
      } catch {}
    }, []),
  });

  // Width adjuster for edit input width
  const editInputWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiEditInputWidth',
    defaultValue: EDIT_PERCENT.defaultValue,
    normalize: (v) =>
      normalizePercent(
        v,
        EDIT_PERCENT.defaultValue,
        EDIT_PERCENT.min,
        EDIT_PERCENT.max,
        EDIT_PERCENT.legacyBaselinePx,
      ),
    onApply: useCallback((widthPercent: number) => {
      const normalized = normalizePercent(
        widthPercent,
        EDIT_PERCENT.defaultValue,
        EDIT_PERCENT.min,
        EDIT_PERCENT.max,
        EDIT_PERCENT.legacyBaselinePx,
      );
      try {
        chrome.storage?.sync?.set({ geminiEditInputWidth: normalized });
      } catch {}
    }, []),
  });

  // Width adjuster for sidebar width (Context-aware: Gemini vs AI Studio)
  const sidebarConfig = useMemo(
    () =>
      isAIStudio
        ? {
            key: 'gvAIStudioSidebarWidth',
            min: AI_STUDIO_SIDEBAR_PX.min,
            max: AI_STUDIO_SIDEBAR_PX.max,
            def: AI_STUDIO_SIDEBAR_PX.defaultValue,
            norm: (v: number) => clampNumber(v, AI_STUDIO_SIDEBAR_PX.min, AI_STUDIO_SIDEBAR_PX.max),
          }
        : {
            key: 'geminiSidebarWidth',
            min: SIDEBAR_PX.min,
            max: SIDEBAR_PX.max,
            def: SIDEBAR_PX.defaultValue,
            norm: normalizeSidebarPx,
          },
    [isAIStudio],
  );

  const sidebarWidthAdjuster = useWidthAdjuster({
    storageKey: sidebarConfig.key,
    defaultValue: sidebarConfig.def,
    normalize: sidebarConfig.norm,
    onApply: useCallback(
      (widthPx: number) => {
        const clamped = sidebarConfig.norm(widthPx);
        try {
          chrome.storage?.sync?.set({ [sidebarConfig.key]: clamped });
        } catch {}
      },
      [sidebarConfig],
    ),
  });

  // Folder spacing adjuster (Context-aware: Gemini vs AI Studio)
  const folderSpacingKey = isAIStudio ? 'gvAIStudioFolderSpacing' : 'gvFolderSpacing';

  const folderSpacingAdjuster = useWidthAdjuster({
    storageKey: folderSpacingKey,
    defaultValue: FOLDER_SPACING.defaultValue,
    normalize: (v) => clampNumber(v, FOLDER_SPACING.min, FOLDER_SPACING.max),
    onApply: useCallback(
      (spacing: number) => {
        const clamped = clampNumber(spacing, FOLDER_SPACING.min, FOLDER_SPACING.max);
        try {
          chrome.storage?.sync?.set({ [folderSpacingKey]: clamped });
        } catch {}
      },
      [folderSpacingKey],
    ),
  });

  const folderTreeIndentAdjuster = useWidthAdjuster({
    storageKey: 'gvFolderTreeIndent',
    defaultValue: FOLDER_TREE_INDENT.defaultValue,
    normalize: (v) => clampNumber(v, FOLDER_TREE_INDENT.min, FOLDER_TREE_INDENT.max),
    onApply: useCallback((indent: number) => {
      const clamped = clampNumber(indent, FOLDER_TREE_INDENT.min, FOLDER_TREE_INDENT.max);
      try {
        chrome.storage?.sync?.set({ gvFolderTreeIndent: clamped });
      } catch {}
    }, []),
  });

  useEffect(() => {
    try {
      const version = chrome?.runtime?.getManifest?.()?.version;
      if (version) {
        setExtVersion(version);
      }
    } catch (err) {
      console.error('[Gemini Voyager] Failed to get extension version:', err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchLatestVersion = async () => {
      if (!extVersion) return;

      // Check for store installation (Chrome/Edge Web Store)
      // Store-installed extensions have an 'update_url' in the manifest.
      // We skip manual version checks for these users to rely on store auto-updates
      // and prevent confusing "new version" prompts when GitHub is ahead of the store.
      const manifest = chrome?.runtime?.getManifest?.();

      // For Safari: only skip update check if the feature is disabled (default)
      // If shouldShowSafariUpdateReminder() returns true, allow update checks
      if (isSafari() && !shouldShowSafariUpdateReminder()) {
        return;
      }

      // For other browsers: skip if they have update_url (store installation)
      if (!isSafari() && getManifestUpdateUrl(manifest)) {
        return;
      }

      try {
        const cache = await browser.storage.local.get(LATEST_VERSION_CACHE_KEY);
        const now = Date.now();

        const cachedEntry = cache?.[LATEST_VERSION_CACHE_KEY];
        let latest = getCachedLatestVersion(cachedEntry, now, LATEST_VERSION_MAX_AGE);
        let dmgUrl: string | null = null;

        if (latest && isSafari()) {
          // Try to read cached DMG URL
          if (
            typeof cachedEntry === 'object' &&
            cachedEntry !== null &&
            'dmgUrl' in cachedEntry &&
            typeof (cachedEntry as Record<string, unknown>).dmgUrl === 'string'
          ) {
            dmgUrl = (cachedEntry as Record<string, unknown>).dmgUrl as string;
          }
          // If DMG URL was not cached, re-fetch — but respect a 30 min cooldown
          // to avoid hitting GitHub API rate limits
          if (
            !dmgUrl &&
            typeof cachedEntry === 'object' &&
            cachedEntry !== null &&
            'fetchedAt' in cachedEntry &&
            typeof (cachedEntry as Record<string, unknown>).fetchedAt === 'number' &&
            now - ((cachedEntry as Record<string, unknown>).fetchedAt as number) >=
              SAFARI_DMG_RETRY_AGE
          ) {
            latest = null;
          }
        }

        if (!latest) {
          const resp = await fetch(
            'https://api.github.com/repos/Nagi-ovo/gemini-voyager/releases/latest',
            {
              headers: { Accept: 'application/vnd.github+json' },
            },
          );

          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }

          const data: unknown = await resp.json();
          const candidate = extractLatestReleaseVersion(data);

          if (candidate) {
            latest = candidate;
            const isSafariFetch = isSafari();
            if (isSafariFetch) {
              dmgUrl = extractDmgDownloadUrl(data);
            }
            await browser.storage.local.set({
              [LATEST_VERSION_CACHE_KEY]: {
                version: candidate,
                fetchedAt: now,
                ...(isSafariFetch ? { dmgUrl } : {}),
              },
            });
          }
        }

        if (cancelled || !latest) return;

        setLatestVersion(latest);
        if (isSafari()) {
          setSafariDmgUrl(dmgUrl);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[Gemini Voyager] Failed to check latest version:', error);
        }
      }
    };

    fetchLatestVersion();

    return () => {
      cancelled = true;
    };
  }, [extVersion]);

  useEffect(() => {
    try {
      chrome.storage?.sync?.get(
        {
          geminiTimelineScrollMode: 'flow',
          geminiTimelineHideContainer: false,
          geminiTimelineDraggable: false,
          [StorageKeys.TIMELINE_PREVIEW_PINNED]: false,
          geminiTimelineMarkerLevel: false,
          geminiFolderEnabled: true,
          geminiFolderHideArchivedConversations: false,
          gvPromptCustomWebsites: [],
          gvFormulaCopyFormat: 'latex',
          geminiWatermarkRemoverEnabled: true,
          gvHidePromptManager: false,
          [StorageKeys.PROMPT_INSERT_ON_CLICK]: false,
          gvInputCollapseEnabled: false,
          gvInputCollapseWhenNotEmpty: false,
          gvTabTitleUpdateEnabled: true,
          gvMermaidEnabled: true,
          gvQuoteReplyEnabled: true,
          [StorageKeys.FOLDER_PROJECT_ENABLED]: false,
          gvCtrlEnterSend: false,
          [StorageKeys.DRAFT_AUTO_SAVE]: false,
          gvSidebarAutoHide: false,
          gvSidebarFullHide: false,
          gvVisualEffect: 'off',
          gvSnowEffect: false,
          gvPreventAutoScrollEnabled: false,
          [StorageKeys.FORK_ENABLED]: false,
          [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: false,
          [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: null,
          [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO]: null,
          [StorageKeys.GV_AISTUDIO_ENABLED]: true,
          gvChatWidthEnabled: false,
          gvChatFontSizeEnabled: false,
          [StorageKeys.CHAT_FONT_SIZE]: CHAT_FONT_SIZE.defaultValue,
          gvEditInputWidthEnabled: false,
          gvSidebarWidthEnabled: false,
          geminiChatWidth: CHAT_PERCENT.defaultValue,
          geminiEditInputWidth: EDIT_PERCENT.defaultValue,
          [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false,
          [StorageKeys.GV_POPUP_SECTION_ORDER]: null,
        },
        (res) => {
          const m = res?.geminiTimelineScrollMode as ScrollMode;
          if (m === 'jump' || m === 'flow') setMode(m);
          const format = res?.gvFormulaCopyFormat as
            | 'latex'
            | 'unicodemath'
            | 'no-dollar'
            | 'notion';
          if (
            format === 'latex' ||
            format === 'unicodemath' ||
            format === 'no-dollar' ||
            format === 'notion'
          )
            setFormulaCopyFormat(format);
          setHideContainer(!!res?.geminiTimelineHideContainer);
          setDraggableTimeline(!!res?.geminiTimelineDraggable);
          setTimelinePreviewPinned(res?.[StorageKeys.TIMELINE_PREVIEW_PINNED] === true);
          setMarkerLevelEnabled(!!res?.geminiTimelineMarkerLevel);
          setFolderEnabled(res?.geminiFolderEnabled !== false);
          setHideArchivedConversations(!!res?.geminiFolderHideArchivedConversations);
          const loadedCustomWebsites = Array.isArray(res?.gvPromptCustomWebsites)
            ? res.gvPromptCustomWebsites.filter((w: unknown) => typeof w === 'string')
            : [];
          setCustomWebsites(loadedCustomWebsites);
          setWatermarkRemoverEnabled(res?.geminiWatermarkRemoverEnabled !== false);
          setHidePromptManager(!!res?.gvHidePromptManager);
          setPromptInsertOnClickEnabled(res?.[StorageKeys.PROMPT_INSERT_ON_CLICK] === true);
          setInputCollapseEnabled(res?.gvInputCollapseEnabled !== false);
          setInputCollapseWhenNotEmpty(res?.gvInputCollapseWhenNotEmpty === true);
          setTabTitleUpdateEnabled(res?.gvTabTitleUpdateEnabled !== false);
          setMermaidEnabled(res?.gvMermaidEnabled !== false);
          setQuoteReplyEnabled(res?.gvQuoteReplyEnabled !== false);
          setFolderProjectEnabled(res?.[StorageKeys.FOLDER_PROJECT_ENABLED] === true);
          setCtrlEnterSendEnabled(res?.gvCtrlEnterSend === true);
          setDraftAutoSaveEnabled(res?.[StorageKeys.DRAFT_AUTO_SAVE] === true);
          setSidebarAutoHideEnabled(res?.gvSidebarAutoHide === true);
          setSidebarFullHideEnabled(res?.gvSidebarFullHide === true);
          // Resolve visual effect: new key takes precedence over legacy boolean
          const storedVisualEffect = res?.gvVisualEffect;
          if (
            storedVisualEffect === 'snow' ||
            storedVisualEffect === 'sakura' ||
            storedVisualEffect === 'rain'
          ) {
            setVisualEffect(storedVisualEffect);
          } else if (res?.gvSnowEffect === true) {
            setVisualEffect('snow');
          } else {
            setVisualEffect('off');
          }
          setPreventAutoScrollEnabled(res?.gvPreventAutoScrollEnabled === true);
          setForkEnabled(res?.[StorageKeys.FORK_ENABLED] === true);
          setAiStudioEnabled(res?.[StorageKeys.GV_AISTUDIO_ENABLED] !== false);

          // Width enabled flags — auto-enable if user previously customized the width
          setChatWidthEnabled(
            res?.gvChatWidthEnabled === true ||
              (res?.gvChatWidthEnabled === false &&
                typeof res?.geminiChatWidth === 'number' &&
                res.geminiChatWidth !== CHAT_PERCENT.defaultValue),
          );
          setChatFontSizeEnabled(res?.gvChatFontSizeEnabled === true);
          setEditInputWidthEnabled(
            res?.gvEditInputWidthEnabled === true ||
              (res?.gvEditInputWidthEnabled === false &&
                typeof res?.geminiEditInputWidth === 'number' &&
                res.geminiEditInputWidth !== EDIT_PERCENT.defaultValue),
          );
          setSidebarWidthEnabled(res?.gvSidebarWidthEnabled === true);

          const legacyIsolationEnabled = res?.[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] === true;
          const geminiIsolationRaw = res?.[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI];
          const aiStudioIsolationRaw = res?.[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO];
          setAccountIsolationEnabledGemini(
            typeof geminiIsolationRaw === 'boolean' ? geminiIsolationRaw : legacyIsolationEnabled,
          );
          setAccountIsolationEnabledAIStudio(
            typeof aiStudioIsolationRaw === 'boolean'
              ? aiStudioIsolationRaw
              : legacyIsolationEnabled,
          );

          // Timestamp settings
          setShowMessageTimestamps(res?.[StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS] === true);

          // Section order
          const storedOrder = res?.[StorageKeys.GV_POPUP_SECTION_ORDER];
          if (Array.isArray(storedOrder)) {
            const validIds = new Set<string>(POPUP_SECTION_IDS);
            const filtered = storedOrder.filter(
              (id: unknown): id is PopupSectionId => typeof id === 'string' && validIds.has(id),
            );
            const seen = new Set(filtered);
            const missing = POPUP_SECTION_IDS.filter((id) => !seen.has(id));
            setSectionOrder([...filtered, ...missing]);
          }

          // Reconcile stored custom websites with actual granted permissions.
          // If the user denied a permission request, the popup may have closed before we could revert storage.
          void (async () => {
            if (!loadedCustomWebsites.length) return;
            if (!browser.permissions?.contains) return;

            const hasAnyPermission = async (domain: string) => {
              try {
                const normalized = domain
                  .trim()
                  .toLowerCase()
                  .replace(/^https?:\/\//, '')
                  .replace(/^www\./, '')
                  .replace(/\/.*$/, '')
                  .replace(/^\*\./, '');
                if (!normalized) return false;

                const origins = [`https://*.${normalized}/*`, `http://*.${normalized}/*`];
                for (const origin of origins) {
                  if (await browser.permissions.contains({ origins: [origin] })) return true;
                }
                return false;
              } catch {
                return true; // fail open to avoid destructive cleanup on unexpected errors
              }
            };

            const filtered = (
              await Promise.all(
                loadedCustomWebsites.map(async (domain: string) => ({
                  domain,
                  ok: await hasAnyPermission(domain),
                })),
              )
            )
              .filter((item) => item.ok)
              .map((item) => item.domain);

            if (filtered.length !== loadedCustomWebsites.length) {
              setCustomWebsites(filtered);
              await setSyncStorage({ gvPromptCustomWebsites: filtered });
            }
          })();
        },
      );
    } catch {}
  }, [setSyncStorage]);

  // Validate and normalize URL
  const normalizeUrl = useCallback((url: string): string | null => {
    try {
      let normalized = url.trim().toLowerCase();

      // Remove protocol if present
      normalized = normalized.replace(/^https?:\/\//, '');

      // Remove trailing slash
      normalized = normalized.replace(/\/$/, '');

      // Remove www. prefix
      normalized = normalized.replace(/^www\./, '');

      // Basic validation: must contain at least one dot and valid characters
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
        return null;
      }

      return normalized;
    } catch {
      return null;
    }
  }, []);

  const originPatternsForDomain = useCallback((domain: string): string[] | null => {
    try {
      const normalized = domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
        .replace(/^\*\./, '');
      if (!normalized) return null;
      return [`https://*.${normalized}/*`, `http://*.${normalized}/*`];
    } catch {
      return null;
    }
  }, []);

  const requestCustomWebsitePermission = useCallback(
    async (domain: string): Promise<boolean> => {
      const originPatterns = originPatternsForDomain(domain);
      if (!originPatterns) {
        setWebsiteError(t('invalidUrl'));
        return false;
      }

      if (!browser.permissions?.request || !browser.permissions?.contains) {
        setWebsiteError(t('permissionRequestFailed'));
        return false;
      }

      try {
        // Firefox requires permissions.request to run directly from a user gesture.
        // Avoid awaiting other extension APIs before this call in Firefox.
        if (!isFirefox()) {
          const alreadyGranted = await browser.permissions.contains({ origins: originPatterns });
          if (alreadyGranted) return true;
        }

        const granted = await browser.permissions.request({ origins: originPatterns });
        if (!granted) {
          setWebsiteError(t('permissionDenied'));
        }
        return granted;
      } catch (err) {
        console.error('[Gemini Voyager] Failed to request permissions for custom website:', err);
        setWebsiteError(t('permissionRequestFailed'));
        return false;
      }
    },
    [originPatternsForDomain, t],
  );

  const revokeCustomWebsitePermission = useCallback(
    async (domain: string) => {
      const originPatterns = originPatternsForDomain(domain);
      if (!originPatterns || !browser.permissions?.remove) return;

      try {
        await browser.permissions.remove({ origins: originPatterns });
      } catch (err) {
        console.warn('[Gemini Voyager] Failed to revoke permission for', domain, err);
      }
    },
    [originPatternsForDomain],
  );

  // Add website handler
  const handleAddWebsite = useCallback(async () => {
    setWebsiteError('');

    if (!newWebsiteInput.trim()) {
      return;
    }

    const normalized = normalizeUrl(newWebsiteInput);

    if (!normalized) {
      setWebsiteError(t('invalidUrl'));
      return;
    }

    // Check if already exists
    if (customWebsites.includes(normalized)) {
      setWebsiteError(t('invalidUrl'));
      return;
    }

    if (isFirefox()) {
      const granted = await requestCustomWebsitePermission(normalized);
      if (!granted) return;

      const updatedWebsites = [...customWebsites, normalized];
      setCustomWebsites(updatedWebsites);
      await setSyncStorage({ gvPromptCustomWebsites: updatedWebsites });
      setNewWebsiteInput('');
      return;
    }

    // Persist the user's selection first on non-Firefox browsers.
    // Popup may close during the permission prompt.
    const updatedWebsites = [...customWebsites, normalized];
    setCustomWebsites(updatedWebsites);
    await setSyncStorage({ gvPromptCustomWebsites: updatedWebsites });
    setNewWebsiteInput('');

    const granted = await requestCustomWebsitePermission(normalized);
    if (!granted) {
      setCustomWebsites(customWebsites);
      await setSyncStorage({ gvPromptCustomWebsites: customWebsites });
    }
  }, [
    newWebsiteInput,
    customWebsites,
    normalizeUrl,
    t,
    requestCustomWebsitePermission,
    setSyncStorage,
  ]);

  // Remove website handler
  const handleRemoveWebsite = useCallback(
    async (website: string) => {
      const updatedWebsites = customWebsites.filter((w) => w !== website);
      setCustomWebsites(updatedWebsites);
      await setSyncStorage({ gvPromptCustomWebsites: updatedWebsites });
      await revokeCustomWebsitePermission(website);
    },
    [customWebsites, revokeCustomWebsitePermission, setSyncStorage],
  );

  const toggleQuickWebsite = useCallback(
    async (domain: string, isEnabled: boolean) => {
      if (isEnabled) {
        const updated = customWebsites.filter((w) => w !== domain);
        setCustomWebsites(updated);
        await setSyncStorage({ gvPromptCustomWebsites: updated });
        await revokeCustomWebsitePermission(domain);
        return;
      }

      if (isFirefox()) {
        const granted = await requestCustomWebsitePermission(domain);
        if (!granted) return;

        const updated = [...customWebsites, domain];
        setCustomWebsites(updated);
        await setSyncStorage({ gvPromptCustomWebsites: updated });
        return;
      }

      // Persist the user's selection first on non-Firefox browsers.
      // Popup may close during the permission prompt.
      const updated = [...customWebsites, domain];
      setCustomWebsites(updated);
      await setSyncStorage({ gvPromptCustomWebsites: updated });

      const granted = await requestCustomWebsitePermission(domain);
      if (!granted) {
        setCustomWebsites(customWebsites);
        await setSyncStorage({ gvPromptCustomWebsites: customWebsites });
      }
    },
    [customWebsites, requestCustomWebsitePermission, revokeCustomWebsitePermission, setSyncStorage],
  );

  const normalizedCurrentVersion = normalizeVersionString(extVersion);
  const normalizedLatestVersion = normalizeVersionString(latestVersion);
  const isSafariBrowser = isSafari();
  const safariUpdateReminderEnabled = isSafariBrowser && shouldShowSafariUpdateReminder();
  const shouldShowUpdateNotification = shouldShowUpdateReminderForCurrentVersion({
    currentVersion: normalizedCurrentVersion,
    isSafariBrowser,
    safariReminderEnabled: safariUpdateReminderEnabled,
  });
  const hasUpdate =
    shouldShowUpdateNotification && normalizedCurrentVersion && normalizedLatestVersion
      ? compareVersions(normalizedLatestVersion, normalizedCurrentVersion) > 0
      : false;
  const latestReleaseTag = toReleaseTag(latestVersion ?? normalizedLatestVersion ?? undefined);
  const latestReleaseUrl = latestReleaseTag
    ? `https://github.com/Nagi-ovo/gemini-voyager/releases/tag/${latestReleaseTag}`
    : 'https://github.com/Nagi-ovo/gemini-voyager/releases/latest';
  const currentReleaseTag = toReleaseTag(extVersion);
  const releaseUrl = extVersion
    ? `https://github.com/Nagi-ovo/gemini-voyager/releases/tag/${currentReleaseTag ?? `v${extVersion}`}`
    : 'https://github.com/Nagi-ovo/gemini-voyager/releases';

  const websiteUrl =
    language === 'zh' ? 'https://voyager.nagi.fun' : `https://voyager.nagi.fun/${language}`;

  // ── Section reorder helpers ──────────────────────────────────
  const isSectionVisible = (id: PopupSectionId): boolean => {
    switch (id) {
      case 'cloudSync':
      case 'nanobanana':
        return !isSafariBrowser;
      case 'folderTreeIndent':
      case 'sidebarBehavior':
      case 'visualEffect':
        return !isAIStudio;
      default:
        return true;
    }
  };

  const visibleSections = sectionOrder.filter(isSectionVisible);

  const moveSectionInOrder = (sectionId: PopupSectionId, direction: 'up' | 'down') => {
    setSectionOrder((prev) => {
      const idx = prev.indexOf(sectionId);
      if (idx === -1) return prev;

      const step = direction === 'up' ? -1 : 1;
      let swapIdx = idx + step;
      // Skip hidden sections so the swap targets the next visible one
      while (swapIdx >= 0 && swapIdx < prev.length && !isSectionVisible(prev[swapIdx])) {
        swapIdx += step;
      }
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;

      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      void setSyncStorage({ [StorageKeys.GV_POPUP_SECTION_ORDER]: next });
      return next;
    });
  };

  const wrapSection = (id: PopupSectionId, content: React.ReactNode) => (
    <div key={id} style={{ order: sectionOrder.indexOf(id) }} className="group/reorder relative">
      <SectionReorderControls
        isFirst={visibleSections[0] === id}
        isLast={visibleSections[visibleSections.length - 1] === id}
        onMoveUp={() => moveSectionInOrder(id, 'up')}
        onMoveDown={() => moveSectionInOrder(id, 'down')}
        moveUpLabel={t('moveSectionUp')}
        moveDownLabel={t('moveSectionDown')}
      />
      {content}
    </div>
  );

  // Show starred history if requested
  if (showStarredHistory) {
    return <StarredHistory onClose={() => setShowStarredHistory(false)} />;
  }

  return (
    <div className="bg-background text-foreground w-[360px]">
      {/* Header */}
      <div className="border-border/50 flex items-center justify-between border-b px-5 py-5">
        <h1 className="text-primary text-2xl font-extrabold tracking-tight">{t('extName')}</h1>
        <div className="flex items-center gap-1">
          <DarkModeToggle />
          <LanguageSwitcher />
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {hasUpdate && normalizedLatestVersion && normalizedCurrentVersion && (
          <Card
            style={{ order: -2 }}
            className="border-amber-200 bg-amber-50 p-3 text-amber-900 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 text-amber-600">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 2l4 4h-3v7h-2V6H8l4-4zm6 11v6H6v-6H4v8h16v-8h-2z" />
                </svg>
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm leading-tight font-semibold">{t('newVersionAvailable')}</p>
                <p className="text-xs leading-tight">
                  {t('currentVersionLabel')}: v{normalizedCurrentVersion} ·{' '}
                  {t('latestVersionLabel')}: v{normalizedLatestVersion}
                </p>
              </div>
              {isSafariBrowser ? (
                safariDmgUrl ? (
                  <a
                    href={safariDmgUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200"
                  >
                    {t('updateNow')}
                  </a>
                ) : (
                  <span className="shrink-0 text-xs leading-tight text-amber-700">
                    {t('safariUpdateNotSynced')}
                  </span>
                )
              ) : (
                <a
                  href={latestReleaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200"
                >
                  {t('updateNow')}
                </a>
              )}
            </div>
          </Card>
        )}
        {/* AI Studio master toggle - only shown when on AI Studio */}
        {isAIStudio && (
          <Card
            style={{ order: -1 }}
            className="border-primary/20 p-4 transition-all hover:shadow-md"
          >
            <CardContent className="p-0">
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="aistudio-enabled"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('enableOnAIStudio')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">{t('enableOnAIStudioHint')}</p>
                </div>
                <Switch
                  id="aistudio-enabled"
                  checked={aiStudioEnabled}
                  onChange={(e) => {
                    setAiStudioEnabled(e.target.checked);
                    apply({ aiStudioEnabled: e.target.checked });
                  }}
                />
              </div>
            </CardContent>
          </Card>
        )}
        {/* Cloud Sync */}
        {!isSafariBrowser && wrapSection('cloudSync', <CloudSyncSettings />)}
        {/* Context Sync */}
        {wrapSection('contextSync', <ContextSyncSettings />)}
        {/* Timeline Options */}
        {wrapSection(
          'timeline',
          <Card className="p-4 transition-all hover:shadow-md">
            <CardTitle className="mb-4">{t('timelineOptions')}</CardTitle>
            <CardContent className="space-y-4 p-0">
              {/* Scroll Mode */}
              <div>
                <Label className="mb-2 block text-sm font-medium">{t('scrollMode')}</Label>
                <div className="bg-secondary/60 relative grid grid-cols-2 gap-1 rounded-xl p-1">
                  <div
                    className="bg-primary pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-sm transition-all duration-300 ease-out"
                    style={{ left: mode === 'flow' ? '4px' : 'calc(50% + 2px)' }}
                  />
                  <button
                    className={`relative z-10 rounded-lg px-3 py-2 text-sm font-bold transition-all duration-200 ${
                      mode === 'flow'
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => {
                      setMode('flow');
                      apply({ mode: 'flow' });
                    }}
                  >
                    {t('flow')}
                  </button>
                  <button
                    className={`relative z-10 rounded-lg px-3 py-2 text-sm font-bold transition-all duration-200 ${
                      mode === 'jump'
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => {
                      setMode('jump');
                      apply({ mode: 'jump' });
                    }}
                  >
                    {t('jump')}
                  </button>
                </div>
              </div>
              <div className="group flex items-center justify-between">
                <Label
                  htmlFor="hide-container"
                  className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                >
                  {t('hideOuterContainer')}
                </Label>
                <Switch
                  id="hide-container"
                  checked={hideContainer}
                  onChange={(e) => {
                    setHideContainer(e.target.checked);
                    apply({ hideContainer: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <Label
                  htmlFor="draggable-timeline"
                  className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                >
                  {t('draggableTimeline')}
                </Label>
                <Switch
                  id="draggable-timeline"
                  checked={draggableTimeline}
                  onChange={(e) => {
                    setDraggableTimeline(e.target.checked);
                    apply({ draggableTimeline: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="timeline-preview-pinned"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('pinTimelinePreview')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('pinTimelinePreviewHint')}
                  </p>
                </div>
                <Switch
                  id="timeline-preview-pinned"
                  checked={timelinePreviewPinned}
                  onChange={(e) => {
                    setTimelinePreviewPinned(e.target.checked);
                    apply({ timelinePreviewPinned: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="prevent-auto-scroll"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('preventAutoScroll')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">{t('preventAutoScrollHint')}</p>
                </div>
                <Switch
                  id="prevent-auto-scroll"
                  checked={preventAutoScrollEnabled}
                  onChange={(e) => {
                    setPreventAutoScrollEnabled(e.target.checked);
                    apply({ preventAutoScrollEnabled: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="marker-level-enabled"
                    className="group-hover:text-primary flex cursor-pointer items-center gap-1 text-sm font-medium transition-colors"
                  >
                    {t('enableMarkerLevel')}
                    <span
                      className="material-symbols-outlined cursor-help text-[16px] leading-none opacity-50 transition-opacity hover:opacity-100"
                      title={t('experimentalLabel')}
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
                    >
                      experiment
                    </span>
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">{t('enableMarkerLevelHint')}</p>
                </div>
                <Switch
                  id="marker-level-enabled"
                  checked={markerLevelEnabled}
                  onChange={(e) => {
                    setMarkerLevelEnabled(e.target.checked);
                    apply({ markerLevelEnabled: e.target.checked });
                  }}
                />
              </div>
              {/* Message Timestamps */}
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="show-message-timestamps"
                    className="group-hover:text-primary flex cursor-pointer items-center gap-1 text-sm font-medium transition-colors"
                  >
                    {t('showMessageTimestamps')}
                    <span
                      className="material-symbols-outlined cursor-help text-[16px] leading-none opacity-50 transition-opacity hover:opacity-100"
                      title={t('experimentalLabel')}
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
                    >
                      experiment
                    </span>
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('showMessageTimestampsHint')}
                  </p>
                </div>
                <Switch
                  id="show-message-timestamps"
                  checked={showMessageTimestamps}
                  onChange={(e) => {
                    setShowMessageTimestamps(e.target.checked);
                    apply({ showMessageTimestamps: e.target.checked });
                  }}
                />
              </div>
              {/* Reset Timeline Position Button */}
              <Button
                variant="outline"
                size="sm"
                className="group hover:border-primary/50 mt-2 w-full"
                onClick={() => {
                  apply({ resetPosition: true });
                }}
              >
                <span className="text-xs transition-transform group-hover:scale-105">
                  {t('resetTimelinePosition')}
                </span>
              </Button>
              {/* View Starred History Button */}
              <Button
                variant="outline"
                size="sm"
                className="group hover:border-primary/50 mt-2 w-full"
                onClick={() => setShowStarredHistory(true)}
              >
                <span className="flex items-center gap-1.5 text-xs transition-transform group-hover:scale-105">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-primary"
                  >
                    <path
                      d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                      fill="currentColor"
                    />
                  </svg>
                  {t('viewStarredHistory')}
                </span>
              </Button>
            </CardContent>
          </Card>,
        )}
        {/* Folder Options */}
        {wrapSection(
          'folder',
          <Card className="p-4 transition-all hover:shadow-md">
            <CardTitle className="mb-4">{t('folderOptions')}</CardTitle>
            <CardContent className="space-y-4 p-0">
              <div className="group flex items-center justify-between">
                <Label
                  htmlFor="folder-enabled"
                  className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                >
                  {t('enableFolderFeature')}
                </Label>
                <Switch
                  id="folder-enabled"
                  checked={folderEnabled}
                  onChange={(e) => {
                    setFolderEnabled(e.target.checked);
                    apply({ folderEnabled: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <Label
                  htmlFor="hide-archived"
                  className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                >
                  {t('hideArchivedConversations')}
                </Label>
                <Switch
                  id="hide-archived"
                  checked={hideArchivedConversations}
                  onChange={(e) => {
                    setHideArchivedConversations(e.target.checked);
                    apply({ hideArchivedConversations: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="fork-enabled"
                    className="group-hover:text-primary flex cursor-pointer items-center gap-1 text-sm font-medium transition-colors"
                  >
                    {t('enableForkFeature')}
                    <span
                      className="material-symbols-outlined cursor-help text-[16px] leading-none opacity-50 transition-opacity hover:opacity-100"
                      title={t('experimentalLabel')}
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
                    >
                      experiment
                    </span>
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">{t('enableForkFeatureHint')}</p>
                </div>
                <Switch
                  id="fork-enabled"
                  checked={forkEnabled}
                  onChange={(e) => {
                    setForkEnabled(e.target.checked);
                    apply({ forkEnabled: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="account-isolation-enabled"
                    className="group-hover:text-primary flex cursor-pointer items-center gap-1 text-sm font-medium transition-colors"
                  >
                    {t('enableAccountIsolation')}
                    <span
                      className="material-symbols-outlined cursor-help text-[16px] leading-none opacity-50 transition-opacity hover:opacity-100"
                      title={t('experimentalLabel')}
                      style={{
                        fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20",
                      }}
                    >
                      experiment
                    </span>
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('enableAccountIsolationHint')}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{t('currentPlatform')}:</span>
                    <span className="bg-secondary text-foreground rounded px-1.5 py-0.5 font-medium">
                      {currentIsolationPlatformLabel}
                    </span>
                  </div>
                </div>
                <Switch
                  id="account-isolation-enabled"
                  checked={
                    isAIStudio ? accountIsolationEnabledAIStudio : accountIsolationEnabledGemini
                  }
                  onChange={(e) => {
                    if (isAIStudio) {
                      setAccountIsolationEnabledAIStudio(e.target.checked);
                    } else {
                      setAccountIsolationEnabledGemini(e.target.checked);
                    }
                    apply({
                      accountIsolationEnabled: e.target.checked,
                      accountIsolationPlatform: activeAccountPlatform,
                    });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="folder-project-enabled"
                    className="group-hover:text-primary flex cursor-pointer items-center gap-1 text-sm font-medium transition-colors"
                  >
                    {t('folderAsProject_enable')}
                    <span
                      className="material-symbols-outlined cursor-help text-[16px] leading-none opacity-50 transition-opacity hover:opacity-100"
                      title={t('experimentalLabel')}
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
                    >
                      experiment
                    </span>
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('folderAsProject_description')}
                  </p>
                </div>
                <Switch
                  id="folder-project-enabled"
                  checked={folderProjectEnabled}
                  onChange={(e) => {
                    setFolderProjectEnabled(e.target.checked);
                    apply({ folderProjectEnabled: e.target.checked });
                  }}
                />
              </div>
              {/* Copy folder structure for AI organization */}
              <div className="border-border/50 border-t pt-3">
                <Button
                  variant="outline"
                  className="w-full text-sm"
                  onClick={handleCopyFolderStructureForAI}
                  disabled={aiStructureCopyStatus === 'loading'}
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <span
                      className="material-symbols-outlined translate-y-px text-[16px] leading-none"
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
                    >
                      {aiStructureCopyStatus === 'copied' ? 'check' : 'content_copy'}
                    </span>
                    <span className="leading-5">
                      {aiStructureCopyStatus === 'copied'
                        ? t('aiOrgCopied')
                        : aiStructureCopyStatus === 'error'
                          ? t('aiOrgError')
                          : t('aiOrgCopyButton')}
                    </span>
                  </span>
                </Button>
                <p className="text-muted-foreground mt-1.5 text-center text-[11px] leading-tight">
                  {t('aiOrgCopyHint')}
                </p>
              </div>
            </CardContent>
          </Card>,
        )}
        {/* Folder Spacing */}
        {wrapSection(
          'folderSpacing',
          <WidthSlider
            label={t('folderSpacing')}
            value={folderSpacingAdjuster.width}
            min={FOLDER_SPACING.min}
            max={FOLDER_SPACING.max}
            step={1}
            narrowLabel={t('folderSpacingCompact')}
            wideLabel={t('folderSpacingSpacious')}
            valueFormatter={(v) => `${v}px`}
            onChange={folderSpacingAdjuster.handleChange}
            onChangeComplete={folderSpacingAdjuster.handleChangeComplete}
          />,
        )}
        {!isAIStudio &&
          wrapSection(
            'folderTreeIndent',
            <WidthSlider
              label={t('folderTreeIndent')}
              value={folderTreeIndentAdjuster.width}
              min={FOLDER_TREE_INDENT.min}
              max={FOLDER_TREE_INDENT.max}
              step={1}
              narrowLabel={t('folderTreeIndentCompact')}
              wideLabel={t('folderTreeIndentSpacious')}
              valueFormatter={(v) => `${v}px`}
              onChange={folderTreeIndentAdjuster.handleChange}
              onChangeComplete={folderTreeIndentAdjuster.handleChangeComplete}
            />,
          )}
        {/* Chat Width */}
        {wrapSection(
          'chatWidth',
          <WidthSlider
            label={t('chatWidth')}
            value={chatWidthAdjuster.width}
            min={CHAT_PERCENT.min}
            max={CHAT_PERCENT.max}
            step={1}
            narrowLabel={t('chatWidthNarrow')}
            wideLabel={t('chatWidthWide')}
            onChange={chatWidthAdjuster.handleChange}
            onChangeComplete={chatWidthAdjuster.handleChangeComplete}
            enabled={chatWidthEnabled}
            onToggle={(v) => {
              setChatWidthEnabled(v);
              try {
                chrome.storage?.sync?.set({ gvChatWidthEnabled: v });
              } catch {}
            }}
          />,
        )}
        {/* Chat Font Size */}
        {wrapSection(
          'chatFontSize',
          <WidthSlider
            label={t('chatFontSize')}
            value={chatFontSizeAdjuster.width}
            min={CHAT_FONT_SIZE.min}
            max={CHAT_FONT_SIZE.max}
            step={5}
            narrowLabel={t('chatFontSizeSmall')}
            wideLabel={t('chatFontSizeLarge')}
            onChange={chatFontSizeAdjuster.handleChange}
            onChangeComplete={chatFontSizeAdjuster.handleChangeComplete}
            enabled={chatFontSizeEnabled}
            onToggle={(v) => {
              setChatFontSizeEnabled(v);
              try {
                chrome.storage?.sync?.set({ gvChatFontSizeEnabled: v });
              } catch {}
            }}
          />,
        )}
        {/* Edit Input Width */}
        {wrapSection(
          'editInputWidth',
          <WidthSlider
            label={t('editInputWidth')}
            value={editInputWidthAdjuster.width}
            min={EDIT_PERCENT.min}
            max={EDIT_PERCENT.max}
            step={1}
            narrowLabel={t('editInputWidthNarrow')}
            wideLabel={t('editInputWidthWide')}
            onChange={editInputWidthAdjuster.handleChange}
            onChangeComplete={editInputWidthAdjuster.handleChangeComplete}
            enabled={editInputWidthEnabled}
            onToggle={(v) => {
              setEditInputWidthEnabled(v);
              try {
                chrome.storage?.sync?.set({ gvEditInputWidthEnabled: v });
              } catch {}
            }}
          />,
        )}

        {/* Sidebar Width */}
        {wrapSection(
          'sidebarWidth',
          <WidthSlider
            label={isAIStudio ? 'AI Studio Sidebar' : t('sidebarWidth')}
            value={sidebarWidthAdjuster.width}
            min={sidebarConfig.min}
            max={sidebarConfig.max}
            step={8}
            narrowLabel={t('sidebarWidthNarrow')}
            wideLabel={t('sidebarWidthWide')}
            valueFormatter={(v) => `${v}px`}
            onChange={sidebarWidthAdjuster.handleChange}
            onChangeComplete={sidebarWidthAdjuster.handleChangeComplete}
            enabled={sidebarWidthEnabled}
            onToggle={(v) => {
              setSidebarWidthEnabled(v);
              try {
                chrome.storage?.sync?.set({ gvSidebarWidthEnabled: v });
              } catch {}
            }}
          />,
        )}

        {/* Sidebar Auto-Hide & Full-Hide - Gemini only */}
        {!isAIStudio &&
          wrapSection(
            'sidebarBehavior',
            <Card className="p-4 transition-all hover:shadow-md">
              <CardContent className="space-y-3 p-0">
                <div className="group flex items-center justify-between">
                  <div className="flex-1">
                    <Label
                      htmlFor="sidebar-auto-hide"
                      className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                    >
                      {t('sidebarAutoHide')}
                    </Label>
                    <p className="text-muted-foreground mt-1 text-xs">{t('sidebarAutoHideHint')}</p>
                  </div>
                  <Switch
                    id="sidebar-auto-hide"
                    checked={sidebarAutoHideEnabled}
                    onChange={(e) => {
                      setSidebarAutoHideEnabled(e.target.checked);
                      apply({ sidebarAutoHideEnabled: e.target.checked });
                    }}
                  />
                </div>
                <div className="group flex items-center justify-between">
                  <div className="flex-1">
                    <Label
                      htmlFor="sidebar-full-hide"
                      className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                    >
                      {t('sidebarFullHide')}
                    </Label>
                    <p className="text-muted-foreground mt-1 text-xs">{t('sidebarFullHideHint')}</p>
                  </div>
                  <Switch
                    id="sidebar-full-hide"
                    checked={sidebarFullHideEnabled}
                    onChange={(e) => {
                      setSidebarFullHideEnabled(e.target.checked);
                      apply({ sidebarFullHideEnabled: e.target.checked });
                    }}
                  />
                </div>
              </CardContent>
            </Card>,
          )}

        {/* Visual Effect - Gemini only */}
        {!isAIStudio &&
          wrapSection(
            'visualEffect',
            <Card className="p-4 transition-all hover:shadow-md">
              <CardContent className="p-0">
                <div className="flex-1">
                  <Label className="text-sm font-medium">{t('visualEffect')}</Label>
                  <p className="text-muted-foreground mt-1 text-xs">{t('visualEffectHint')}</p>
                </div>
                <div className="bg-secondary/60 mt-3 flex items-center gap-0.5 rounded-full p-1">
                  {(
                    [
                      {
                        value: 'off' as const,
                        label: t('visualEffectOff'),
                        icon: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                          </svg>
                        ),
                      },
                      {
                        value: 'snow' as const,
                        label: t('visualEffectSnow'),
                        icon: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="12" y1="2" x2="12" y2="22" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
                            <line x1="12" y1="2" x2="14.5" y2="4.5" />
                            <line x1="12" y1="2" x2="9.5" y2="4.5" />
                            <line x1="12" y1="22" x2="14.5" y2="19.5" />
                            <line x1="12" y1="22" x2="9.5" y2="19.5" />
                            <line x1="2" y1="12" x2="4.5" y2="9.5" />
                            <line x1="2" y1="12" x2="4.5" y2="14.5" />
                            <line x1="22" y1="12" x2="19.5" y2="9.5" />
                            <line x1="22" y1="12" x2="19.5" y2="14.5" />
                          </svg>
                        ),
                      },
                      {
                        value: 'sakura' as const,
                        label: t('visualEffectSakura'),
                        icon: (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <g transform="translate(12,12)">
                              {[0, 72, 144, 216, 288].map((deg) => (
                                <ellipse
                                  key={deg}
                                  cx="0"
                                  cy="-6"
                                  rx="2.8"
                                  ry="5.5"
                                  transform={`rotate(${deg})`}
                                  opacity="0.85"
                                />
                              ))}
                              <circle cx="0" cy="0" r="2" opacity="0.6" />
                            </g>
                          </svg>
                        ),
                      },
                      {
                        value: 'rain' as const,
                        label: t('visualEffectRain'),
                        icon: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <line x1="8" y1="3" x2="6.5" y2="10" />
                            <line x1="14" y1="2" x2="12.5" y2="9" />
                            <line x1="20" y1="4" x2="18.5" y2="11" />
                            <line x1="5" y1="12" x2="3.5" y2="19" />
                            <line x1="11" y1="11" x2="9.5" y2="18" />
                            <line x1="17" y1="13" x2="15.5" y2="20" />
                          </svg>
                        ),
                      },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setVisualEffect(option.value);
                        apply({ visualEffect: option.value });
                      }}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-bold transition-all duration-200 ${
                        visualEffect === option.value
                          ? 'bg-background text-foreground shadow-md'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>,
          )}

        {/* Formula Copy Options */}
        {wrapSection(
          'formulaCopy',
          <Card className="p-4 transition-all hover:shadow-md">
            <CardTitle className="mb-4">{t('formulaCopyFormat')}</CardTitle>
            <CardContent className="space-y-3 p-0">
              <p className="text-muted-foreground mb-3 text-xs">{t('formulaCopyFormatHint')}</p>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center space-x-3">
                  <input
                    type="radio"
                    name="formulaCopyFormat"
                    value="latex"
                    checked={formulaCopyFormat === 'latex'}
                    onChange={handleFormulaCopyFormatChange}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{t('formulaCopyFormatLatex')}</span>
                </label>
                <label className="flex cursor-pointer items-center space-x-3">
                  <input
                    type="radio"
                    name="formulaCopyFormat"
                    value="unicodemath"
                    checked={formulaCopyFormat === 'unicodemath'}
                    onChange={handleFormulaCopyFormatChange}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{t('formulaCopyFormatUnicodeMath')}</span>
                </label>
                <label className="flex cursor-pointer items-center space-x-3">
                  <input
                    type="radio"
                    name="formulaCopyFormat"
                    value="no-dollar"
                    checked={formulaCopyFormat === 'no-dollar'}
                    onChange={handleFormulaCopyFormatChange}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{t('formulaCopyFormatNoDollar')}</span>
                </label>
                <label className="flex cursor-pointer items-center space-x-3">
                  <input
                    type="radio"
                    name="formulaCopyFormat"
                    value="notion"
                    checked={formulaCopyFormat === 'notion'}
                    onChange={handleFormulaCopyFormatChange}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{t('formulaCopyFormatNotion')}</span>
                </label>
              </div>
            </CardContent>
          </Card>,
        )}

        {/* Keyboard Shortcuts */}
        {wrapSection('keyboardShortcuts', <KeyboardShortcutSettings />)}

        {/* Input Collapse Options */}
        {wrapSection(
          'inputCollapse',
          <Card className="p-4 transition-all hover:shadow-md">
            <CardTitle className="mb-4">{t('inputCollapseOptions')}</CardTitle>
            <CardContent className="space-y-4 p-0">
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="input-collapse-enabled"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('enableInputCollapse')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('enableInputCollapseHint')}{' '}
                    <span className="text-muted-foreground/70">
                      ({t('inputCollapseShortcutHint').replace('{modifier}', getModifierKey())})
                    </span>
                  </p>
                </div>
                <Switch
                  id="input-collapse-enabled"
                  checked={inputCollapseEnabled}
                  onChange={(e) => {
                    setInputCollapseEnabled(e.target.checked);
                    apply({ inputCollapseEnabled: e.target.checked });
                  }}
                />
              </div>
              {/* Second toggle - Allow collapse when not empty (only visible when first is enabled) */}
              {inputCollapseEnabled && (
                <div className="group mt-3 ml-4 flex items-center justify-between">
                  <div className="flex-1">
                    <Label
                      htmlFor="input-collapse-when-not-empty"
                      className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                    >
                      {t('allowCollapseWhenNotEmpty')}
                    </Label>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('allowCollapseWhenNotEmptyHint')}
                    </p>
                  </div>
                  <Switch
                    id="input-collapse-when-not-empty"
                    checked={inputCollapseWhenNotEmpty}
                    onChange={(e) => {
                      setInputCollapseWhenNotEmpty(e.target.checked);
                      apply({ inputCollapseWhenNotEmpty: e.target.checked });
                    }}
                  />
                </div>
              )}
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="ctrl-enter-send"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('ctrlEnterSend').replace('{modifier}', getModifierKey())}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('ctrlEnterSendHint').replace('{modifier}', getModifierKey())}
                  </p>
                </div>
                <Switch
                  id="ctrl-enter-send"
                  checked={ctrlEnterSendEnabled}
                  onChange={(e) => {
                    setCtrlEnterSendEnabled(e.target.checked);
                    apply({ ctrlEnterSendEnabled: e.target.checked });
                  }}
                />
              </div>
              {/* Draft Auto-Save */}
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="draft-auto-save"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('draftAutoSave')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">{t('draftAutoSaveHint')}</p>
                </div>
                <Switch
                  id="draft-auto-save"
                  checked={draftAutoSaveEnabled}
                  onChange={(e) => {
                    setDraftAutoSaveEnabled(e.target.checked);
                    apply({ draftAutoSaveEnabled: e.target.checked });
                  }}
                />
              </div>
            </CardContent>
          </Card>,
        )}

        {/* Prompt Manager Options */}
        {wrapSection(
          'promptManager',
          <Card className="p-4 transition-all hover:shadow-md">
            <CardTitle className="mb-4">{t('promptManagerOptions')}</CardTitle>
            <CardContent className="space-y-3 p-0">
              {/* Hide Prompt Manager Toggle */}
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="hide-prompt-manager"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('hidePromptManager')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">{t('hidePromptManagerHint')}</p>
                </div>
                <Switch
                  id="hide-prompt-manager"
                  checked={hidePromptManager}
                  onChange={(e) => {
                    setHidePromptManager(e.target.checked);
                    apply({ hidePromptManager: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="prompt-insert-on-click"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('promptInsertOnClick')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('promptInsertOnClickHint')}
                  </p>
                </div>
                <Switch
                  id="prompt-insert-on-click"
                  checked={promptInsertOnClickEnabled}
                  onChange={(e) => {
                    setPromptInsertOnClickEnabled(e.target.checked);
                    apply({ promptInsertOnClickEnabled: e.target.checked });
                  }}
                />
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium">{t('customWebsites')}</Label>
                {/* Gemini Only Notice - moved here since it's about Prompt Manager */}
                <div className="bg-primary/10 border-primary/20 mb-2 flex items-center gap-2 rounded-md border p-2">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-primary shrink-0"
                  >
                    <path
                      d="M8 1C4.13 1 1 4.13 1 8s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7zm0 11c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm1-4H7V5h2v3z"
                      fill="currentColor"
                    />
                  </svg>
                  <p className="text-primary text-xs font-medium">{t('geminiOnlyNotice')}</p>
                </div>

                {/* Quick-select buttons for popular websites */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {[
                    { domain: 'chatgpt.com', label: 'ChatGPT', Icon: IconChatGPT },
                    { domain: 'claude.ai', label: 'Claude', Icon: IconClaude },
                    { domain: 'grok.com', label: 'Grok', Icon: IconGrok },
                    { domain: 'deepseek.com', label: 'DeepSeek', Icon: IconDeepSeek },
                    { domain: 'qwen.ai', label: 'Qwen', Icon: IconQwen },
                    { domain: 'kimi.com', label: 'Kimi', Icon: IconKimi },
                    { domain: 'notebooklm.google.com', label: 'NotebookLM', Icon: IconNotebookLM },
                    { domain: 'midjourney.com', label: 'Midjourney', Icon: IconMidjourney },
                  ].map(({ domain, label, Icon }) => {
                    const isEnabled = customWebsites.includes(domain);
                    return (
                      <button
                        key={domain}
                        onClick={() => {
                          void toggleQuickWebsite(domain, isEnabled);
                        }}
                        className={`inline-flex min-w-[30%] grow items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-medium transition-all ${
                          isEnabled
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                        title={label}
                      >
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          <Icon />
                        </span>
                        <span className="truncate">{label}</span>
                        <span
                          className={`w-2.5 shrink-0 text-center text-[10px] transition-opacity ${isEnabled ? 'opacity-100' : 'opacity-0'}`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Website List */}
                {customWebsites.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {customWebsites.map((website) => (
                      <div
                        key={website}
                        className="bg-secondary/30 group hover:bg-secondary/50 flex items-center justify-between rounded-md px-3 py-2 transition-colors"
                      >
                        <span className="text-foreground/90 font-mono text-sm">{website}</span>
                        <button
                          onClick={() => {
                            void handleRemoveWebsite(website);
                          }}
                          className="text-destructive hover:text-destructive/80 text-xs font-medium opacity-70 transition-opacity group-hover:opacity-100"
                        >
                          {t('removeWebsite')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Website Input */}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newWebsiteInput}
                      onChange={(e) => {
                        setNewWebsiteInput(e.target.value);
                        setWebsiteError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void handleAddWebsite();
                        }
                      }}
                      placeholder={t('customWebsitesPlaceholder')}
                      className="bg-background border-border focus:ring-primary/50 min-w-0 flex-1 rounded-md border px-3 py-2 text-sm transition-all focus:ring-2 focus:outline-none"
                    />
                    <Button
                      onClick={() => {
                        void handleAddWebsite();
                      }}
                      size="sm"
                      className="shrink-0 whitespace-nowrap"
                    >
                      {t('addWebsite')}
                    </Button>
                  </div>
                  {websiteError && <p className="text-destructive text-xs">{websiteError}</p>}
                </div>

                {/* Note about reloading */}
                <div className="bg-primary/5 border-primary/20 mt-3 rounded-md border p-2">
                  <p className="text-muted-foreground text-xs">{t('customWebsitesNote')}</p>
                </div>
              </div>
            </CardContent>
          </Card>,
        )}

        {/* General Options */}
        {wrapSection(
          'general',
          <Card className="p-4 transition-all hover:shadow-md">
            <CardTitle className="mb-4">{t('generalOptions')}</CardTitle>
            <CardContent className="space-y-4 p-0">
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="tab-title-update"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('enableTabTitleUpdate')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('enableTabTitleUpdateHint')}
                  </p>
                </div>
                <Switch
                  id="tab-title-update"
                  checked={tabTitleUpdateEnabled}
                  onChange={(e) => {
                    setTabTitleUpdateEnabled(e.target.checked);
                    apply({ tabTitleUpdateEnabled: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="mermaid-enabled"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('enableMermaidRendering')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('enableMermaidRenderingHint')}
                  </p>
                </div>
                <Switch
                  id="mermaid-enabled"
                  checked={mermaidEnabled}
                  onChange={(e) => {
                    setMermaidEnabled(e.target.checked);
                    apply({ mermaidEnabled: e.target.checked });
                  }}
                />
              </div>
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="quote-reply-enabled"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('enableQuoteReply')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">{t('enableQuoteReplyHint')}</p>
                </div>
                <Switch
                  id="quote-reply-enabled"
                  checked={quoteReplyEnabled}
                  onChange={(e) => {
                    setQuoteReplyEnabled(e.target.checked);
                    apply({ quoteReplyEnabled: e.target.checked });
                  }}
                />
              </div>
            </CardContent>
          </Card>,
        )}

        {/* NanoBanana Options - Hidden on Safari due to fetch interceptor limitations */}
        {!isSafariBrowser &&
          wrapSection(
            'nanobanana',
            <Card className="p-4 transition-all hover:shadow-md">
              <CardTitle className="mb-4">{t('nanobananaOptions')}</CardTitle>
              <CardContent className="space-y-4 p-0">
                <div className="group flex items-center justify-between">
                  <div className="flex-1">
                    <Label
                      htmlFor="watermark-remover"
                      className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                    >
                      {t('enableNanobananaWatermarkRemover')}
                    </Label>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('nanobananaWatermarkRemoverHint')}
                    </p>
                  </div>
                  <Switch
                    id="watermark-remover"
                    checked={watermarkRemoverEnabled}
                    onChange={(e) => {
                      setWatermarkRemoverEnabled(e.target.checked);
                      apply({ watermarkRemoverEnabled: e.target.checked });
                    }}
                  />
                </div>
              </CardContent>
            </Card>,
          )}
      </div>

      {/* Footer */}
      <div className="border-border/50 flex flex-col gap-3 border-t px-5 py-4">
        <div className="flex w-full items-center justify-between">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className="text-foreground/80 font-semibold">{t('extensionVersion')}</span>
            <a
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:text-primary/80 font-semibold transition-colors"
              title={extVersion ? extVersion : undefined}
            >
              {extVersion ?? '...'}
            </a>
          </div>

          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-primary flex items-center gap-1.5 text-xs font-semibold transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            {t('officialDocs')}
          </a>
        </div>

        <a
          href="https://github.com/Nagi-ovo/gemini-voyager"
          target="_blank"
          rel="noreferrer"
          className="bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-primary/25 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold tracking-wide transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.97]"
          title={t('starProject')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>{t('starProject')}</span>
        </a>
      </div>
    </div>
  );
}
