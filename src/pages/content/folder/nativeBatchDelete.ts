import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

import type { FolderFeedback } from './FolderFeedback';

/** Delay between each deletion to avoid rate limiting. */
const DELAY_BETWEEN_DELETIONS_MS = 500;

export type NativeBatchDeleteContext = {
  conversationIds: readonly string[];
  // Outer flags cannot cancel native waits; a late wait could click the next account's menu.
  signal: AbortSignal;
  /** False once the batch was cancelled, the account or route changed, or the page went away. */
  isCurrent: () => boolean;
  deleteConversation: (conversationId: string, signal: AbortSignal) => Promise<boolean>;
  feedback: Pick<
    FolderFeedback,
    'showBatchDeleteProgress' | 'updateBatchDeleteProgress' | 'showNotification'
  >;
};

function debug(level: 'log' | 'warn', ...args: unknown[]): void {
  try {
    if (localStorage.getItem('gvFolderDebug') === '1') console[level]('[FolderManager]', ...args);
  } catch {
    /* Debugging must not affect deletion. */
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

function notifyResult(
  feedback: NativeBatchDeleteContext['feedback'],
  successCount: number,
  failedCount: number,
): void {
  if (failedCount === 0) {
    feedback.showNotification(
      t('batch_delete_success').replace('{count}', String(successCount)),
      'success',
    );
    return;
  }
  const partialMessage = t('batch_delete_partial')
    .replace('{success}', String(successCount))
    .replace('{failed}', String(failedCount));
  feedback.showNotification(partialMessage, 'warning');
}

/**
 * Deletes Gemini conversations one at a time through their native menus,
 * showing progress and then a summary. Returns how many were deleted, or null
 * when the batch stopped being current and was abandoned without a summary.
 */
export async function deleteNativeConversations(
  context: NativeBatchDeleteContext,
): Promise<number | null> {
  const { conversationIds, signal, isCurrent, feedback } = context;
  const count = conversationIds.length;
  let successCount = 0;
  let failedCount = 0;

  feedback.showBatchDeleteProgress(0, count);
  for (let i = 0; i < count; i++) {
    if (!isCurrent()) return null;
    const conversationId = conversationIds[i];
    debug('log', `Deleting conversation ${i + 1}/${count}: ${conversationId}`);
    feedback.updateBatchDeleteProgress(i + 1, count);
    try {
      const success = await context.deleteConversation(conversationId, signal);
      if (!isCurrent()) return null;
      if (success) {
        successCount++;
      } else {
        failedCount++;
        debug('warn', `Failed to delete conversation: ${conversationId}`);
      }
    } catch (error) {
      failedCount++;
      console.error(`[FolderManager] Error deleting conversation ${conversationId}:`, error);
    }
    if (i < count - 1) await delay(DELAY_BETWEEN_DELETIONS_MS, signal);
  }

  if (!isCurrent()) return null;
  notifyResult(feedback, successCount, failedCount);
  return successCount;
}
