const BLOCKED_CUSTOM_WEBSITE_VALUES = new Set([
  '*',
  '*://*/*',
  '<all_urls>',
  'all urls',
  'all_urls',
  'http://*/*',
  'https://*/*',
]);

export function normalizeCustomWebsite(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  let normalized = value.trim().toLowerCase();
  if (!normalized || BLOCKED_CUSTOM_WEBSITE_VALUES.has(normalized)) return null;
  if (normalized.includes('*')) return null;

  normalized = normalized
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '');

  if (!normalized || BLOCKED_CUSTOM_WEBSITE_VALUES.has(normalized)) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) return null;

  return normalized;
}

export function sanitizeCustomWebsites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const websites: string[] = [];
  for (const item of value) {
    const normalized = normalizeCustomWebsite(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    websites.push(normalized);
  }
  return websites;
}

export function customWebsitesIncludeHost(value: unknown, hostname: string): boolean {
  const currentHost = hostname
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  if (!currentHost) return false;

  return sanitizeCustomWebsites(value).some(
    (website) => currentHost === website || currentHost.endsWith(`.${website}`),
  );
}
