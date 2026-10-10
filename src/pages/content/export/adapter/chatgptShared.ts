/** Helpers shared by the ChatGPT export readers: cancellation, route checks and content merging. */
import type { ExtractedContent } from '@/features/export/services/DOMContentExtractor';

import type { ExportSelectionOptions } from './type';

/** The conversation route with its hash dropped, which ChatGPT changes without leaving the thread. */
export function normalizedConversationUrl(url: string = location.href): string {
  const parsed = new URL(url, location.href);
  return `${parsed.origin}${parsed.pathname}${parsed.search}`;
}

function abortError(): DOMException {
  return new DOMException('ChatGPT export cancelled', 'AbortError');
}

/** Throws when the export was cancelled or the page moved to another conversation. */
export function assertActive(options: ExportSelectionOptions): void {
  if (options.signal?.aborted) throw abortError();
  if (
    options.expectedUrl &&
    normalizedConversationUrl(options.expectedUrl) !== normalizedConversationUrl()
  ) {
    throw new Error('chatgpt_export_conversation_changed');
  }
}

export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(done, ms);
    function done(): void {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }
    function cancel(): void {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(abortError());
    }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export function mergeExtractedContent(
  primary: ExtractedContent,
  supplemental: ExtractedContent,
): ExtractedContent {
  return {
    text: [primary.text, supplemental.text].filter(Boolean).join('\n\n'),
    html: [primary.html, supplemental.html].filter(Boolean).join('\n'),
    attachments: [...primary.attachments, ...supplemental.attachments],
    hasImages: primary.hasImages || supplemental.hasImages,
    hasFormulas: primary.hasFormulas || supplemental.hasFormulas,
    hasTables: primary.hasTables || supplemental.hasTables,
    hasCode: primary.hasCode || supplemental.hasCode,
  };
}
