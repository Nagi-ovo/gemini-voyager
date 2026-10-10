/**
 * URL match patterns — a pragmatic subset of Chrome extension match patterns,
 * used for both site adapters and plugin `matches`.
 *
 * Supported forms:
 *   https://claude.ai/*
 *   *://claude.ai/*           (`*` scheme: http or https)
 *   https://*.openai.com/*    (any subdomain; the apex host is NOT included)
 *   a lone `*` host           (any host)
 *   <all_urls>                (any http/https URL)
 *
 * Scheme, host and path are matched separately against the parsed URL, so a
 * host wildcard can only ever match hostname labels: `https://*.example.com/*`
 * never matches `https://other.test/?x=.example.com/`. The host is compared with
 * `URL.host` (an explicit non-default port must be spelled out). In the path
 * part, matched against path + query (never the fragment), `*` matches any run
 * of characters. Host and path compare case-insensitively.
 */

function globToRegExp(glob: string): RegExp {
  // Escape regex metacharacters EXCEPT `*`, then turn `*` into `.*`.
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function hostMatches(host: string, patternHost: string): boolean {
  if (patternHost === '*') return true;
  if (patternHost.startsWith('*.')) {
    const suffix = patternHost.slice(1);
    return !suffix.includes('*') && host.endsWith(suffix) && host.length > suffix.length;
  }
  return !patternHost.includes('*') && host === patternHost;
}

export function matchesUrl(url: string, pattern: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (pattern.trim() === '<all_urls>') return true;
  const target = parsePattern(pattern);
  if (!target) return false;
  if (target.scheme !== '*' && `${target.scheme}:` !== parsed.protocol) return false;
  if (!hostMatches(parsed.host.toLowerCase(), target.host)) return false;
  return globToRegExp(target.path).test(`${parsed.pathname}${parsed.search}`);
}

export function matchesAnyPattern(url: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesUrl(url, pattern));
}

interface ParsedPattern {
  readonly scheme: 'https' | 'http' | '*';
  readonly host: string;
  readonly path: string;
}

function parsePattern(pattern: string): ParsedPattern | null {
  const match = /^(https?|\*):\/\/([^/]+)(\/.*)?$/i.exec(pattern.trim());
  if (!match) return null;
  return {
    scheme: match[1].toLowerCase() as ParsedPattern['scheme'],
    host: match[2].toLowerCase(),
    path: match[3] || '/',
  };
}

function hostWithin(inner: string, outer: string): boolean {
  if (outer === '*' || inner === outer) return true;
  if (outer.startsWith('*.')) {
    // Same contract as the runtime glob (`*.example.com` becomes `.*\.example\.com`):
    // a subdomain is required, so the apex host is NOT within the wildcard.
    const suffix = outer.slice(2);
    const bare = inner.startsWith('*.') ? inner.slice(2) : inner;
    return bare.endsWith(`.${suffix}`);
  }
  return false;
}

function pathWithin(inner: string, outer: string): boolean {
  if (outer === '/*' || inner === outer) return true;
  if (outer.endsWith('*')) return inner.startsWith(outer.slice(0, -1));
  return false;
}

/**
 * True when every URL `inner` can match is also matched by `outer` (plan D18:
 * a plugin may only target URLs its site adapter covers). Compares the parts,
 * not one probe URL: `https://*.example.com/*` is NOT within
 * `https://x.example.com/*`, and `*://example.com/*` is NOT within an
 * https-only site.
 */
export function patternWithin(inner: string, outer: string): boolean {
  if (outer.trim() === '<all_urls>') return true;
  if (inner.trim() === '<all_urls>') return false;
  const a = parsePattern(inner);
  const b = parsePattern(outer);
  if (!a || !b) return false;
  const schemeOk = b.scheme === '*' || a.scheme === b.scheme;
  return schemeOk && hostWithin(a.host, b.host) && pathWithin(a.path, b.path);
}

export function patternWithinAny(inner: string, outers: readonly string[]): boolean {
  return outers.some((outer) => patternWithin(inner, outer));
}
