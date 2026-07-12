import {
  type HighlightColor,
  type HighlightPlatform,
  type HighlightRecordV1,
  isHighlightConversationUrl,
} from '@/core/types/highlight';
import type { StarredMessage } from '@/pages/content/timeline/starredTypes';

export type SavedLibraryFilter = 'all' | 'starred' | 'highlights';

export interface SavedLibraryItem {
  id: string;
  kind: 'starred' | 'highlight';
  conversationId: string;
  conversationUrl: string;
  conversationTitle?: string;
  turnId: string;
  content: string;
  note?: string;
  color?: HighlightColor;
  accountHash?: string;
  platform?: HighlightPlatform;
  savedAt: number;
}

export function buildSavedLibraryItemUrl(item: SavedLibraryItem): string {
  const url = new URL(item.conversationUrl);
  const safeStarredHost =
    url.protocol === 'https:' &&
    [
      'gemini.google.com',
      'business.gemini.google',
      'aistudio.google.com',
      'aistudio.google.cn',
      'claude.ai',
    ].includes(url.hostname);
  const safeHighlightHost =
    item.kind === 'highlight' &&
    item.platform !== undefined &&
    isHighlightConversationUrl(url.href, item.platform);
  if (item.kind === 'highlight' ? !safeHighlightHost : !safeStarredHost) {
    throw new TypeError('Saved item URL is not an allowed conversation URL');
  }
  const hash = item.kind === 'highlight' ? `gv-highlight-${item.id}` : `gv-turn-${item.turnId}`;
  url.hash = hash;
  return url.href;
}

function starredItemId(message: StarredMessage): string {
  return `starred:${message.conversationId}:${message.turnId}`;
}

export function toSavedLibraryItems(
  starred: readonly StarredMessage[],
  highlights: readonly HighlightRecordV1[],
): SavedLibraryItem[] {
  const starredItems = starred.map<SavedLibraryItem>((message) => ({
    id: starredItemId(message),
    kind: 'starred',
    conversationId: message.conversationId,
    conversationUrl: message.conversationUrl,
    conversationTitle: message.conversationTitle,
    turnId: message.turnId,
    content: message.content,
    savedAt: message.starredAt,
  }));
  const highlightItems = highlights
    .filter(
      (record) =>
        record.deletedAt === undefined &&
        isHighlightConversationUrl(record.conversationUrl, record.platform),
    )
    .map<SavedLibraryItem>((record) => ({
      id: record.id,
      kind: 'highlight',
      conversationId: record.conversationId,
      conversationUrl: record.conversationUrl,
      conversationTitle: record.conversationTitle,
      turnId: record.turnId,
      content: record.anchor.quote.exact,
      note: record.note,
      color: record.color,
      accountHash: record.accountHash,
      platform: record.platform,
      savedAt: record.updatedAt,
    }));

  return [...starredItems, ...highlightItems].sort(
    (left, right) => right.savedAt - left.savedAt || left.id.localeCompare(right.id),
  );
}

export function filterSavedLibraryItems(
  items: readonly SavedLibraryItem[],
  filter: SavedLibraryFilter,
  rawQuery: string,
): SavedLibraryItem[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (filter === 'starred' && item.kind !== 'starred') return false;
    if (filter === 'highlights' && item.kind !== 'highlight') return false;
    if (!query) return true;

    const searchable = [
      item.content,
      item.note,
      item.conversationTitle,
      item.conversationUrl,
      item.turnId,
      new Date(item.savedAt).toISOString(),
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join('\n')
      .toLocaleLowerCase();
    return searchable.includes(query);
  });
}
