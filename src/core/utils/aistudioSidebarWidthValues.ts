/** AI Studio keeps its own pixel width and never inherits Gemini's width switch. */
import { StorageKeys } from '../types/common';

export const AISTUDIO_SIDEBAR_WIDTH_DEFAULT = 280;
export const AISTUDIO_SIDEBAR_WIDTH_MIN = 240;
export const AISTUDIO_SIDEBAR_WIDTH_MAX = 600;

function inRange(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    value >= AISTUDIO_SIDEBAR_WIDTH_MIN &&
    value <= AISTUDIO_SIDEBAR_WIDTH_MAX
  );
}

/** Live numeric changes and drags round and clamp to the existing pixel range. */
export function normalizeAIStudioSidebarWidth(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(AISTUDIO_SIDEBAR_WIDTH_MAX, Math.max(AISTUDIO_SIDEBAR_WIDTH_MIN, Math.round(value)))
    : AISTUDIO_SIDEBAR_WIDTH_DEFAULT;
}

/** Missing sync data uses 280; failed/invalid sync reads retain the old local fallback and 360. */
export function readInitialAIStudioSidebarWidth(value: unknown, syncAvailable = true): number {
  if (syncAvailable) {
    if (value === undefined) return AISTUDIO_SIDEBAR_WIDTH_DEFAULT;
    if (inRange(value)) return value;
  }
  try {
    const local = localStorage.getItem(StorageKeys.AISTUDIO_SIDEBAR_WIDTH);
    const parsed = local ? parseInt(local, 10) : NaN;
    if (inRange(parsed)) return parsed;
  } catch {
    // Storage can be unavailable; the original in-memory initial width was 360px.
  }
  return 360;
}
