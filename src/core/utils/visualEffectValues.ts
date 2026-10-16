/** The one cross-site choice, still stored in the original sync keys. */
export type VisualEffect = 'off' | 'snow' | 'sakura' | 'rain';

export function resolveVisualEffect(stored: unknown, legacySnow?: unknown): VisualEffect {
  // Any string wins over the legacy boolean; an unknown string renders nothing.
  if (typeof stored === 'string') {
    return stored === 'snow' || stored === 'sakura' || stored === 'rain' ? stored : 'off';
  }
  return legacySnow === true ? 'snow' : 'off';
}
