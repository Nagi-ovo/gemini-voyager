import type { HighlightAccountScope, HighlightRecordV1 } from '@/core/types/highlight';

import { StarredMessagesService } from './StarredMessagesService';
import type { SavedLibraryItem } from './model';
import { ALL_FILTER } from './viewModel';

export async function listLibraryHighlights(
  scope: typeof ALL_FILTER | HighlightAccountScope | null,
): Promise<HighlightRecordV1[]> {
  if (!scope) return [];
  const response = (await chrome.runtime.sendMessage(
    scope === ALL_FILTER
      ? { type: 'gv.highlight.listAll', payload: { includeDeleted: false } }
      : { type: 'gv.highlight.list', payload: { scope, includeDeleted: false } },
  )) as { ok?: boolean; records?: HighlightRecordV1[]; error?: string } | undefined;
  if (!response?.ok || !Array.isArray(response.records)) {
    throw new Error(response?.error || 'Failed to load highlights');
  }
  return response.records;
}

export async function removeLibraryItem(item: SavedLibraryItem): Promise<void> {
  if (item.kind === 'starred') {
    await StarredMessagesService.removeStarredMessage(item.conversationId, item.turnId);
    return;
  }
  const response = (await chrome.runtime.sendMessage({
    type: 'gv.highlight.deleteStored',
    payload: {
      platform: item.platform,
      accountHash: item.accountHash,
      conversationId: item.conversationId,
      id: item.id,
    },
  })) as { ok?: boolean; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error || 'Highlight delete failed');
}
