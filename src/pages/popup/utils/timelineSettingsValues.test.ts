import { describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { geminiTimelineOptionWrite, readGeminiTimelineValues } from './timelineSettingsValues';

describe("Gemini's timeline options in the popup", () => {
  it('reads every stored option under its existing key', () => {
    expect(
      readGeminiTimelineValues({
        geminiTimelineScrollMode: 'jump',
        [StorageKeys.TIMELINE_STYLE]: 'ruler',
        geminiTimelineHideContainer: true,
        geminiTimelineDraggable: true,
        [StorageKeys.TIMELINE_PREVIEW_PINNED]: true,
        geminiTimelineMarkerLevel: true,
        [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: true,
      }),
    ).toEqual({
      timelineEnabled: true,
      mode: 'jump',
      timelineStyle: 'ruler',
      hideContainer: true,
      draggableTimeline: true,
      timelinePreviewPinned: true,
      markerLevelEnabled: true,
      showMessageTimestamps: true,
    });
  });

  it('reads missing or invalid values as the rail does: its defaults', () => {
    expect(
      readGeminiTimelineValues({
        geminiTimelineScrollMode: 'smooth',
        [StorageKeys.TIMELINE_STYLE]: 3,
        [StorageKeys.TIMELINE_PREVIEW_PINNED]: 'true',
      }),
    ).toEqual({
      timelineEnabled: true,
      mode: 'flow',
      timelineStyle: 'dots',
      hideContainer: false,
      draggableTimeline: false,
      timelinePreviewPinned: false,
      markerLevelEnabled: false,
      showMessageTimestamps: false,
    });
    for (const value of [undefined, 'false', 0]) {
      expect(
        readGeminiTimelineValues({ [StorageKeys.GV_TIMELINE_ENABLED]: value }).timelineEnabled,
      ).toBe(true);
    }
    expect(
      readGeminiTimelineValues({ [StorageKeys.GV_TIMELINE_ENABLED]: false }).timelineEnabled,
    ).toBe(false);
  });

  it('writes sparse false changes under their existing keys only', () => {
    expect(geminiTimelineOptionWrite({ hideContainer: false, markerLevelEnabled: false })).toEqual({
      geminiTimelineHideContainer: false,
      geminiTimelineMarkerLevel: false,
    });
  });

  it('turning node levels on switches to dots in the same write', () => {
    expect(geminiTimelineOptionWrite({ markerLevelEnabled: true })).toEqual({
      geminiTimelineMarkerLevel: true,
      [StorageKeys.TIMELINE_STYLE]: 'dots',
    });
  });
});
