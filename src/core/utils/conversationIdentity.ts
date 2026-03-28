import { hashString } from './hash';

const DEFAULT_BASE_URL = 'https://gemini.google.com';

function getBaseUrl(): string {
  try {
    return globalThis.location?.origin || DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input, getBaseUrl());
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) return '/';

  const normalized = trimmed.replace(/\/+$/, '');
  return normalized || '/';
}

function stripAccountSlotPrefix(pathname: string): string {
  return pathname.replace(/^\/u\/\d+(?=\/)/, '');
}

export function extractConversationIdFromUrl(input: string): string | null {
  const parsed = parseUrl(input);
  const pathname = parsed ? parsed.pathname : String(input || '');
  const normalizedPath = stripAccountSlotPrefix(normalizePathname(pathname));

  const appMatch = normalizedPath.match(/^\/app\/([^/?#]+)/);
  if (appMatch?.[1]) return appMatch[1];

  const gemMatch = normalizedPath.match(/^\/gem\/[^/]+\/([^/?#]+)/);
  return gemMatch?.[1] || null;
}

export function normalizeConversationUrl(input: string): string {
  const parsed = parseUrl(input);
  if (!parsed) {
    const raw = stripAccountSlotPrefix(
      String(input || '')
        .split('#')[0]
        .split('?')[0]
        .trim(),
    );
    return raw || '/';
  }

  return `${parsed.origin}${stripAccountSlotPrefix(normalizePathname(parsed.pathname))}`;
}

export function isSameConversationRoute(left: string, right: string): boolean {
  return normalizeConversationUrl(left) === normalizeConversationUrl(right);
}

export function buildRouteConversationIdFromUrl(input: string): string {
  const parsed = parseUrl(input);
  if (!parsed) {
    return `gemini:${hashString(normalizeConversationUrl(input))}`;
  }

  return `gemini:${hashString(`${parsed.host}${normalizeConversationUrl(input)}`)}`;
}

export function buildConversationIdFromUrl(input: string): string {
  const conversationId = extractConversationIdFromUrl(input);
  if (conversationId) {
    return `gemini:conv:${conversationId}`;
  }

  return buildRouteConversationIdFromUrl(input);
}

export function buildLegacyConversationIdFromUrl(input: string): string {
  const parsed = parseUrl(input);
  if (!parsed) {
    return `gemini:${hashString(String(input || ''))}`;
  }

  return `gemini:${hashString(`${parsed.host}${parsed.pathname}${parsed.search}`)}`;
}
