import React, { useEffect, useState, useCallback } from 'react';

import useI18n from '../../hooks/useI18n';
import { useWidthAdjuster } from '../../hooks/useWidthAdjuster';

import WidthSlider from './components/WidthSlider';

type ScrollMode = 'jump' | 'flow';

export default function Popup() {
  const { t, setLanguage, language } = useI18n();
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
    <div className="w-[320px] bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
        <h1 className="text-lg font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          {t('extName')}
        </h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Language Selector */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {t('language')}
          </label>
          <div className="mt-2">
            <select
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={language.split('-')[0]}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
        </div>
        {/* Scroll Mode */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {t('scrollMode')}
          </label>
          <div className="mt-2">
            <div className="relative grid grid-cols-2 rounded-lg bg-slate-100 dark:bg-slate-700 p-1">
              <div
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-white dark:bg-slate-600 shadow-sm pointer-events-none transition-all duration-200"
                style={{ left: mode === 'flow' ? '4px' : 'calc(50% + 4px)' }}
              />
              <button
                className={`relative z-10 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === 'flow' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'
                }`}
                onClick={() => {
                  setMode('flow');
                  apply('flow');
                }}
              >
                {t('flow')}
              </button>
              <button
                className={`relative z-10 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === 'jump' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'
                }`}
                onClick={() => {
                  setMode('jump');
                  apply('jump');
                }}
              >
                {t('jump')}
              </button>
            </div>
          </div>
        </div>
        {/* Timeline Options */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm space-y-2">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">
            Timeline Options
          </label>
          <label htmlFor="hide-container" className="flex items-center gap-3 cursor-pointer group">
            <input
              id="hide-container"
              type="checkbox"
              checked={hideContainer}
              onChange={(e) => {
                setHideContainer(e.target.checked);
                apply(null, e.target.checked);
              }}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-sm flex-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {t('hideOuterContainer')}
            </span>
          </label>
          <label htmlFor="draggable-timeline" className="flex items-center gap-3 cursor-pointer group">
            <input
              id="draggable-timeline"
              type="checkbox"
              checked={draggableTimeline}
              onChange={(e) => {
                setDraggableTimeline(e.target.checked);
                apply(null, undefined, e.target.checked);
              }}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-sm flex-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {t('draggableTimeline')}
            </span>
          </label>
        </div>
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
        <button
          className="w-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:shadow active:scale-[0.98]"
          onClick={() => {
            apply(null, undefined, undefined, true);
          }}
        >
          {t('resetPosition')}
        </button>
      </div>

      {/* Footer */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-slate-600 dark:text-slate-400">{t('starProject')}</span>
        <a
          href="https://github.com/Nagi-ovo/gemini-voyager"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white rounded-lg text-xs font-medium transition-all hover:shadow-md"
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
