/**
 * Which conversation a URL names on a plugin site with one canonical origin,
 * and how it is stored in a folder: `<site>:conv:<id>`, read with the route
 * pattern of the site's `site.json`, as the timeline's stars key it. A site may
 * also answer on legacy origins (ChatGPT's `chat.openai.com`): their links
 * still name its conversations, under the origin they were filed on, while
 * imports take the canonical origin only (`siteTransfer.ts`).
 */
import { parseSiteConversation } from '@/features/plugins/sites/siteConversation';
import type { SiteAdapter } from '@/features/plugins/types';
import { siteConversationConfig } from '@/features/timeline/adapters/catalog/conversationId';

export interface SiteConversationRef {
  /** The bare conversation id from the route. */
  readonly id: string;
  /** `<site>:conv:<id>`: what a folder entry is keyed by. */
  readonly conversationId: string;
  /** The link's own origin plus the conversation path, without query or hash. */
  readonly url: string;
  /** The conversation path, for in-page navigation. */
  readonly path: string;
}

export interface SiteIdentity {
  readonly prefix: string;
  /** The route id inside a stored id; any other id as is. */
  bareId(conversationId: string): string;
  /** The conversation a root-relative link names; no URL parsing, for sidebar passes. */
  readPath(href: string | null): { readonly id: string; readonly path: string } | null;
  /** The conversation an absolute URL on one of the site's origins names, or `null`. */
  read(href: string): SiteConversationRef | null;
}

export function createSiteIdentity(
  adapter: Pick<SiteAdapter, 'id' | 'conversationIdPattern'>,
  origin: string,
  legacyOrigins: readonly string[] = [],
): SiteIdentity {
  // From the code, never from site data: these origins decide which links are this site's.
  const origins = new Set([origin, ...legacyOrigins]);
  const prefix = `${adapter.id}:conv:`;
  // Read on every call: a remote site.json update may change the pattern.
  const namespace = () => siteConversationConfig(adapter);
  return {
    prefix,
    bareId: (conversationId) =>
      conversationId.startsWith(prefix) ? conversationId.slice(prefix.length) : conversationId,
    readPath: (href) => {
      if (!href?.startsWith('/') || href.startsWith('//')) return null;
      const conversation = parseSiteConversation(namespace(), href);
      return conversation ? { id: conversation.id, path: conversation.path } : null;
    },
    read: (href) => {
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return null;
      }
      if (!origins.has(url.origin)) return null;
      const conversation = parseSiteConversation(namespace(), url.pathname);
      if (!conversation) return null;
      return {
        id: conversation.id,
        conversationId: conversation.key,
        url: `${url.origin}${conversation.path}`,
        path: conversation.path,
      };
    },
  };
}
