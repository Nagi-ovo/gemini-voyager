import { MAX_SIDEBAR_WIDTH_PERCENT, SIDEBAR_WIDTH_PX } from '@/core/utils/sidebarWidthValues';

/** Old sidebar widths were percentages of this content width. */
const LEGACY_SIDEBAR_WIDTH_BASELINE_PX = 1200;

/**
 * The sidebar width as the px slider shows it. A stored legacy percentage
 * (at most 45, e.g. 26) is what the page renders as `26vw`; the value binding
 * keeps it as the bare number, which a px slider would pin at its minimum and
 * a first nudge would then shrink. It reads as its px equivalent instead, the
 * folder panel's rule (`folderSettings.ts`), and is only written once the user
 * commits a new width.
 */
export function sidebarWidthForDisplay(value: number): number {
  const px =
    value <= MAX_SIDEBAR_WIDTH_PERCENT ? (value / 100) * LEGACY_SIDEBAR_WIDTH_BASELINE_PX : value;
  return Math.min(SIDEBAR_WIDTH_PX.max, Math.max(SIDEBAR_WIDTH_PX.min, Math.round(px)));
}
