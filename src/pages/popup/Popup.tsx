import React, { useEffect, useState } from 'react';

import { browserAPI } from '@/utils/browser-api';
import useI18n from '../../hooks/useI18n';

type ScrollMode = 'jump' | 'flow';

export default function Popup() {
  const { t, setLanguage, language } = useI18n();
  const [mode, setMode] = useState<ScrollMode>('flow');
  const [hideContainer, setHideContainer] = useState<boolean>(false);
  const [draggableTimeline, setDraggableTimeline] = useState<boolean>(false);

  useEffect(() => {
    try {
      browserAPI.storage.sync.get(
        {
          geminiTimelineScrollMode: 'flow',
          geminiTimelineHideContainer: false,
          geminiTimelineDraggable: false,
        },
      ).then((res) => {
        const m = res?.geminiTimelineScrollMode as ScrollMode;
        if (m === 'jump' || m === 'flow') setMode(m);
        setHideContainer(!!res?.geminiTimelineHideContainer);
        setDraggableTimeline(!!res?.geminiTimelineDraggable);
      });
    } catch {}
  }, []);

  const apply = (
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
      browserAPI.storage.sync.set(payload);
    } catch {}
  };

  return (
    <div className="min-w-[260px] max-w-[320px] bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 p-3">
      <h1 className="text-base font-semibold mb-2">{t('extName')}</h1>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">{t('language')}</label>
          <div className="mt-1">
            <select
              className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
              value={language.split('-')[0]}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">{t('scrollMode')}</label>
          <div className="mt-1">
            <div className="relative grid grid-cols-2 rounded-full border border-slate-300 overflow-hidden">
              <div
                className="absolute top-0 bottom-0 w-1/2 rounded-full bg-blue-600/10 border border-blue-500 pointer-events-none transition-all duration-200"
                style={{ left: mode === 'flow' ? '0%' : '50%' }}
              />
              <button
                className={`relative z-10 px-3 py-1 text-sm ${
                  mode === 'flow' ? 'text-blue-600' : 'text-slate-600'
                }`}
                onClick={() => {
                  setMode('flow');
                  apply('flow');
                }}
              >
                {t('flow')}
              </button>
              <button
                className={`relative z-10 px-3 py-1 text-sm ${
                  mode === 'jump' ? 'text-blue-600' : 'text-slate-600'
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
        <div className="flex items-center gap-2">
          <input
            id="hide-container"
            type="checkbox"
            checked={hideContainer}
            onChange={(e) => {
              setHideContainer(e.target.checked);
              apply(null, e.target.checked);
            }}
          />
          <label htmlFor="hide-container" className="text-sm">
            {t('hideOuterContainer')}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="draggable-timeline"
            type="checkbox"
            checked={draggableTimeline}
            onChange={(e) => {
              setDraggableTimeline(e.target.checked);
              apply(null, undefined, e.target.checked);
            }}
          />
          <label htmlFor="draggable-timeline" className="text-sm">
            {t('draggableTimeline')}
          </label>
        </div>
        <button
          className="px-3 py-1 text-sm border border-slate-300 rounded-full"
          onClick={() => {
            apply(null, undefined, undefined, true);
          }}
        >
          {t('resetPosition')}
        </button>
        <div className="pt-2 flex items-center justify-center gap-2">
          <span className="text-xs opacity-80 truncate">{t('starProject')}</span>
          <a
            href="https://github.com/Nagi-ovo/gemini-voyager"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            title={t('starProject')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
