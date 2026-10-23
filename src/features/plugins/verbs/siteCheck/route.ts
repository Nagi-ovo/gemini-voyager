/**
 * The page route a site check report may carry: the path only (never the host,
 * query or hash), with the conversation id the site's `conversationIdPattern`
 * captures, and every other segment that looks like an id or a slug, replaced
 * by a placeholder. Gemini and AI Studio declare no pattern, so the fallback
 * is what keeps their `/app/<id>` and `/prompts/<id>` routes anonymous.
 */
import { parseSiteConversation } from '../../sites/siteConversation';

export const ROUTE_ID_PLACEHOLDER = ':id';

const MAX_SEGMENTS = 8;
/** `/u/<n>/` is an account slot index, which bug reports ask for; it names no account. */
const ACCOUNT_SLOT = /^\d{1,2}$/;

export interface RedactedRoute {
  readonly route: string;
  /** The site's pattern matched, or (without one) a segment was taken for an id. */
  readonly conversation: boolean;
}

/** Whether a path segment can carry an id, a title slug or other free text. */
function looksIdentifying(segment: string): boolean {
  if (segment.length > 24) return true;
  if (/[^a-z0-9_-]/i.test(segment)) return true;
  // Route words are short letters with at most one separator; ids and slugs are not.
  return /\d/.test(segment) || /[-_].*[-_]/.test(segment);
}

/** Redact `url`'s path; an unparsable URL reports `/`. */
export function redactRoute(url: string, conversationIdPattern?: string): RedactedRoute {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return { route: '/', conversation: false };
  }
  const id = parseSiteConversation({ siteId: 'site', conversationIdPattern }, url)?.id;
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  let guessed = false;
  const kept = segments.slice(0, MAX_SEGMENTS).map((segment, index) => {
    if (id !== undefined && segment === id) return ROUTE_ID_PLACEHOLDER;
    if (segments[index - 1] === 'u' && ACCOUNT_SLOT.test(segment)) return segment;
    if (!looksIdentifying(segment)) return segment;
    guessed = true;
    return ROUTE_ID_PLACEHOLDER;
  });
  if (segments.length > MAX_SEGMENTS) kept.push('…');
  return {
    route: `/${kept.join('/')}`,
    conversation: id !== undefined || (!conversationIdPattern && guessed),
  };
}
