import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageEchoTracker, serializeStoredValue } from '../StorageEchoTracker';

describe('StorageEchoTracker', () => {
  let tracker: StorageEchoTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new StorageEchoTracker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches an echo whose object keys come back in a different order', () => {
    tracker.arm('k', serializeStoredValue({ b: 1, a: { d: [{ y: 1, x: 2 }], c: 3 } }));
    expect(tracker.consume('k', { a: { c: 3, d: [{ x: 2, y: 1 }] }, b: 1 })).toBe(true);
  });

  it('arms a write of the value storage already holds, which some browsers still report', () => {
    tracker.consume('k', { a: 1 });
    tracker.arm('k', serializeStoredValue({ a: 1 }));
    expect(tracker.consume('k', { a: 1 })).toBe(true);
  });

  it('drops expired echoes when the next write arms, even if no event ever arrives', () => {
    tracker.arm('k', serializeStoredValue({ a: 1 }));
    tracker.arm('k', serializeStoredValue({ a: 1 }));
    vi.advanceTimersByTime(2001);
    tracker.arm('k', serializeStoredValue({ a: 1 }));
    expect(tracker.pendingCount).toBe(1);
  });

  it('keeps a later write armed when an earlier write echoes', () => {
    tracker.arm('k', serializeStoredValue({ a: 1 }));
    tracker.arm('k', serializeStoredValue({ a: 2 }));
    expect(tracker.consume('k', { a: 1 })).toBe(true);
    expect(tracker.consume('k', { a: 2 })).toBe(true);
    expect(tracker.consume('k', { a: 2 })).toBe(false);
  });

  it('keeps echoes for other keys armed across a mismatch', () => {
    tracker.arm('k', serializeStoredValue({ a: 1 }));
    tracker.arm('other', serializeStoredValue({ a: 1 }));
    expect(tracker.consume('k', { a: 9 })).toBe(false);
    expect(tracker.consume('k', { a: 1 })).toBe(false);
    expect(tracker.consume('other', { a: 1 })).toBe(true);
  });

  it('expires an echo after the suppression window', () => {
    tracker.arm('k', serializeStoredValue({ a: 1 }));
    vi.advanceTimersByTime(2001);
    expect(tracker.consume('k', { a: 1 })).toBe(false);
  });
});
