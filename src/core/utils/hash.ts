/**
 * Hash utilities
 * Centralized hash functions (was duplicated in 3 files)
 */

/**
 * FNV-1a hash algorithm
 * Fast, good distribution for short strings
 */
export function hashString(input: string): string {
  let h = 2166136261 >>> 0;

  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return (h >>> 0).toString(36);
}

/**
 * Generate unique ID with timestamp and random component
 */
export function generateUniqueId(prefix = ''): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 11);

  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Hash object to stable string
 */
export function hashObject(obj: Record<string, unknown>): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return hashString(str);
}
