import { StorageKeys, isTimelineStyle } from '@/core/types/common';

import type { TimelineSettingsValues } from '../components/TimelineOptions';

/** Gemini's timeline keys, as the rail has always read them. */
export const GEMINI_TIMELINE_KEYS = {
  scrollMode: 'geminiTimelineScrollMode',
  style: StorageKeys.TIMELINE_STYLE,
  hideContainer: 'geminiTimelineHideContainer',
  draggable: 'geminiTimelineDraggable',
  previewPinned: StorageKeys.TIMELINE_PREVIEW_PINNED,
  markerLevel: 'geminiTimelineMarkerLevel',
  position: 'geminiTimelinePosition',
} as const;

/** The option keys the timeline row's panel shows from the popup's live snapshot. */
export const GEMINI_TIMELINE_OPTION_KEYS: readonly string[] = [
  GEMINI_TIMELINE_KEYS.scrollMode,
  GEMINI_TIMELINE_KEYS.style,
  GEMINI_TIMELINE_KEYS.hideContainer,
  GEMINI_TIMELINE_KEYS.draggable,
  GEMINI_TIMELINE_KEYS.previewPinned,
  GEMINI_TIMELINE_KEYS.markerLevel,
];

/** Stored keys read the way the Gemini rail reads them; anything invalid reads as its default. */
export function readGeminiTimelineValues(
  stored: Readonly<Record<string, unknown>>,
): TimelineSettingsValues {
  const mode = stored[GEMINI_TIMELINE_KEYS.scrollMode];
  const style = stored[GEMINI_TIMELINE_KEYS.style];
  return {
    timelineEnabled: stored[StorageKeys.GV_TIMELINE_ENABLED] !== false,
    mode: mode === 'jump' ? 'jump' : 'flow',
    timelineStyle: isTimelineStyle(style) ? style : 'dots',
    hideContainer: !!stored[GEMINI_TIMELINE_KEYS.hideContainer],
    draggableTimeline: !!stored[GEMINI_TIMELINE_KEYS.draggable],
    timelinePreviewPinned: stored[GEMINI_TIMELINE_KEYS.previewPinned] === true,
    markerLevelEnabled: !!stored[GEMINI_TIMELINE_KEYS.markerLevel],
    showMessageTimestamps: stored[StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS] === true,
  };
}

/** The sync write for one option change, under the keys the rail reads. */
export function geminiTimelineOptionWrite(
  change: Partial<TimelineSettingsValues>,
): Record<string, unknown> {
  // Levels have a shape only on the dots rail, so turning them on leaves compact or ruler.
  const patch: Partial<TimelineSettingsValues> =
    change.markerLevelEnabled === true ? { ...change, timelineStyle: 'dots' } : change;
  const payload: Record<string, unknown> = {};
  if (patch.mode) payload[GEMINI_TIMELINE_KEYS.scrollMode] = patch.mode;
  if (patch.timelineStyle) payload[GEMINI_TIMELINE_KEYS.style] = patch.timelineStyle;
  if (typeof patch.hideContainer === 'boolean')
    payload[GEMINI_TIMELINE_KEYS.hideContainer] = patch.hideContainer;
  if (typeof patch.draggableTimeline === 'boolean')
    payload[GEMINI_TIMELINE_KEYS.draggable] = patch.draggableTimeline;
  if (typeof patch.timelinePreviewPinned === 'boolean')
    payload[GEMINI_TIMELINE_KEYS.previewPinned] = patch.timelinePreviewPinned;
  if (typeof patch.markerLevelEnabled === 'boolean')
    payload[GEMINI_TIMELINE_KEYS.markerLevel] = patch.markerLevelEnabled;
  return payload;
}
