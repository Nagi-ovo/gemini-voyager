import React, { useEffect, useState, useCallback } from 'react';

import { DarkModeToggle } from '../../components/DarkModeToggle';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { useLanguage } from '../../contexts/LanguageContext';
import { useWidthAdjuster } from '../../hooks/useWidthAdjuster';

import { StarredHistory } from './components/StarredHistory';
import WidthSlider from './components/WidthSlider';

type ScrollMode = 'jump' | 'flow';

interface SettingsUpdate {
  mode?: ScrollMode | null;
  hideContainer?: boolean;
  draggableTimeline?: boolean;
  resetPosition?: boolean;
  folderEnabled?: boolean;
  hideArchivedConversations?: boolean;
  customWebsites?: string[];
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
  const [formulaCopyFormat, setFormulaCopyFormat] = useState<'latex' | 'unicodemath'>('latex');

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
    try {
      chrome.storage?.sync?.set(payload);
    } catch {}
  }, []);

  // Width adjuster for chat width
  const chatWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiChatWidth',
    defaultValue: 800,
    onApply: useCallback((width: number) => {
      try {
        chrome.storage?.sync?.set({ geminiChatWidth: width });
      } catch {}
    }, []),
  });

  // Width adjuster for edit input width
  const editInputWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiEditInputWidth',
    defaultValue: 600,
    onApply: useCallback((width: number) => {
      try {
        chrome.storage?.sync?.set({ geminiEditInputWidth: width });
      } catch {}
    }, []),
  });

  // Width adjuster for sidebar width
  const sidebarWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiSidebarWidth',
    defaultValue: 310,
    onApply: useCallback((width: number) => {
      try {
        chrome.storage?.sync?.set({ geminiSidebarWidth: width });
      } catch {}
    }, []),
  });

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
        },
        (res) => {
          const m = res?.geminiTimelineScrollMode as ScrollMode;
          if (m === 'jump' || m === 'flow') setMode(m);
          const format = res?.gvFormulaCopyFormat as 'latex' | 'unicodemath';
          if (format === 'latex' || format === 'unicodemath') setFormulaCopyFormat(format);
          setHideContainer(!!res?.geminiTimelineHideContainer);
          setDraggableTimeline(!!res?.geminiTimelineDraggable);
          setFolderEnabled(res?.geminiFolderEnabled !== false);
          setHideArchivedConversations(!!res?.geminiFolderHideArchivedConversations);
          setCustomWebsites(Array.isArray(res?.gvPromptCustomWebsites) ? res.gvPromptCustomWebsites : []);
        }
      );
    } catch {}
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
                  className={`relative z-10 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
                    mode === 'flow' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => {
                    setMode('flow');
                    apply({ mode: 'flow' });
                  }}
                >
                  {t('flow')}
                </button>
                <button
                  className={`relative z-10 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
                    mode === 'jump' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
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
        {/* Chat Width */}
        <WidthSlider
          label={t('chatWidth')}
          value={chatWidthAdjuster.width}
          min={400}
          max={1400}
          step={50}
          narrowLabel={t('chatWidthNarrow')}
          wideLabel={t('chatWidthWide')}
          onChange={chatWidthAdjuster.handleChange}
          onChangeComplete={chatWidthAdjuster.handleChangeComplete}
        />
        {/* Edit Input Width */}
        <WidthSlider
          label={t('editInputWidth')}
          value={editInputWidthAdjuster.width}
          min={400}
          max={1200}
          step={50}
          narrowLabel={t('editInputWidthNarrow')}
          wideLabel={t('editInputWidthWide')}
          onChange={editInputWidthAdjuster.handleChange}
          onChangeComplete={editInputWidthAdjuster.handleChangeComplete}
        />
        
        {/* Sidebar Width */}
        <WidthSlider
          label={t('sidebarWidth')}
          value={sidebarWidthAdjuster.width}
          min={240}
          max={520}
          step={5}
          narrowLabel={t('sidebarWidthNarrow')}
          wideLabel={t('sidebarWidthWide')}
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
                  onChange={(e) => {
                    const format = e.target.value as 'latex' | 'unicodemath';
                    setFormulaCopyFormat(format);
                    try {
                      chrome.storage?.sync?.set({ gvFormulaCopyFormat: format });
                    } catch {}
                  }}
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
                  onChange={(e) => {
                    const format = e.target.value as 'latex' | 'unicodemath';
                    setFormulaCopyFormat(format);
                    try {
                      chrome.storage?.sync?.set({ gvFormulaCopyFormat: format });
                    } catch {}
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm">{t('formulaCopyFormatUnicodeMath')}</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Prompt Manager Options */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('promptManagerOptions')}</CardTitle>
          <CardContent className="p-0 space-y-3">
            <div>
              <Label className="text-sm font-medium mb-2 block">{t('customWebsites')}</Label>
              <p className="text-xs text-muted-foreground mb-3">{t('customWebsitesHint')}</p>
              
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
                <div className="flex gap-2">
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
                    className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                  <Button
                    onClick={handleAddWebsite}
                    size="sm"
                    className="shrink-0"
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
      </div>

      {/* Footer */}
      <div className="bg-linear-to-br from-secondary/30 via-accent/10 to-transparent border-t border-border/50 px-5 py-4 flex items-center justify-center backdrop-blur-sm">
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