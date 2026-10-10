import { mergeStarText, normalizeStarText } from './starText';
import type { StarredMessage, StarredMessagesData } from './starTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeStarredMessages(value: unknown): StarredMessagesData {
  const messages: Record<string, StarredMessage[]> = Object.create(null);
  if (!isRecord(value) || !isRecord(value.messages)) return { messages };
  for (const [conversationId, bucket] of Object.entries(value.messages)) {
    if (!Array.isArray(bucket)) continue;
    const records: StarredMessage[] = [];
    for (const item of bucket) {
      if (!isRecord(item) || typeof item.turnId !== 'string' || !item.turnId) continue;
      const record: StarredMessage = {
        ...item,
        turnId: item.turnId,
        conversationId:
          typeof item.conversationId === 'string' && item.conversationId
            ? item.conversationId
            : conversationId,
        content: typeof item.content === 'string' ? item.content : '',
        conversationUrl: typeof item.conversationUrl === 'string' ? item.conversationUrl : '',
        starredAt:
          typeof item.starredAt === 'number' && Number.isFinite(item.starredAt)
            ? item.starredAt
            : 0,
      };
      if (typeof item.conversationTitle !== 'string') delete record.conversationTitle;
      const text = normalizeStarText(item.text);
      delete record.text;
      if (text !== undefined) record.text = text;
      records.push(record);
    }
    messages[conversationId] = records;
  }
  return { messages };
}

export function decodeStarredSnapshot(value: unknown): StarredMessagesData | undefined {
  if (!isRecord(value) || !isRecord(value.messages)) return undefined;
  const data = normalizeStarredMessages(value);
  // A partial notification cannot authorize hydration after the codec dropped invalid entries.
  return Object.entries(value.messages).every(
    ([id, bucket]) => Array.isArray(bucket) && bucket.length === data.messages[id]?.length,
  )
    ? data
    : undefined;
}

export function mergeStarredMessages(
  local: StarredMessagesData,
  cloud: StarredMessagesData,
): StarredMessagesData {
  const messages: Record<string, StarredMessage[]> = Object.create(null);
  for (const id of new Set([...Object.keys(local.messages), ...Object.keys(cloud.messages)])) {
    const merged = new Map<string, StarredMessage>();
    for (const source of [...(cloud.messages[id] || []), ...(local.messages[id] || [])]) {
      const item = { ...source };
      const text = normalizeStarText(source.text);
      delete item.text;
      if (text !== undefined) item.text = text;
      const existing = merged.get(item.turnId);
      if (!existing) {
        merged.set(item.turnId, { ...item });
        continue;
      }
      const winner = item.starredAt >= existing.starredAt ? item : existing;
      const other = winner === item ? existing : item;
      const record = { ...other, ...winner } as StarredMessage & Record<string, unknown>;
      // Sparse newer records must not erase richer previews or opaque metadata.
      for (const [field, value] of Object.entries(other)) {
        if (record[field] === undefined || record[field] === null || record[field] === '') {
          record[field] = value;
        }
      }
      const mergedText = mergeStarText(winner, other);
      delete record.text;
      if (mergedText !== undefined) record.text = mergedText;
      merged.set(item.turnId, record);
    }
    messages[id] = Array.from(merged.values());
  }
  return { messages };
}
