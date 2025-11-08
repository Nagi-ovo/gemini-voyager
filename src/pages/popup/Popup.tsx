import React, { useEffect, useState, useRef } from 'react';

import useI18n from '../../hooks/useI18n';

type ScrollMode = 'jump' | 'flow';

export default function Popup() {
  const { t, setLanguage, language } = useI18n();
  const [mode, setMode] = useState<ScrollMode>('flow');
  const [hideContainer, setHideContainer] = useState<boolean>(false);
  const [draggableTimeline, setDraggableTimeline] = useState<boolean>(false);
  const [chatWidth, setChatWidth] = useState<number>(800);
  const [editInputWidth, setEditInputWidth] = useState<number>(600);
  const chatWidthDebounceTimer = useRef<number | null>(null);
  const pendingChatWidth = useRef<number | null>(null);
  const editInputWidthDebounceTimer = useRef<number | null>(null);
  const pendingEditInputWidth = useRef<number | null>(null);

  useEffect(() => {
    try {
      chrome.storage?.sync?.get(
        {
          geminiTimelineScrollMode: 'flow',
          geminiTimelineHideContainer: false,
          geminiTimelineDraggable: false,
          geminiChatWidth: 800,
          geminiEditInputWidth: 600,
        },
        (res) => {
          const m = res?.geminiTimelineScrollMode as ScrollMode;
          if (m === 'jump' || m === 'flow') setMode(m);
          setHideContainer(!!res?.geminiTimelineHideContainer);
          setDraggableTimeline(!!res?.geminiTimelineDraggable);
          setChatWidth(res?.geminiChatWidth || 800);
          setEditInputWidth(res?.geminiEditInputWidth || 600);
        }
      );
    } catch {}
  }, []);

  // Cleanup and save pending changes on unmount
  useEffect(() => {
    return () => {
      if (chatWidthDebounceTimer.current !== null) {
        clearTimeout(chatWidthDebounceTimer.current);
      }
      if (editInputWidthDebounceTimer.current !== null) {
        clearTimeout(editInputWidthDebounceTimer.current);
      }
      // Save any pending width changes before unmount
      if (pendingChatWidth.current !== null) {
        apply(null, undefined, undefined, undefined, pendingChatWidth.current);
      }
      if (pendingEditInputWidth.current !== null) {
        apply(null, undefined, undefined, undefined, undefined, pendingEditInputWidth.current);
      }
    };
  }, []);

  const apply = (
    nextMode: ScrollMode | null,
    nextHide?: boolean,
    nextDraggable?: boolean,
    resetPosition?: boolean,
    nextChatWidth?: number,
    nextEditInputWidth?: number
  ) => {
    const payload: any = {};
    if (nextMode) payload.geminiTimelineScrollMode = nextMode;
    if (typeof nextHide === 'boolean') payload.geminiTimelineHideContainer = nextHide;
    if (typeof nextDraggable === 'boolean') payload.geminiTimelineDraggable = nextDraggable;
    if (resetPosition) payload.geminiTimelinePosition = null;
    if (typeof nextChatWidth === 'number') payload.geminiChatWidth = nextChatWidth;
    if (typeof nextEditInputWidth === 'number') payload.geminiEditInputWidth = nextEditInputWidth;
    try {
      chrome.storage?.sync?.set(payload);
    } catch {}
  };

  return (
    <div className="w-[320px] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
        <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
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
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {t('chatWidth')}
            </label>
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
              {chatWidth}px
            </span>
          </div>
          <div className="px-1">
            <input
              type="range"
              min="400"
              max="1400"
              step="50"
              value={chatWidth}
              onChange={(e) => {
                const newWidth = Number(e.target.value);
                setChatWidth(newWidth);
                pendingChatWidth.current = newWidth;

                // Debounce the storage write to avoid quota limits
                if (chatWidthDebounceTimer.current !== null) {
                  clearTimeout(chatWidthDebounceTimer.current);
                }
                chatWidthDebounceTimer.current = window.setTimeout(() => {
                  apply(null, undefined, undefined, undefined, newWidth);
                  pendingChatWidth.current = null;
                  chatWidthDebounceTimer.current = null;
                }, 300);
              }}
              onMouseUp={() => {
                // Also save immediately when user releases the slider
                if (pendingChatWidth.current !== null) {
                  if (chatWidthDebounceTimer.current !== null) {
                    clearTimeout(chatWidthDebounceTimer.current);
                    chatWidthDebounceTimer.current = null;
                  }
                  apply(null, undefined, undefined, undefined, pendingChatWidth.current);
                  pendingChatWidth.current = null;
                }
              }}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-blue-700 [&::-webkit-slider-thumb]:transition-colors"
            />
            <div className="flex justify-between items-center mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{t('chatWidthNarrow')}</span>
              <span>{t('chatWidthWide')}</span>
            </div>
          </div>
        </div>
        {/* Edit Input Width */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {t('editInputWidth')}
            </label>
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
              {editInputWidth}px
            </span>
          </div>
          <div className="px-1">
            <input
              type="range"
              min="400"
              max="1200"
              step="50"
              value={editInputWidth}
              onChange={(e) => {
                const newWidth = Number(e.target.value);
                setEditInputWidth(newWidth);
                pendingEditInputWidth.current = newWidth;

                // Debounce the storage write to avoid quota limits
                if (editInputWidthDebounceTimer.current !== null) {
                  clearTimeout(editInputWidthDebounceTimer.current);
                }
                editInputWidthDebounceTimer.current = window.setTimeout(() => {
                  apply(null, undefined, undefined, undefined, undefined, newWidth);
                  pendingEditInputWidth.current = null;
                  editInputWidthDebounceTimer.current = null;
                }, 300);
              }}
              onMouseUp={() => {
                // Also save immediately when user releases the slider
                if (pendingEditInputWidth.current !== null) {
                  if (editInputWidthDebounceTimer.current !== null) {
                    clearTimeout(editInputWidthDebounceTimer.current);
                    editInputWidthDebounceTimer.current = null;
                  }
                  apply(null, undefined, undefined, undefined, undefined, pendingEditInputWidth.current);
                  pendingEditInputWidth.current = null;
                }
              }}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-blue-700 [&::-webkit-slider-thumb]:transition-colors"
            />
            <div className="flex justify-between items-center mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{t('editInputWidthNarrow')}</span>
              <span>{t('editInputWidthWide')}</span>
            </div>
          </div>
        </div>
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
