/**
 * Glob-style URL match patterns — a pragmatic subset of Chrome extension match
 * patterns, used for both site adapters and plugin `matches`.
 *
 * Supported forms (matched against the full URL string, case-insensitive):
 *   https://claude.ai/*
 *   *://claude.ai/*
 *   https://*.openai.com/*
 *   <all_urls>            (any http/https URL)
 *
 * `*` matches any run of characters (including `.` and `/`). This is deliberately
 * simpler than the full Chrome spec — no special `*.` subdomain semantics — so it
 * is easy to reason about and test. Authors list explicit patterns for each host
 * they support (e.g. both `https://chatgpt.com/*` and `https://chat.openai.com/*`).
 */

function patternToRegExp(pattern: string): RegExp {
  if (pattern === '<all_urls>') return /^https?:\/\//i;
  // Escape regex metacharacters EXCEPT `*`, then turn `*` into `.*`.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchesUrl(url: string, pattern: string): boolean {
  try {
    return patternToRegExp(pattern).test(url);
  } catch {
    return false;
  }
}

export function matchesAnyPattern(url: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesUrl(url, pattern));
}
