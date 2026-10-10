import type { TranslationKey } from '@/utils/translations';

import type { SavedLibraryFilter } from './model';

export function savedLibraryEmptyKey(kind: SavedLibraryFilter, query: string): TranslationKey {
  if (query.trim()) return 'pm_starred_no_results';
  if (kind === 'highlights') return 'savedLibraryNoHighlights';
  if (kind === 'starred') return 'noStarredMessages';
  return 'savedLibraryEmpty';
}

export function formatSavedLibraryAccount(
  t: (key: TranslationKey) => string,
  number: number,
): string {
  return number === 0
    ? t('savedLibraryUnassigned')
    : t('savedLibraryAccountNumber').replace('{number}', String(number));
}
