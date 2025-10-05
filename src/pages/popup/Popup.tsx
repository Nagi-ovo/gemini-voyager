import React, { useEffect, useState } from 'react';

type ScrollMode = 'jump' | 'flow';

export default function Popup() {
  const [mode, setMode] = useState<ScrollMode>('flow');
  const [hideContainer, setHideContainer] = useState<boolean>(false);
  // simplified popup: just mode toggle

  useEffect(() => {
    // read from chrome.storage.sync with fallback to flow
    try {
      chrome.storage?.sync?.get(
        { geminiTimelineScrollMode: 'flow', geminiTimelineHideContainer: false },
        (res) => {
          const m = res?.geminiTimelineScrollMode as ScrollMode;
          if (m === 'jump' || m === 'flow') setMode(m);
          setHideContainer(!!res?.geminiTimelineHideContainer);
        }
      );
    } catch {}
  }, []);

  const apply = (nextMode: ScrollMode | null, nextHide?: boolean) => {
    const payload: any = {};
    if (nextMode) payload.geminiTimelineScrollMode = nextMode;
    if (typeof nextHide === 'boolean') payload.geminiTimelineHideContainer = nextHide;
    try {
      chrome.storage?.sync?.set(payload);
    } catch {}
  };

  return (
    <div className="min-w-[260px] max-w-[320px] bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 p-3">
      <h1 className="text-base font-semibold mb-2">Gemini Voyager</h1>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Scroll mode</label>
          <div className="mt-1">
            <div className="relative grid grid-cols-2 rounded-full border border-slate-300 overflow-hidden">
              <div
                className="absolute top-0 bottom-0 w-1/2 rounded-full bg-blue-600/10 border border-blue-500 pointer-events-none transition-all duration-200"
                style={{ left: mode === 'flow' ? '0%' : '50%' }}
              />
              <button
                className={`relative z-10 px-3 py-1 text-sm ${mode === 'flow' ? 'text-blue-600' : 'text-slate-600'}`}
                onClick={() => {
                  setMode('flow');
                  apply('flow');
                }}
              >
                Flow
              </button>
              <button
                className={`relative z-10 px-3 py-1 text-sm ${mode === 'jump' ? 'text-blue-600' : 'text-slate-600'}`}
                onClick={() => {
                  setMode('jump');
                  apply('jump');
                }}
              >
                Jump
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
            Hide outer container
          </label>
        </div>
      </div>
    </div>
  );
}
