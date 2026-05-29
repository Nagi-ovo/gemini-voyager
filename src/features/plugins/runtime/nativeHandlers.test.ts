import { describe, expect, it, vi } from 'vitest';

import { getNativeHandler, registerNativeHandler } from './nativeHandlers';

describe('nativeHandlers registry', () => {
  it('returns undefined for an unregistered id', () => {
    expect(getNativeHandler('nope.absent')).toBeUndefined();
  });

  it('stores and retrieves a registered handler', () => {
    const handler = { start: vi.fn(), stop: vi.fn() };
    registerNativeHandler('test.handler', handler);
    expect(getNativeHandler('test.handler')).toBe(handler);
  });

  it('last registration for an id wins', () => {
    const a = { start: vi.fn() };
    const b = { start: vi.fn() };
    registerNativeHandler('test.dup', a);
    registerNativeHandler('test.dup', b);
    expect(getNativeHandler('test.dup')).toBe(b);
  });
});
