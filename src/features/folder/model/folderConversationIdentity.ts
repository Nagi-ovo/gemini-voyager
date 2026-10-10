import type { ConversationReference } from '@/core/types/folder';

/**
 * Gemini folder-reference identity. A stored reference answers to its id
 * without the native `c_` prefix and to the id in its saved `/app/` or
 * `/gem/<gem>/` URL; legacy and imported records may keep a synthetic id
 * while the URL holds the real route id. Pure: no DOM and no page origin.
 */

// Only the pathname is read, so any base resolves relative hrefs the same way.
const URL_BASE = 'https://gemini.google.com';

export function normalizeConversationId(value: string | null | undefined): string | null {
  const normalized = String(value || '')
    .trim()
    .replace(/^c_/i, '');
  return normalized || null;
}

export function extractConversationIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const { pathname } = new URL(href, URL_BASE);
    const id =
      pathname.match(/\/app\/([^/?#]+)/)?.[1] ?? pathname.match(/\/gem\/[^/]+\/([^/?#]+)/)?.[1];
    return id ? normalizeConversationId(id) : null;
  } catch {
    return null;
  }
}

export function resolveConversationRouteId(
  href: string | null | undefined,
  fallbackId: string | null | undefined,
): string | null {
  return extractConversationIdFromHref(href) ?? normalizeConversationId(fallbackId);
}

/** Every key a stored reference answers to: its normalized id and its URL's route id. */
export function conversationKeys(conversation: ConversationReference): string[] {
  const id = normalizeConversationId(conversation.conversationId);
  const routeId = resolveConversationRouteId(conversation.url, conversation.conversationId);
  if (!id) return routeId ? [routeId] : [];
  return routeId && routeId !== id ? [id, routeId] : [id];
}

/** Whether a stored reference is the conversation another id names. */
export function isSameConversation(targetId: string, conversation: ConversationReference): boolean {
  const target = normalizeConversationId(targetId);
  return target !== null && conversationKeys(conversation).includes(target);
}
