import { showExportProgress } from '@/features/export/ui/exportToasts';
import { getTranslationSync } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import type { ChatGptCrawlOptions } from './adapter/chatgptCrawl';
import { hasRenderedThread } from './adapter/chatgptThread';
import type { ChatGptThreadPreparer, ChatGptThreadSession } from './adapter/chatgptThreadExport';

/**
 * Progress for ChatGPT's thread crawl, which reads a long conversation for a
 * while (about 0.7s per turn live): the export progress toast counts the turns
 * read and offers Cancel, then shows the export's own progress again.
 *
 * Cancel aborts only the crawl. The crawl restores the reader's scroll
 * position and rejects with an AbortError, which the export treats as a quiet
 * cancellation: no file, no warning.
 */

type Translate = (key: TranslationKey) => string;

function crawlTurnsText(t: Translate, turns: number): string {
  return t('export_reading_conversation_turns').replace('{count}', String(turns));
}

/**
 * A ChatGPT preparation with crawl progress. The earlier DOM has no crawl, so
 * it shows none.
 */
export async function prepareChatGptExportWithProgress(
  preparer: ChatGptThreadPreparer,
  options: ChatGptCrawlOptions,
  t: Translate = getTranslationSync,
): Promise<ChatGptThreadSession | null> {
  if (!hasRenderedThread()) return preparer.prepare(options);

  const crawl = new AbortController();
  const forward = () => crawl.abort();
  if (options.signal?.aborted) crawl.abort();
  options.signal?.addEventListener('abort', forward, { once: true });
  const progress = showExportProgress({
    message: t('export_reading_conversation_title'),
    detail: crawlTurnsText(t, 0),
    action: { label: t('pm_cancel'), run: () => crawl.abort() },
  });
  try {
    return await preparer.prepare({
      ...options,
      signal: crawl.signal,
      onProgress: (turns) => {
        progress.update({ detail: crawlTurnsText(t, turns) });
        options.onProgress?.(turns);
      },
    });
  } finally {
    progress.hide();
    options.signal?.removeEventListener('abort', forward);
  }
}
