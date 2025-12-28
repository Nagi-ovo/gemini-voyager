import React, { useEffect, useState, useCallback } from 'react';
import browser from 'webextension-polyfill';

import { DarkModeToggle } from '../../components/DarkModeToggle';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { useLanguage } from '../../contexts/LanguageContext';
import { useWidthAdjuster } from '../../hooks/useWidthAdjuster';

import { CloudSyncSettings } from './components/CloudSyncSettings';
import { KeyboardShortcutSettings } from './components/KeyboardShortcutSettings';
import { StarredHistory } from './components/StarredHistory';
import {
  IconChatGPT,
  IconClaude,
  IconGrok,
  IconDeepSeek,
  IconQwen,
  IconKimi,
  IconNotebookLM,
  IconMidjourney,
} from './components/WebsiteLogos';
import WidthSlider from './components/WidthSlider';

import { isSafari } from '@/core/utils/browser';
import { compareVersions } from '@/core/utils/version';

type ScrollMode = 'jump' | 'flow';

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
  legacyBaselinePx: number
) => {
  if (!Number.isFinite(value)) return fallback;
  if (value > max) {
    const approx = (value / legacyBaselinePx) * 100;
    return clampPercent(approx, min, max);
  }
  return clampPercent(value, min, max);
};

const CHAT_PERCENT = { min: 30, max: 100, defaultValue: 70, legacyBaselinePx: LEGACY_BASELINE_PX };
const EDIT_PERCENT = { min: 30, max: 100, defaultValue: 60, legacyBaselinePx: LEGACY_BASELINE_PX };
const SIDEBAR_PERCENT = { min: 15, max: 45, defaultValue: 26, legacyBaselinePx: LEGACY_BASELINE_PX };
const SIDEBAR_PX = {
  min: Math.round(pxFromPercent(SIDEBAR_PERCENT.min)),
  max: Math.round(pxFromPercent(SIDEBAR_PERCENT.max)),
  defaultValue: Math.round(pxFromPercent(SIDEBAR_PERCENT.defaultValue)),
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
  resetPosition?: boolean;
  folderEnabled?: boolean;
  hideArchivedConversations?: boolean;
  customWebsites?: string[];
  watermarkRemoverEnabled?: boolean;
}

