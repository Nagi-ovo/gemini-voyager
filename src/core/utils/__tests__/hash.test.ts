import { describe, expect, it } from 'vitest';

import { generateUniqueId, hashObject, hashString } from '../hash';

describe('hashString', () => {
  it('returns a non-empty string', () => {
    const result = hashString('hello');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('is idempotent — same input always returns same result', () => {
    const input = 'gemini-voyager';
    expect(hashString(input)).toBe(hashString(input));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashString('foo')).not.toBe(hashString('bar'));
  });

  it('does not throw on empty string', () => {
    expect(() => hashString('')).not.toThrow();
    expect(typeof hashString('')).toBe('string');
  });

  it('handles unicode characters (Chinese)', () => {
    const result = hashString('你好世界');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    // Different from ASCII equivalent
    expect(hashString('你好世界')).toBe(hashString('你好世界'));
    expect(hashString('你好世界')).not.toBe(hashString('hello world'));
  });
});

describe('generateUniqueId', () => {
  it('returns a non-empty string', () => {
    const id = generateUniqueId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('generates 20 unique IDs in consecutive calls', () => {
    const ids = Array.from({ length: 20 }, () => generateUniqueId());
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(20);
  });

  it('includes the prefix when provided', () => {
    const id = generateUniqueId('test');
    expect(id.startsWith('test_')).toBe(true);
  });

  it('omits prefix separator when no prefix is given', () => {
    const id = generateUniqueId();
    // Default format is `${timestamp}_${random}`, no leading underscore
    expect(id.startsWith('_')).toBe(false);
  });
});

describe('hashObject', () => {
  it('returns the same hash regardless of key order', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { c: 3, a: 1, b: 2 };
    expect(hashObject(obj1)).toBe(hashObject(obj2));
  });

  it('returns different hashes for objects with different values', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, b: 99 };
    expect(hashObject(obj1)).not.toBe(hashObject(obj2));
  });

  it('does not throw on nested objects', () => {
    const nested = { outer: { inner: { deep: 'value' } } };
    expect(() => hashObject(nested as Record<string, unknown>)).not.toThrow();
    expect(typeof hashObject(nested as Record<string, unknown>)).toBe('string');
  });

  it('does not throw on empty object', () => {
    expect(() => hashObject({})).not.toThrow();
    expect(typeof hashObject({})).toBe('string');
  });
});
