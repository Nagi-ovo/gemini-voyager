import { extractRouteUserIdFromUrl } from '@/core/services/AccountIsolationService';
import type { SyncAccountScope } from '@/core/types/sync';

import { starDeletionConversationIds, type StarState } from './starSyncData';

function currentRoute(url: string, scope: SyncAccountScope | null): string {
  if (!scope?.routeUserId || extractRouteUserIdFromUrl(url) === null) return url;
  const parsed = new URL(url);
  parsed.pathname = parsed.pathname.replace(/^\/u\/\d+\//, `/u/${scope.routeUserId}/`);
  return parsed.toString();
}
const identity = (id: string, turn: string) => JSON.stringify([id, turn]);

export function retargetImportedStarState(
  state: StarState,
  scope: SyncAccountScope | null,
): StarState {
  return retargetKnownStarState(state, state, scope);
}

export function retargetKnownStarState(
  state: StarState,
  imported: StarState,
  scope: SyncAccountScope | null,
): StarState {
  const ids = new Set([
    ...Object.entries(imported.data.messages).flatMap(([id, bucket]) =>
      bucket.flatMap((item) =>
        starDeletionConversationIds(id, item.conversationUrl).map((alias) =>
          identity(alias, item.turnId),
        ),
      ),
    ),
    ...imported.tombstones.map((item) => identity(item.conversationId, item.turnId)),
  ]);
  return {
    data: {
      messages: Object.fromEntries(
        Object.entries(state.data.messages).map(([id, bucket]) => [
          id,
          bucket.map((item) =>
            starDeletionConversationIds(id, item.conversationUrl).some((alias) =>
              ids.has(identity(alias, item.turnId)),
            )
              ? { ...item, conversationUrl: currentRoute(item.conversationUrl, scope) }
              : item,
          ),
        ]),
      ),
    },
    tombstones: state.tombstones.map((item) =>
      (item.movedTo
        ? [item.conversationId]
        : starDeletionConversationIds(item.conversationId, item.conversationUrl)
      ).some((alias) => ids.has(identity(alias, item.turnId)))
        ? { ...item, conversationUrl: currentRoute(item.conversationUrl, scope) }
        : item,
    ),
  };
}
