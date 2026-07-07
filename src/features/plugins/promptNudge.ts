// Pure helpers for the Prompt Manager discovery nudge (see the toolbar-icon dot
// logic in src/pages/background/index.ts). Kept here so the domain math and icon
// path handling are unit-testable without the Chrome/declarativeContent glue.

/**
 * Domains that should show the discovery nudge: plugin-capable sites the user
 * has not enabled the Prompt Manager on yet. Comparison is case-insensitive on
 * both sides and the result is de-duplicated, so a differently-cased stored
 * domain still suppresses the nudge.
 */
export function computeNudgeDomains(
  pluginDomains: Iterable<string>,
  enabledSites: Iterable<string>,
): string[] {
  const enabled = new Set(Array.from(enabledSites, (domain) => domain.toLowerCase()));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const domain of pluginDomains) {
    const normalized = domain.toLowerCase();
    if (!normalized || enabled.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/**
 * Normalize a manifest icon path so it resolves through chrome.runtime.getURL:
 * strip any leading slash and the `public/` prefix used by the dev manifest.
 */
export function normalizeIconResourcePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/^public\//, '');
}
