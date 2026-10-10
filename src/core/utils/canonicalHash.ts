/**
 * Canonical JSON: object keys sorted recursively, `undefined` dropped as
 * `JSON.stringify` drops it. The owner stores `JSON.parse(canonicalJson(v))`,
 * so the stored value is exactly the hashed one whatever key order a browser keeps.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return item;
    // No prototype: a `__proto__` bucket key stays an own property.
    const sorted: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(item).sort()) {
      sorted[key] = (item as Record<string, unknown>)[key];
    }
    return sorted;
  });
}

export const ABSENT_HASH = 'absent';

/** `H(v)`: SHA-256 hex of the canonical JSON; `'absent'` for a missing value. */
export async function hashValue(value: unknown): Promise<string> {
  if (value === undefined) return ABSENT_HASH;
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
