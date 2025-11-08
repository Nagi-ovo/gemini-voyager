import React, { useEffect, useState, useCallback } from 'react';

import { DarkModeToggle } from '../../components/DarkModeToggle';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { useLanguage } from '../../contexts/LanguageContext';
import { useWidthAdjuster } from '../../hooks/useWidthAdjuster';

import WidthSlider from './components/WidthSlider';

type ScrollMode = 'jump' | 'flow';

export default function Popup() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<ScrollMode>('flow');
  const [hideContainer, setHideContainer] = useState<boolean>(false);
  const [draggableTimeline, setDraggableTimeline] = useState<boolean>(false);

  // Helper function to apply settings to storage
  const apply = useCallback((
    nextMode: ScrollMode | null,
    nextHide?: boolean,
    nextDraggable?: boolean,
    resetPosition?: boolean
  ) => {
    const payload: any = {};
    if (nextMode) payload.geminiTimelineScrollMode = nextMode;
    if (typeof nextHide === 'boolean') payload.geminiTimelineHideContainer = nextHide;
    if (typeof nextDraggable === 'boolean') payload.geminiTimelineDraggable = nextDraggable;
    if (resetPosition) payload.geminiTimelinePosition = null;
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

  useEffect(() => {
    try {
      chrome.storage?.sync?.get(
        {
          geminiTimelineScrollMode: 'flow',
          geminiTimelineHideContainer: false,
          geminiTimelineDraggable: false,
        },
        (res) => {
          const m = res?.geminiTimelineScrollMode as ScrollMode;
          if (m === 'jump' || m === 'flow') setMode(m);
          setHideContainer(!!res?.geminiTimelineHideContainer);
          setDraggableTimeline(!!res?.geminiTimelineDraggable);
        }
      );
    } catch {}
  }, []);

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
        {/* Scroll Mode */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-3 text-xs uppercase">{t('scrollMode')}</CardTitle>
          <CardContent className="p-0">
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
                  apply('flow');
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
                  apply('jump');
                }}
              >
                {t('jump')}
              </button>
            </div>
          </CardContent>
        </Card>
        {/* Timeline Options */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('timelineOptions')}</CardTitle>
          <CardContent className="p-0 space-y-4">
            <div className="flex items-center justify-between group">
              <Label htmlFor="hide-container" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
                {t('hideOuterContainer')}
              </Label>
              <Switch
                id="hide-container"
                checked={hideContainer}
                onChange={(e) => {
                  setHideContainer(e.target.checked);
                  apply(null, e.target.checked);
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
                  apply(null, undefined, e.target.checked);
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
        {/* Reset Button */}
        <Button
          variant="outline"
          className="w-full group hover:border-primary/50"
          onClick={() => {
            apply(null, undefined, undefined, true);
          }}
        >
          <span className="group-hover:scale-105 transition-transform">{t('resetPosition')}</span>
        </Button>
      </div>

      {/* Footer */}
      <div className="bg-linear-to-br from-secondary/30 via-accent/10 to-transparent border-t border-border/50 px-5 py-4 flex items-center justify-between backdrop-blur-sm">
        <span className="text-xs text-muted-foreground font-medium">{t('starProject')}</span>
        <a
          href="https://github.com/Nagi-ovo/gemini-voyager"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold transition-all hover:shadow-lg hover:scale-105 active:scale-95"
          title={t('starProject')}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>Star</span>
        </a>
      </div>
    </div>
  );
}
