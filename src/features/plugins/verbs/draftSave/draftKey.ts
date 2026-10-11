/**
 * Where a catalog site's draft lives: `gvDraft:<siteId>:conv:<id>` for a
 * conversation and `gvDraft:<siteId>:new` for every other page with a
 * composer. The `gvDraft:` namespace never overlaps Gemini's `gvDraft_<path>`
 * entries, and each site prunes only its own keys.
 */
import { StorageKeys } from '@/core/types/common';
import { isEphemeralChat } from '@/features/plugins/sends/trackUserSends';
import { parseSiteConversation } from '@/features/plugins/sites/siteConversation';
import type { SiteAdapter } from '@/features/plugins/types';

export type DraftSite = Pick<SiteAdapter, 'id' | 'conversationIdPattern'>;

/** Draft key for every page without a conversation id: new chat, a project or a custom GPT's start page. */
export const NEW_CHAT_DRAFT = 'new';

/** The storage prefix of one site's drafts. */
export function siteDraftPrefix(siteId: string): string {
  return `${StorageKeys.SITE_DRAFT_PREFIX}${siteId}:`;
}

/**
 * The draft key (after the site prefix) for the page at `href`, or `null` in
 * a chat the host keeps nowhere: a temporary chat's text is not written to disk.
 */
export function draftKeyFor(site: DraftSite, href: string): string | null {
  if (isEphemeralChat(site.id)) return null;
  const conversation = parseSiteConversation(
    { siteId: site.id, conversationIdPattern: site.conversationIdPattern },
    href,
  );
  return conversation ? `conv:${conversation.id}` : NEW_CHAT_DRAFT;
}
