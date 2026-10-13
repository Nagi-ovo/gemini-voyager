import type { TurnId } from '@/core/types/common';
import { hashString } from '@/core/utils/hash';

import { getLegacyTurnIndex } from '../fork/turnId';
import type { TimestampService } from './TimestampService';
import { buildTimestampConversationId } from './messageTimestampIdentity';

/** Positional aliases come from complete history, never the mounted DOM window. */
export function getLocalMessageTimestamp(
  service: TimestampService,
  url: string,
  aliases: readonly string[],
  text: string,
): number | null {
  const cid = buildTimestampConversationId(url);
  for (const alias of aliases) {
    const timestamp = service.getTimestamp(cid, alias as TurnId);
    if (timestamp !== null) return timestamp;
  }
  const fullIndex = aliases.map(getLegacyTurnIndex).find((value) => value !== null);
  if (fullIndex === undefined) return null;
  const legacyId = `u-${hashString((text || `user-${fullIndex}`) + '|' + fullIndex)}`;
  return service.getTimestamp(cid, legacyId as TurnId);
}
