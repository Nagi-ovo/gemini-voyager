/**
 * The page route a site check report may carry: the path only (never the host,
 * query or hash), keeping just the site's own route words and replacing every
 * other segment with a placeholder. What a segment looks like proves nothing:
 * a Gemini id can be plain hex letters and a ChatGPT GPT id a short token, so
 * only words this table names survive. An unknown site keeps no segment.
 */
import { parseSiteConversation } from '../../sites/siteConversation';
import type { SiteAdapter } from '../../types';

export const ROUTE_ID_PLACEHOLDER = ':id';

const MAX_SEGMENTS = 8;
/** `/u/<n>/` is an account slot index, which bug reports ask for; it names no account. */
const ACCOUNT_SLOT = /^\d{1,2}$/;

interface SiteRoutes {
  /** Segments the site's router defines; everything else is redacted. */
  readonly words: ReadonlySet<string>;
  /** The site has `/u/<n>/` account slots. */
  readonly accountSlots?: boolean;
  /** Redacted routes that open a conversation, for a site without `conversationIdPattern`. */
  readonly conversations?: readonly string[];
}

const SITE_ROUTES: Readonly<Record<string, SiteRoutes>> = {
  gemini: {
    words: new Set(['app', 'gem', 'gems', 'view', 'create', 'edit', 'mystuff', 'library']),
    accountSlots: true,
    conversations: ['/app/:id', '/gem/:id/:id'],
  },
  aistudio: {
    words: new Set(['prompts', 'new_chat', 'library', 'apps', 'live', 'gallery']),
    accountSlots: true,
    conversations: ['/prompts/:id'],
  },
  chatgpt: {
    words: new Set(['c', 'g', 'project', 'gpts', 'library', 'codex', 'images']),
  },
  claude: {
    words: new Set(['new', 'chat', 'chats', 'project', 'projects', 'recents', 'artifacts']),
  },
  deepseek: { words: new Set(['a', 'chat', 's']) },
};

export interface RedactedRoute {
  readonly route: string;
  /** The site's pattern matched, or (without one) the route is a known conversation route. */
  readonly conversation: boolean;
}

/** Redact `url`'s path for `site`; an unparsable URL reports `/`. */
export function redactRoute(
  url: string,
  site?: Pick<SiteAdapter, 'id' | 'conversationIdPattern'> | null,
): RedactedRoute {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return { route: '/', conversation: false };
  }
  const routes = site ? SITE_ROUTES[site.id] : undefined;
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const kept = segments.slice(0, MAX_SEGMENTS).map((segment, index) => {
    if (routes?.accountSlots && index === 1 && segments[0] === 'u' && ACCOUNT_SLOT.test(segment)) {
      return segment;
    }
    if (routes?.accountSlots && index === 0 && segment === 'u') return segment;
    return routes?.words.has(segment) ? segment : ROUTE_ID_PLACEHOLDER;
  });
  if (segments.length > MAX_SEGMENTS) kept.push('…');
  const route = `/${kept.join('/')}`;
  const pattern = site?.conversationIdPattern;
  const conversation = pattern
    ? parseSiteConversation({ siteId: site.id, conversationIdPattern: pattern }, url) !== null
    : (routes?.conversations ?? []).includes(route.replace(/^\/u\/\d{1,2}(?=\/|$)/, ''));
  return { route, conversation };
}