export default function Popup() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<ScrollMode>('flow');
  const [hideContainer, setHideContainer] = useState<boolean>(false);
  const [draggableTimeline, setDraggableTimeline] = useState<boolean>(false);
  const [folderEnabled, setFolderEnabled] = useState<boolean>(true);
  const [hideArchivedConversations, setHideArchivedConversations] = useState<boolean>(false);
  const [customWebsites, setCustomWebsites] = useState<string[]>([]);
  const [newWebsiteInput, setNewWebsiteInput] = useState<string>('');
  const [websiteError, setWebsiteError] = useState<string>('');
  const [showStarredHistory, setShowStarredHistory] = useState<boolean>(false);
  const [formulaCopyFormat, setFormulaCopyFormat] = useState<'latex' | 'unicodemath' | 'no-dollar'>('latex');
  const [extVersion, setExtVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [watermarkRemoverEnabled, setWatermarkRemoverEnabled] = useState<boolean>(true);

  const handleFormulaCopyFormatChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const format = e.target.value as 'latex' | 'unicodemath' | 'no-dollar';
      setFormulaCopyFormat(format);
      try {
        chrome.storage?.sync?.set({ gvFormulaCopyFormat: format });
      } catch (err) {
        console.error('[Gemini Voyager] Failed to save formula copy format:', err);
      }
    },
    []
  );

  // Helper function to apply settings to storage
  const apply = useCallback((settings: SettingsUpdate) => {
    const payload: any = {};
    if (settings.mode) payload.geminiTimelineScrollMode = settings.mode;
    if (typeof settings.hideContainer === 'boolean') payload.geminiTimelineHideContainer = settings.hideContainer;
    if (typeof settings.draggableTimeline === 'boolean') payload.geminiTimelineDraggable = settings.draggableTimeline;
    if (typeof settings.folderEnabled === 'boolean') payload.geminiFolderEnabled = settings.folderEnabled;
    if (typeof settings.hideArchivedConversations === 'boolean') payload.geminiFolderHideArchivedConversations = settings.hideArchivedConversations;
    if (settings.resetPosition) payload.geminiTimelinePosition = null;
    if (settings.customWebsites) payload.gvPromptCustomWebsites = settings.customWebsites;
    if (typeof settings.watermarkRemoverEnabled === 'boolean') payload.geminiWatermarkRemoverEnabled = settings.watermarkRemoverEnabled;
    try {
      chrome.storage?.sync?.set(payload);
    } catch { }
  }, []);

  // Width adjuster for chat width
  const chatWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiChatWidth',
    defaultValue: CHAT_PERCENT.defaultValue,
    normalize: (v) =>
      normalizePercent(v, CHAT_PERCENT.defaultValue, CHAT_PERCENT.min, CHAT_PERCENT.max, CHAT_PERCENT.legacyBaselinePx),
    onApply: useCallback((widthPercent: number) => {
      const normalized = normalizePercent(
        widthPercent,
        CHAT_PERCENT.defaultValue,
        CHAT_PERCENT.min,
        CHAT_PERCENT.max,
        CHAT_PERCENT.legacyBaselinePx
      );
      try {
        chrome.storage?.sync?.set({ geminiChatWidth: normalized });
      } catch { }
    }, []),
  });

  // Width adjuster for edit input width
  const editInputWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiEditInputWidth',
    defaultValue: EDIT_PERCENT.defaultValue,
    normalize: (v) =>
      normalizePercent(v, EDIT_PERCENT.defaultValue, EDIT_PERCENT.min, EDIT_PERCENT.max, EDIT_PERCENT.legacyBaselinePx),
    onApply: useCallback((widthPercent: number) => {
      const normalized = normalizePercent(
        widthPercent,
        EDIT_PERCENT.defaultValue,
        EDIT_PERCENT.min,
        EDIT_PERCENT.max,
        EDIT_PERCENT.legacyBaselinePx
      );
      try {
        chrome.storage?.sync?.set({ geminiEditInputWidth: normalized });
      } catch { }
    }, []),
  });

  // Width adjuster for sidebar width (px-based UI, stored as px; content will migrate >max to %)
  const sidebarWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiSidebarWidth',
    defaultValue: SIDEBAR_PX.defaultValue,
    normalize: normalizeSidebarPx,
    onApply: useCallback((widthPx: number) => {
      const clamped = normalizeSidebarPx(widthPx);
      try {
        chrome.storage?.sync?.set({ geminiSidebarWidth: clamped });
      } catch { }
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

      try {
        const cache = await browser.storage.local.get(LATEST_VERSION_CACHE_KEY);
        const cached = cache?.[LATEST_VERSION_CACHE_KEY] as { version?: string; fetchedAt?: number } | undefined;
        const now = Date.now();

        let latest =
          cached && cached.version && cached.fetchedAt && now - cached.fetchedAt < LATEST_VERSION_MAX_AGE
            ? cached.version
            : null;

        if (!latest) {
          const resp = await fetch('https://api.github.com/repos/Nagi-ovo/gemini-voyager/releases/latest', {
            headers: { Accept: 'application/vnd.github+json' },
          });

          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }

          const data = await resp.json();
          const candidate =
            typeof data.tag_name === 'string'
              ? data.tag_name
              : (typeof data.name === 'string' ? data.name : null);

          if (candidate) {
            latest = candidate;
            await browser.storage.local.set({
              [LATEST_VERSION_CACHE_KEY]: { version: candidate, fetchedAt: now },
            });
          }
        }

        if (cancelled || !latest) return;

        setLatestVersion(latest);
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
          geminiFolderEnabled: true,
          geminiFolderHideArchivedConversations: false,
          gvPromptCustomWebsites: [],
          gvFormulaCopyFormat: 'latex',
          geminiWatermarkRemoverEnabled: true,
        },
        (res) => {
          const m = res?.geminiTimelineScrollMode as ScrollMode;
          if (m === 'jump' || m === 'flow') setMode(m);
          const format = res?.gvFormulaCopyFormat as 'latex' | 'unicodemath' | 'no-dollar';
          if (format === 'latex' || format === 'unicodemath' || format === 'no-dollar') setFormulaCopyFormat(format);
          setHideContainer(!!res?.geminiTimelineHideContainer);
          setDraggableTimeline(!!res?.geminiTimelineDraggable);
          setFolderEnabled(res?.geminiFolderEnabled !== false);
          setHideArchivedConversations(!!res?.geminiFolderHideArchivedConversations);
          setCustomWebsites(Array.isArray(res?.gvPromptCustomWebsites) ? res.gvPromptCustomWebsites : []);
          setWatermarkRemoverEnabled(res?.geminiWatermarkRemoverEnabled !== false);
        }
      );
    } catch { }
  }, []);

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

  // Add website handler
  const handleAddWebsite = useCallback(() => {
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

    const updatedWebsites = [...customWebsites, normalized];
    setCustomWebsites(updatedWebsites);
    apply({ customWebsites: updatedWebsites });
    setNewWebsiteInput('');
  }, [newWebsiteInput, customWebsites, normalizeUrl, apply, t]);

  // Remove website handler
  const handleRemoveWebsite = useCallback((website: string) => {
    const updatedWebsites = customWebsites.filter(w => w !== website);
    setCustomWebsites(updatedWebsites);
    apply({ customWebsites: updatedWebsites });
  }, [customWebsites, apply]);

  const normalizedCurrentVersion = normalizeVersionString(extVersion);
  const normalizedLatestVersion = normalizeVersionString(latestVersion);
  const hasUpdate =
    normalizedCurrentVersion && normalizedLatestVersion
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

  // Show starred history if requested
  if (showStarredHistory) {
    return <StarredHistory onClose={() => setShowStarredHistory(false)} />;
  }

  return (
    <div className="w-[360px] bg-background text-foreground">
      {/* Header */}
      <div className="bg-linear-to-br from-primary/10 via-accent/5 to-transparent border-b border-border/50 px-5 py-4 flex items-center justify-between backdrop-blur-sm">
        <h1 className="text-xl font-bold bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          {t('extName')}
        </h1>
        <div className="flex items-center gap-1">
          <DarkModeToggle />
          <LanguageSwitcher />
        </div>
      </div>

      <div className="p-5 space-y-4">
        {hasUpdate && normalizedLatestVersion && normalizedCurrentVersion && (
          <Card className="p-3 bg-amber-50 border-amber-200 text-amber-900 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-1 text-amber-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2l4 4h-3v7h-2V6H8l4-4zm6 11v6H6v-6H4v8h16v-8h-2z" />
                </svg>
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold leading-tight">{t('newVersionAvailable')}</p>
                <p className="text-xs leading-tight">
                  {t('currentVersionLabel')}: v{normalizedCurrentVersion} · {t('latestVersionLabel')}: v{normalizedLatestVersion}
                </p>
              </div>
              <a
                href={latestReleaseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-md transition-colors"
              >
                {t('updateNow')}
              </a>
            </div>
          </Card>
        )}
        {/* Gemini Only Notice */}
        <Card className="p-3 bg-primary/10 border-primary/20 hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-2">
            <svg
              width="16"
              height="16"
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
            <p className="text-xs text-primary font-medium">{t('geminiOnlyNotice')}</p>
          </div>
        </Card>
        {/* Timeline Options */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('timelineOptions')}</CardTitle>
          <CardContent className="p-0 space-y-4">
            {/* Scroll Mode */}
            <div>
              <Label className="text-sm font-medium mb-2 block">{t('scrollMode')}</Label>
              <div className="relative grid grid-cols-2 rounded-lg bg-secondary/50 p-1 gap-1">
                <div
                  className="absolute top-1 bottom-1 w-[calc(50%-6px)] rounded-md bg-primary shadow-md pointer-events-none transition-all duration-300 ease-out"
                  style={{ left: mode === 'flow' ? '4px' : 'calc(50% + 2px)' }}
                />
                <button
                  className={`relative z-10 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${mode === 'flow' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  onClick={() => {
                    setMode('flow');
                    apply({ mode: 'flow' });
                  }}
                >
                  {t('flow')}
                </button>
                <button
                  className={`relative z-10 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${mode === 'jump' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
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
            <div className="flex items-center justify-between group">
              <Label htmlFor="hide-container" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
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
            <div className="flex items-center justify-between group">
              <Label htmlFor="draggable-timeline" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
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
            {/* Reset Timeline Position Button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full group hover:border-primary/50 mt-2"
              onClick={() => {
                apply({ resetPosition: true });
              }}
            >
              <span className="group-hover:scale-105 transition-transform text-xs">{t('resetTimelinePosition')}</span>
            </Button>
            {/* View Starred History Button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full group hover:border-primary/50 mt-2"
              onClick={() => setShowStarredHistory(true)}
            >
              <span className="group-hover:scale-105 transition-transform text-xs flex items-center gap-1.5">
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
        </Card>
        {/* Folder Options */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('folderOptions')}</CardTitle>
          <CardContent className="p-0 space-y-4">
            <div className="flex items-center justify-between group">
              <Label htmlFor="folder-enabled" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
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
            <div className="flex items-center justify-between group">
              <Label htmlFor="hide-archived" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
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
          </CardContent>
        </Card>
        {/* Cloud Sync - Hidden on Safari due to API limitations */}
        {!isSafari() && <CloudSyncSettings />}
        {/* Chat Width */}
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
        />
        {/* Edit Input Width */}
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
        />

        {/* Sidebar Width */}
        <WidthSlider
          label={t('sidebarWidth')}
          value={sidebarWidthAdjuster.width}
          min={SIDEBAR_PX.min}
          max={SIDEBAR_PX.max}
          step={8}
          narrowLabel={t('sidebarWidthNarrow')}
          wideLabel={t('sidebarWidthWide')}
          valueFormatter={(v) => `${v}px`}
          onChange={sidebarWidthAdjuster.handleChange}
          onChangeComplete={sidebarWidthAdjuster.handleChangeComplete}
        />

        {/* Formula Copy Options */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('formulaCopyFormat')}</CardTitle>
          <CardContent className="p-0 space-y-3">
            <p className="text-xs text-muted-foreground mb-3">{t('formulaCopyFormatHint')}</p>
            <div className="space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="formulaCopyFormat"
                  value="latex"
                  checked={formulaCopyFormat === 'latex'}
                  onChange={handleFormulaCopyFormatChange}
                  className="w-4 h-4"
                />
                <span className="text-sm">{t('formulaCopyFormatLatex')}</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="formulaCopyFormat"
                  value="unicodemath"
                  checked={formulaCopyFormat === 'unicodemath'}
                  onChange={handleFormulaCopyFormatChange}
                  className="w-4 h-4"
                />
                <span className="text-sm">{t('formulaCopyFormatUnicodeMath')}</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="formulaCopyFormat"
                  value="no-dollar"
                  checked={formulaCopyFormat === 'no-dollar'}
                  onChange={handleFormulaCopyFormatChange}
                  className="w-4 h-4"
                />
                <span className="text-sm">{t('formulaCopyFormatNoDollar')}</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Keyboard Shortcuts */}
        <KeyboardShortcutSettings />

        {/* Prompt Manager Options */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('promptManagerOptions')}</CardTitle>
          <CardContent className="p-0 space-y-3">
            <div>
              <Label className="text-sm font-medium mb-2 block">{t('customWebsites')}</Label>
              <p className="text-xs text-muted-foreground mb-3">{t('customWebsitesHint')}</p>

              {/* Quick-select buttons for popular websites */}
              <div className="flex flex-wrap gap-1.5 mb-3">
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
                        if (isEnabled) {
                          const updated = customWebsites.filter(w => w !== domain);
                          setCustomWebsites(updated);
                          apply({ customWebsites: updated });
                        } else {
                          const updated = [...customWebsites, domain];
                          setCustomWebsites(updated);
                          apply({ customWebsites: updated });
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] font-medium transition-all flex-grow justify-center min-w-[30%] ${isEnabled
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                      title={label}
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        <Icon />
                      </span>
                      <span className="truncate">{label}</span>
                      <span className={`shrink-0 w-2.5 text-center text-[10px] transition-opacity ${isEnabled ? 'opacity-100' : 'opacity-0'}`}>
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Website List */}
              {customWebsites.length > 0 && (
                <div className="space-y-2 mb-3">
                  {customWebsites.map((website) => (
                    <div
                      key={website}
                      className="flex items-center justify-between bg-secondary/30 rounded-md px-3 py-2 group hover:bg-secondary/50 transition-colors"
                    >
                      <span className="text-sm font-mono text-foreground/90">{website}</span>
                      <button
                        onClick={() => handleRemoveWebsite(website)}
                        className="text-xs text-destructive hover:text-destructive/80 font-medium opacity-70 group-hover:opacity-100 transition-opacity"
                      >
                        {t('removeWebsite')}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Website Input */}
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    value={newWebsiteInput}
                    onChange={(e) => {
                      setNewWebsiteInput(e.target.value);
                      setWebsiteError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddWebsite();
                      }
                    }}
                    placeholder={t('customWebsitesPlaceholder')}
                    className="flex-1 min-w-0 px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                  <Button
                    onClick={handleAddWebsite}
                    size="sm"
                    className="shrink-0 whitespace-nowrap"
                  >
                    {t('addWebsite')}
                  </Button>
                </div>
                {websiteError && (
                  <p className="text-xs text-destructive">{websiteError}</p>
                )}
              </div>

              {/* Note about reloading */}
              <div className="mt-3 p-2 bg-primary/5 border border-primary/20 rounded-md">
                <p className="text-xs text-muted-foreground">{t('customWebsitesNote')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* NanoBanana Options */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('nanobananaOptions')}</CardTitle>
          <CardContent className="p-0 space-y-4">
            <div className="flex items-center justify-between group">
              <div className="flex-1">
                <Label htmlFor="watermark-remover" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
                  {t('enableNanobananaWatermarkRemover')}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">{t('nanobananaWatermarkRemoverHint')}</p>
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
        </Card>
      </div>

      {/* Footer */}
      <div className="bg-linear-to-br from-secondary/30 via-accent/10 to-transparent border-t border-border/50 px-5 py-4 flex items-center justify-between gap-3 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground/80">{t('extensionVersion')}</span>
          <a
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary hover:text-primary/80 transition-colors"
            title={extVersion ? extVersion : undefined}
          >
            {extVersion ?? '...'}
          </a>
        </div>
        <a
          href="https://github.com/Nagi-ovo/gemini-voyager"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold transition-all hover:shadow-lg hover:scale-105 active:scale-95"
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