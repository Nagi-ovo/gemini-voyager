import React, { useEffect, useState } from 'react';

import useI18n from '../../hooks/useI18n';

type ScrollMode = 'jump' | 'flow';

export default function Popup() {
  const { t, setLanguage, language } = useI18n();
  const [mode, setMode] = useState<ScrollMode>('flow');
  const [hideContainer, setHideContainer] = useState<boolean>(false);
  const [draggableTimeline, setDraggableTimeline] = useState<boolean>(false);

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
      chrome.storage?.sync?.set(payload);
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
                  apply('flow', null, null, null);
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
                  apply('jump', null, null, null);
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
              apply(null, e.target.checked, null, null);
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
              apply(null, null, e.target.checked, null);
            }}
          />
          <label htmlFor="draggable-timeline" className="text-sm">
            {t('draggableTimeline')}
          </label>
        </div>
        <button
          className="px-3 py-1 text-sm border border-slate-300 rounded-full"
          onClick={() => {
            apply(null, null, null, true);
          }}
        >
          {t('resetPosition')}
        </button>
      </div>
    </div>
  );
}
