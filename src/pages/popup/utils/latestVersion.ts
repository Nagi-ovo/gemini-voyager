export interface LatestVersionCacheEntry {
  version: string;
  fetchedAt: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function getManifestUpdateUrl(manifest: unknown): string | null {
  if (!isRecord(manifest)) return null;
  const updateUrl = manifest.update_url;
  return typeof updateUrl === 'string' && updateUrl.trim() ? updateUrl : null;
}

export function extractLatestReleaseVersion(data: unknown): string | null {
  if (!isRecord(data)) return null;

  const tagName = data.tag_name;
  if (typeof tagName === 'string' && tagName.trim()) return tagName;

  const name = data.name;
  if (typeof name === 'string' && name.trim()) return name;

  return null;
}

export function getCachedLatestVersion(
  cachedValue: unknown,
  now: number,
  maxAgeMs: number,
): string | null {
  if (!isRecord(cachedValue)) return null;

  const version = cachedValue.version;
  const fetchedAt = cachedValue.fetchedAt;

  if (typeof version !== 'string' || !version.trim()) return null;
  if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return null;
  if (now - fetchedAt >= maxAgeMs) return null;

  return version;
}
