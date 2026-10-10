import type { StarredMessagesDataSync } from '@/core/types/sync';
import { legacyStarProjection } from '@/features/savedLibrary/starText';

export function legacyStarredExport(data: StarredMessagesDataSync): StarredMessagesDataSync {
  const MAX_CONTENT_LENGTH = 60;
  return {
    messages: Object.fromEntries(
      Object.entries(legacyStarProjection(data).messages).map(([id, messages]) => [
        id,
        messages.map((message) => ({
          ...message,
          content:
            message.content.length > MAX_CONTENT_LENGTH
              ? message.content.slice(0, MAX_CONTENT_LENGTH) + '...'
              : message.content,
        })),
      ]),
    ),
  };
}
