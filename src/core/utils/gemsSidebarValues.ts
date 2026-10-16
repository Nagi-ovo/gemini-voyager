/** Shared count semantics for the legacy slider and packaged Gems plugin. */
export const DEFAULT_GEMS_SIDEBAR_COUNT = 3;
export const MIN_GEMS_SIDEBAR_COUNT = 0;
export const MAX_GEMS_SIDEBAR_COUNT = 10;

export function normalizeGemsSidebarCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_GEMS_SIDEBAR_COUNT;
  return Math.max(MIN_GEMS_SIDEBAR_COUNT, Math.min(MAX_GEMS_SIDEBAR_COUNT, Math.floor(n)));
}
