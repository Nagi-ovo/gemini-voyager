import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debounce, retry, sleep, throttle, withTimeout } from '../async';

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------
describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the function after the delay has elapsed', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('only calls the function once when invoked repeatedly within the delay window', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on each new call so only the last invocation fires', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    vi.advanceTimersByTime(80);
    debounced('second'); // resets the timer
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('allows a second invocation after the delay has elapsed', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    vi.advanceTimersByTime(100);
    debounced('second');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes all arguments to the underlying function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('a', 'b', 'c');
    vi.advanceTimersByTime(50);

    expect(fn).toHaveBeenCalledWith('a', 'b', 'c');
  });

  it('does not call the function before the delay has elapsed', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    vi.advanceTimersByTime(199);

    expect(fn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// throttle
// ---------------------------------------------------------------------------
describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the function immediately on the first invocation', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores calls that occur within the delay window', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(); // fires immediately (lastCall = 0, now >= 0)
    vi.advanceTimersByTime(50);
    throttled(); // within delay — ignored
    vi.advanceTimersByTime(50);
    throttled(); // exactly at boundary — fires

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('allows a new call after the delay has elapsed', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes arguments to the underlying function', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('hello', 42);

    expect(fn).toHaveBeenCalledWith('hello', 42);
  });
});

// ---------------------------------------------------------------------------
// retry
// ---------------------------------------------------------------------------
describe('retry', () => {
  it('returns the result immediately when the function succeeds on the first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retry(fn, { maxAttempts: 3, initialDelay: 0 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and returns the result when a later attempt succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await retry(fn, { maxAttempts: 3, initialDelay: 0 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error when all attempts fail', async () => {
    const lastError = new Error('final failure');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('attempt 1'))
      .mockRejectedValueOnce(new Error('attempt 2'))
      .mockRejectedValue(lastError);

    await expect(retry(fn, { maxAttempts: 3, initialDelay: 0 })).rejects.toThrow('final failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects maxAttempts: 1 (no retries)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('only attempt'));

    await expect(retry(fn, { maxAttempts: 1, initialDelay: 0 })).rejects.toThrow('only attempt');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('wraps non-Error thrown values into an Error', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    await expect(retry(fn, { maxAttempts: 1, initialDelay: 0 })).rejects.toBeInstanceOf(Error);
  });

  it('uses exponential backoff — each delay is multiplied by backoffFactor', async () => {
    vi.useFakeTimers();

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const promise = retry(fn, {
      maxAttempts: 3,
      initialDelay: 100,
      backoffFactor: 2,
      maxDelay: 5000,
    });

    // First attempt fails → waits 100 ms
    await vi.advanceTimersByTimeAsync(100);
    // Second attempt fails → waits 200 ms
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('ok');

    vi.useRealTimers();
  });

  it('caps delay at maxDelay', async () => {
    vi.useFakeTimers();

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = retry(fn, {
      maxAttempts: 2,
      initialDelay: 10_000,
      maxDelay: 500,
      backoffFactor: 2,
    });

    // Delay should be capped at 500 ms, not 10 000 ms
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe('ok');

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------
describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified number of milliseconds', async () => {
    let resolved = false;
    const promise = sleep(200).then(() => {
      resolved = true;
    });

    vi.advanceTimersByTime(199);
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(1);
    await promise;
    expect(resolved).toBe(true);
  });

  it('resolves immediately for sleep(0)', async () => {
    const promise = sleep(0);
    vi.advanceTimersByTime(0);
    await promise; // should not hang
  });
});

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------
describe('withTimeout', () => {
  it('resolves with the promise value when it settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000);
    expect(result).toBe(42);
  });

  it('rejects with the default timeout error when the promise is too slow', async () => {
    vi.useFakeTimers();

    const neverResolves = new Promise<never>(() => {});
    const promise = withTimeout(neverResolves, 500);

    vi.advanceTimersByTime(500);

    await expect(promise).rejects.toThrow('Operation timed out');

    vi.useRealTimers();
  });

  it('rejects with a custom error message when provided', async () => {
    vi.useFakeTimers();

    const neverResolves = new Promise<never>(() => {});
    const customError = new Error('Custom timeout message');
    const promise = withTimeout(neverResolves, 100, customError);

    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow('Custom timeout message');

    vi.useRealTimers();
  });

  it('rejects immediately when the underlying promise rejects before the timeout', async () => {
    const rejection = Promise.reject(new Error('upstream failure'));
    await expect(withTimeout(rejection, 1000)).rejects.toThrow('upstream failure');
  });
});
