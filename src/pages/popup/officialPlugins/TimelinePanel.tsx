import React from 'react';

import { TimelineOptions } from '../components/TimelineOptions';
import { writePopupSyncStorage } from '../utils/popupStorage';
import {
  GEMINI_TIMELINE_KEYS,
  geminiTimelineOptionWrite,
  readGeminiTimelineValues,
} from '../utils/timelineSettingsValues';
import type { OfficialPanelProps } from './officialPluginPanels';

// The row is the rail's switch and Message timestamps is a row of its own.
const PANEL_ENTRIES = new Set([
  'timelineStyle',
  'scrollMode',
  'hideOuterContainer',
  'draggableTimeline',
  'pinTimelinePreview',
  'enableMarkerLevel',
  'resetTimelinePosition',
  'viewStarredHistory',
]);

/** Gemini's timeline options, shown while the Show Timeline row is on. */
export function TimelinePanel({ values, write, openStarredHistory, t }: OfficialPanelProps) {
  return (
    <div className="space-y-4">
      <TimelineOptions
        values={readGeminiTimelineValues(values)}
        onChange={(patch) => write(geminiTimelineOptionWrite(patch))}
        // A one-off clear, not a setting to show: it skips the panel's pending overlay.
        onResetPosition={() =>
          void writePopupSyncStorage({ [GEMINI_TIMELINE_KEYS.position]: null })
        }
        onViewStarredHistory={() => openStarredHistory?.()}
        isVisible={(settingId) =>
          PANEL_ENTRIES.has(settingId) &&
          (settingId !== 'viewStarredHistory' || openStarredHistory !== undefined)
        }
        t={t}
      />
    </div>
  );
}
