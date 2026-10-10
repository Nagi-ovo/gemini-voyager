import { getTranslationSync } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import type { FolderRepositoryHooks } from './FolderRepository';

const RECOVERY_NOTICES = {
  recovered: { key: 'folderManager_dataRecovered', tone: 'warning' },
  kept: { key: 'folderManager_dataKept', tone: 'error' },
  lost: { key: 'folderManager_dataLossWarning', tone: 'error' },
  unreadable: { key: 'folderManager_readFailure', tone: 'error' },
} as const satisfies Record<
  Parameters<FolderRepositoryHooks['onRecovery']>[0],
  { key: TranslationKey; tone: 'warning' | 'error' }
>;

/** Both managers describe the same recovery outcomes, using the current Voyager language. */
export function getFolderRecoveryNotice(result: keyof typeof RECOVERY_NOTICES) {
  const { key, tone } = RECOVERY_NOTICES[result];
  return { message: getTranslationSync(key), tone };
}
