import type { StarredMessage } from '../timeline/starredTypes';

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatStarredMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';

  const yyyy = date.getFullYear();
  const mm = padDatePart(date.getMonth() + 1);
  const dd = padDatePart(date.getDate());
  const hh = padDatePart(date.getHours());
  const min = padDatePart(date.getMinutes());
  const sec = padDatePart(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
}

export function buildStarredMessageUrl(message: StarredMessage): string {
  const baseUrl = (message.conversationUrl || '').split('#')[0];
  return `${baseUrl}#gv-turn-${message.turnId}`;
}

export function filterStarredMessages(
  messages: readonly StarredMessage[],
  rawQuery: string,
): StarredMessage[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [...messages];

  return messages.filter((message) => {
    const haystack = [
      message.content,
      message.conversationTitle,
      message.conversationUrl,
      message.turnId,
      formatStarredMessageTime(message.starredAt),
    ]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join('\n')
      .toLowerCase();
    return haystack.includes(query);
  });
}
