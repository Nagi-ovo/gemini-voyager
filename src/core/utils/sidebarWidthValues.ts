import { type ChatWidthSwitchInput, isWidthSwitchOn } from '@/core/utils/chatAppearanceValues';

export const SIDEBAR_WIDTH_PX = { default: 312, min: 180, max: 540 } as const;
export const DEFAULT_SIDEBAR_WIDTH = SIDEBAR_WIDTH_PX.default;
const MIN_PX = SIDEBAR_WIDTH_PX.min;
const MAX_PX = SIDEBAR_WIDTH_PX.max;
const MIN_PERCENT = 15;
export const MAX_SIDEBAR_WIDTH_PERCENT = 45;

/** Native storage accepted numeric strings and kept legacy percentages as percentages. */
export function normalizeSidebarWidth(stored: unknown): number {
  const value = Number(stored);
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH;
  return value > MAX_SIDEBAR_WIDTH_PERCENT
    ? Math.min(MAX_PX, Math.max(MIN_PX, Math.round(value)))
    : Math.min(MAX_SIDEBAR_WIDTH_PERCENT, Math.max(MIN_PERCENT, Math.round(value)));
}

export function isCustomizedSidebarWidth(stored: unknown): boolean {
  return stored !== undefined && normalizeSidebarWidth(stored) !== DEFAULT_SIDEBAR_WIDTH;
}

export function isSidebarWidthSwitchOn(input: ChatWidthSwitchInput): boolean {
  return isWidthSwitchOn(input, isCustomizedSidebarWidth);
}
