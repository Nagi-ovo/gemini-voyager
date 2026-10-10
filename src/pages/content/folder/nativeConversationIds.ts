import { folderDebug as debugLog, folderDebugWarn as debugWarn } from './folderManagerDebug';
import { extractNativeConversationTitle } from './nativeConversationTitles';

const CONVERSATION_LINK_SELECTOR = 'a[href*="/app/"], a[href*="/gem/"]';

/** Hex id from an `/app/<hex>` or `/gem/<gemId>/<hex>` href. */
function matchHexIdInHref(href: string): string | null {
  const appMatch = href.match(/\/app\/([^/?#]+)/);
  if (appMatch && appMatch[1]) return appMatch[1];
  const gemMatch = href.match(/\/gem\/[^/]+\/([^/?#]+)/);
  if (gemMatch && gemMatch[1]) return gemMatch[1];
  return null;
}

export function extractConversationId(element: HTMLElement): string {
  // Strategy 1: Extract from jslog attribute
  // This is the preferred method as it follows the internal ID format
  const jslog = element.getAttribute('jslog');
  if (jslog) {
    // Match conversation ID - it appears in quotes like ["c_3456c77162722c1a",...]
    const match = jslog.match(/[",[]c_([a-f0-9]+)[",\]]/);
    if (match) {
      const conversationId = `c_${match[1]}`;
      debugLog('Extracted conversation ID:', conversationId, 'from jslog:', jslog);
      return conversationId;
    }
    // Fallback: match without surrounding characters
    const simpleMatch = jslog.match(/c_[a-f0-9]+/);
    if (simpleMatch) {
      debugLog('Extracted conversation ID (simple):', simpleMatch[0]);
      return simpleMatch[0];
    }
  }

  // Strategy 2: Extract from href (fallback when jslog is missing/broken)
  // This ensures we can still identify conversations even if Gemini UI changes traits
  const link = element.querySelector(CONVERSATION_LINK_SELECTOR) as HTMLAnchorElement | null;
  const hexFromHref = link ? matchHexIdInHref(link.href) : null;
  // Enforce c_ prefix to match jslog format standard
  if (hexFromHref) return `c_${hexFromHref}`;

  // Fallback: generate unique ID from element attributes
  // Use multiple attributes to ensure uniqueness
  const title = extractNativeConversationTitle(element) || '';
  const index = Array.from(element.parentElement?.children || []).indexOf(element);

  // Generate unique ID combining title, index, random, and timestamp
  const uniqueString = `${title}_${index}_${Math.random()}_${Date.now()}`;
  const fallbackId = `conv_${hashString(uniqueString)}`;
  debugWarn('Could not extract ID from jslog or href, using fallback:', fallbackId);
  return fallbackId;
}

export function extractConversationData(
  element: HTMLElement,
  accountIsolationEnabled: boolean,
): {
  url: string;
  isGem: boolean;
  gemId?: string;
} {
  // Try to extract from jslog first
  const jslog = element.getAttribute('jslog');
  let hexId: string | null = null;

  if (jslog) {
    const match = jslog.match(/[",[]c_([a-f0-9]+)[",\]]/);
    if (match) {
      hexId = match[1];
      debugLog('Extracted hex ID from jslog:', hexId);
    }
  }

  // Try to extract from href if jslog failed
  if (!hexId) {
    const link = element.querySelector(CONVERSATION_LINK_SELECTOR) as HTMLAnchorElement | null;
    if (link) hexId = matchHexIdInHref(link.href);
  }

  if (!hexId) {
    return { url: window.location.href, isGem: false };
  }

  const origin = window.location.origin;
  const currentUrl = new URL(window.location.href);
  const searchParams = currentUrl.searchParams.toString();

  let url: string;

  if (accountIsolationEnabled) {
    // In hard isolation mode, intentionally do not persist the /u/{num} account index;
    // only store the path that is intrinsic to the conversation itself.
    // At navigation time we rebuild the correct /u/{num} segment based on the
    // current window/account context, so that URLs stay valid even if the
    // account index changes (e.g. saved with /u/1, later browsing under /u/2).
    url = `${origin}/app/${hexId}`;
  } else {
    // Backward-compatible behavior: preserve the current /u/{num} segment
    // when hard isolation is disabled, matching legacy URL structure.
    const currentPath = window.location.pathname;
    const userMatch = currentPath.match(/\/u\/(\d+)\//);

    if (userMatch) {
      url = `${origin}/u/${userMatch[1]}/app/${hexId}`;
    } else {
      url = `${origin}/app/${hexId}`;
    }
  }

  if (searchParams) {
    url += `?${searchParams}`;
  }

  debugLog('Built conversation URL:', url);
  return { url, isGem: false, gemId: undefined };
}

/**
 * Extract conversation ID from a DOM element
 * Used for handling removed/added conversations in MutationObserver
 *
 * @param element - The conversation element to extract ID from
 * @returns The conversation ID (hex only, without 'c_' prefix) or undefined if not found
 *
 * @remarks
 * This method attempts two extraction strategies:
 * 1. From jslog attribute (e.g., jslog="c_abc123def456")
 * 2. From href in anchor tags (e.g., /app/abc123def456 or /gem/xxx/abc123def456)
 */
export function extractConversationIdFromElement(element: Element): string | undefined {
  // Strategy 1: Extract from jslog attribute
  const jslog = element.getAttribute('jslog');
  if (jslog) {
    const match = jslog.match(/c_([a-f0-9]{8,})/i);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Strategy 2: Extract from href
  const link = element.querySelector(CONVERSATION_LINK_SELECTOR) as HTMLAnchorElement | null;
  if (link) {
    const href = link.href;
    const appMatch = href.match(/\/app\/([^/?#]+)/);
    const gemMatch = href.match(/\/gem\/[^/]+\/([^/?#]+)/);
    return appMatch?.[1] || gemMatch?.[1];
  }

  return undefined;
}

export function extractNativeConversationId(conversationEl: HTMLElement): string | null {
  // Support both /app/<hexId> and /gem/<gemId>/<hexId>
  const scope =
    (conversationEl.closest('[data-test-id="conversation"]') as HTMLElement) || conversationEl;

  // Get all conversation links
  const links = scope.querySelectorAll(CONVERSATION_LINK_SELECTOR);

  if (links.length === 0) {
    debugWarn('extractId: no conversation link found under scope');
    // Fallback to jslog parsing on the conversation element tree
    return extractHexIdFromJslog(scope);
  }

  const link = links.length > 1 ? pickSmallestLink(links) : links[0];
  const href = link.getAttribute('href') || '';
  debugLog('extractId: found link href', href);

  const hexId = matchHexIdInHref(href);
  if (hexId) {
    debugLog('extractId: extracted', hexId);
    return hexId;
  }
  debugWarn('extractId: failed to extract id from href');
  return null;
}

// With several links, the one with the smallest bounding box is most likely
// the actual conversation item; equal or zero sizes fall back to the first.
function pickSmallestLink(links: NodeListOf<Element>): Element {
  debugWarn(
    `extractId: found ${links.length} links, attempting to select the most appropriate one`,
  );

  let minArea = Infinity;
  let bestLink = links[0];

  for (const l of Array.from(links)) {
    const rect = l.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 0 && area < minArea) {
      minArea = area;
      bestLink = l;
    }
  }

  debugLog('extractId: selected link with area', minArea);
  return minArea < Infinity ? bestLink : links[0];
}

function extractHexIdFromJslog(scope: HTMLElement): string | null {
  try {
    const tryParse = (val: string | null | undefined): string | null => {
      if (!val) return null;
      // Typical pattern inside jslog: c_<hex>
      const m = val.match(/c_([a-f0-9]{8,})/i);
      return m?.[1] || null;
    };

    // Check on scope itself
    const fromSelf = tryParse(scope.getAttribute('jslog'));
    if (fromSelf) {
      debugLog('extractId(jslog self):', fromSelf);
      return fromSelf;
    }

    // Search descendants with jslog
    const nodes = scope.querySelectorAll('[jslog]');
    for (const n of Array.from(nodes)) {
      const found = tryParse(n.getAttribute('jslog'));
      if (found) {
        debugLog('extractId(jslog descendant):', found);
        return found;
      }
    }
  } catch (e) {
    debugWarn('extractHexIdFromJslog error:', e);
  }
  debugWarn('extractId(jslog): not found');
  return null;
}

export function buildConversationUrlFromId(
  hexId: string,
  accountIsolationEnabled: boolean,
): string {
  // Mirror extractConversationData's account-scope semantics: preserve the
  // current /u/<index>/ segment for multi-account users so jslog-fallback
  // URLs don't open in the wrong account. Under hard account isolation the
  // /u/<index> segment is intentionally NOT persisted (navigation rebuilds
  // it from the live page context).
  let accountPrefix = '';
  try {
    if (!accountIsolationEnabled) {
      const userMatch = window.location.pathname.match(/\/u\/(\d+)\//);
      if (userMatch) {
        accountPrefix = `/u/${userMatch[1]}`;
      }
    }
  } catch (e) {
    debugLog('Failed to extract account prefix:', e);
  }

  try {
    const path = window.location.pathname;
    const gemMatch = path.match(/\/gem\/([^/]+)/);
    if (gemMatch && gemMatch[1]) {
      const gemId = gemMatch[1];
      return `https://gemini.google.com${accountPrefix}/gem/${gemId}/${hexId}`;
    }
  } catch (e) {
    debugLog('Failed to extract gem URL:', e);
  }
  return `https://gemini.google.com${accountPrefix}/app/${hexId}`;
}

export function extractNativeConversationUrl(
  conversationEl: HTMLElement,
  accountIsolationEnabled: boolean,
): string | null {
  const scope =
    (conversationEl.closest('[data-test-id="conversation"]') as HTMLElement) || conversationEl;
  const link = scope.querySelector(CONVERSATION_LINK_SELECTOR);
  if (!link) {
    debugWarn('extractUrl: no conversation link found under scope');
    // Fallback: construct from extracted id (via jslog) if possible
    const hex = extractHexIdFromJslog(scope);
    if (hex) {
      const fullFromJslog = buildConversationUrlFromId(hex, accountIsolationEnabled);
      debugLog('extractUrl(jslog fallback):', fullFromJslog);
      return fullFromJslog;
    }
    return null;
  }
  const href = link.getAttribute('href');
  if (!href) {
    debugWarn('extractUrl: link has no href');
    return null;
  }
  const full = href.startsWith('http') ? href : `https://gemini.google.com${href}`;
  debugLog('extractUrl:', full);
  return full;
}

export function getCurrentHexIdFromLocation(): string | null {
  try {
    const path = window.location.pathname || '';
    // Match /app/<hex> or /gem/<gemId>/<hex>
    const m = path.match(/\/(?:app|gem\/[^/]+)\/([a-f0-9]+)/i);
    return m ? m[1] : null;
  } catch (e) {
    debugLog('Failed to get current hex ID from location:', e);
    return null;
  }
}

/**
 * Get the conversation ID from current URL
 */
export function getCurrentConversationId(): string | null {
  const url = window.location.href;
  const appMatch = url.match(/\/app\/([^/?#]+)/);
  const gemMatch = url.match(/\/gem\/[^/]+\/([^/?#]+)/);
  return appMatch?.[1] || gemMatch?.[1] || null;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
