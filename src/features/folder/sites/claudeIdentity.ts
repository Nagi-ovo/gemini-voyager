/**
 * Which Claude conversation a URL names: `/chat/<id>` on claude.ai, inside a
 * Project or not (a Project chat keeps the same route), keyed `claude:conv:<id>`
 * as the timeline's stars are. The artifact frames on claudeusercontent.com
 * that site.json also matches name no conversation.
 */
import { claudeAdapter } from '@/features/plugins/sites/adapters/claude';

import { createSiteIdentity } from './siteIdentity';
import { createSiteTransfer } from './siteTransfer';

export const CLAUDE_ORIGIN = 'https://claude.ai';

export const CLAUDE_IDENTITY = createSiteIdentity(claudeAdapter, CLAUDE_ORIGIN);

/** Claude's folder file: the shared format marked `claude`, with Claude conversations only. */
export const CLAUDE_TRANSFER = createSiteTransfer({
  platform: 'claude',
  origin: CLAUDE_ORIGIN,
  read: CLAUDE_IDENTITY.read,
});
