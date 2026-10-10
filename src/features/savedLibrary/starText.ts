import type { StarredMessage, StarredMessagesData } from './starTypes';

const MAX_TEXT_BYTES = 16 * 1024;

export function capStarText(value: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).byteLength <= MAX_TEXT_BYTES) return value;
  let bytes = 0;
  let text = '';
  for (const point of value) {
    const size = encoder.encode(point).byteLength;
    if (bytes + size > MAX_TEXT_BYTES) break;
    bytes += size;
    text += point;
  }
  return text;
}

export function normalizeStarText(value: unknown): string | undefined {
  return typeof value === 'string' ? capStarText(value) : undefined;
}

export function mergeStarText(newer: StarredMessage, older: StarredMessage): string | undefined {
  const next = normalizeStarText(newer.text);
  const previous = normalizeStarText(older.text);
  if (next === undefined) return previous;
  if (previous === undefined) return next;
  if (next.startsWith(previous)) return next;
  if (previous.startsWith(next)) return previous;
  return next;
}

export function getBackfillStarText(
  message: StarredMessage,
  extracted: string,
): string | undefined {
  const text = capStarText(extracted);
  const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const preview = collapse(
    message.content.length === 63 && message.content.endsWith('...')
      ? message.content.slice(0, -3)
      : message.content,
  );
  if (!collapse(text).startsWith(preview)) return undefined;
  const merged = mergeStarText(message, { ...message, text });
  return merged === message.text ? undefined : merged;
}

export function legacyStarProjection(data: StarredMessagesData): StarredMessagesData {
  return {
    messages: Object.fromEntries(
      Object.entries(data.messages).map(([id, items]) => [
        id,
        items.map((item) => {
          const record = { ...item };
          delete record.text;
          return record;
        }),
      ]),
    ),
  };
}
