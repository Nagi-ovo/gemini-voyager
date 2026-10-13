import { buildConversationIdFromUrl } from '@/core/utils/conversationIdentity';
import { hashString } from '@/core/utils/hash';

let timestampDraftTabId: string | null = null;

function getTimestampDraftTabId(): string {
  if (timestampDraftTabId) return timestampDraftTabId;

  try {
    const randomUUID = globalThis.crypto?.randomUUID?.();
    if (randomUUID) {
      timestampDraftTabId = randomUUID;
      return timestampDraftTabId;
    }
  } catch {}

  timestampDraftTabId = hashString(
    `${Date.now()}|${Math.random()}|${globalThis.location?.href ?? ''}`,
  );
  return timestampDraftTabId;
}

export function buildTimestampConversationId(url: string): string {
  const conversationId = buildConversationIdFromUrl(url);
  return conversationId.startsWith('gemini:conv:')
    ? conversationId
    : `${conversationId}:tab:${getTimestampDraftTabId()}`;
}
