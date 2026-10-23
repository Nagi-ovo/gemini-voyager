import type { ToastTone } from '@/core/ui/toast/types';
import type { EditOutcome } from '@/features/folder/commands/folderCommands';
import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

import type { SiteFolderMessages } from './types';

export type Notice = { message: string; tone: ToastTone };

/** As long as the tree's status line these notices replace. */
export const NOTICE_MS = 4000;
/** Load and save problems, as long as AI Studio's error notices. */
export const STORAGE_NOTICE_MS = 5000;

/** The notice that confirms a filing, or `null` when the folders were not open for edits. */
export function addOutcomeNotice(
  outcome: EditOutcome,
  messages: Pick<SiteFolderMessages, 'added' | 'alreadyFiled'>,
): Notice | null {
  if (outcome.kind === 'failed') return null;
  if (outcome.kind === 'unchanged') return { message: t(messages.alreadyFiled), tone: 'info' };
  // A rejection: the folder was deleted elsewhere; trying again shows the current folders.
  if (outcome.kind === 'rejected') return { message: t(outcome.messageKey), tone: 'error' };
  return { message: t(messages.added), tone: 'success' };
}

function format(key: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    t(key),
  );
}

/** The notice for an import; `null` when the folders were not open for edits. */
export function importNotice(outcome: EditOutcome): Notice | null {
  switch (outcome.kind) {
    case 'saved':
      return {
        message: format('folder_import_success', {
          folders: outcome.stats?.foldersImported ?? 0,
          conversations: outcome.stats?.conversationsImported ?? 0,
        }),
        tone: 'success',
      };
    case 'rejected':
      return { message: t(outcome.messageKey), tone: 'error' };
    case 'failed':
      if (outcome.reason === 'not_loaded') return null;
      return {
        message: format('folder_import_error', { error: outcome.detail ?? '' }),
        tone: 'error',
      };
    default:
      return null;
  }
}
