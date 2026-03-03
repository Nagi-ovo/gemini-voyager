/**
 * Tests for concurrency control utilities
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AsyncLock, LOCK_KEYS, OperationQueue } from '../concurrency';

describe('AsyncLock', () => {
  let lock: AsyncLock;

  beforeEach(() => {
    lock = new AsyncLock();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquire', () => {
    it('immediately resolves when no lock is held, returning a release function', async () => {
      const release = await lock.acquire('key');
      expect(typeof release).toBe('function');
      release();
    });

    it('serializes same-key access: second acquire waits until first is released', async () => {
      const log: string[] = [];

      const task1 = async () => {
        const release = await lock.acquire('shared');
        log.push('task1 start');
        // Simulate async work — advance timers so the inner setTimeout resolves
        await Promise.resolve();
        log.push('task1 end');
        release();
      };

      const task2 = async () => {
        const release = await lock.acquire('shared');
        log.push('task2 start');
        release();
      };

      const p1 = task1();
      const p2 = task2();

      // Let the microtask queue drain so task1 acquires the lock and runs
      await Promise.resolve();
      await Promise.resolve();
      await p1;

      // task2 should now be unblocked
      await p2;

      expect(log).toEqual(['task1 start', 'task1 end', 'task2 start']);
    });

    it('allows concurrent acquire on different keys', async () => {
      const releaseA = await lock.acquire('keyA');
      const releaseB = await lock.acquire('keyB');

      expect(lock.isLocked('keyA')).toBe(true);
      expect(lock.isLocked('keyB')).toBe(true);

      releaseA();
      releaseB();

      expect(lock.isLocked('keyA')).toBe(false);
      expect(lock.isLocked('keyB')).toBe(false);
    });
  });

  describe('tryAcquire', () => {
    it('returns a release function when the key is free', () => {
      const release = lock.tryAcquire('free-key');
      expect(release).not.toBeNull();
      expect(typeof release).toBe('function');
      release!();
    });

    it('returns null when the lock is already held', async () => {
      const release = await lock.acquire('held-key');

      const tryResult = lock.tryAcquire('held-key');
      expect(tryResult).toBeNull();

      release();
    });
  });

  describe('timeout', () => {
    it('throws when lock is held past the timeout', async () => {
      // Acquire lock and hold it indefinitely
      const _release = await lock.acquire('busy-key');

      // Attempt to acquire with a 100ms timeout
      const waitingPromise = lock.acquire('busy-key', 100);

      // Advance fake timers past the timeout
      vi.advanceTimersByTime(150);

      // Let setTimeout callback run via microtask flush
      await Promise.resolve();

      await expect(waitingPromise).rejects.toThrow();
    });
  });

  describe('forceRelease (via timeout)', () => {
    it('unblocks a waiting acquire after the held lock is force-released by timeout', async () => {
      // Hold the lock indefinitely
      const _held = await lock.acquire('target-key');

      // A second caller waits with a very short timeout; when it times out,
      // forceRelease is called internally, clearing the lock entry
      const waitingPromise = lock.acquire('target-key', 50);

      // Trigger the timeout — forceRelease runs, lock entry is deleted
      vi.advanceTimersByTime(100);
      await Promise.resolve();

      // The waiting promise should reject (timeout), not hang
      await expect(waitingPromise).rejects.toThrow();

      // After forceRelease the key should be free
      expect(lock.isLocked('target-key')).toBe(false);

      // A new acquire should succeed immediately now
      const newRelease = await lock.acquire('target-key');
      expect(typeof newRelease).toBe('function');
      newRelease();
    });
  });

  describe('isLocked', () => {
    it('returns false before acquiring and true after acquiring', async () => {
      expect(lock.isLocked('chk')).toBe(false);
      const release = await lock.acquire('chk');
      expect(lock.isLocked('chk')).toBe(true);
      release();
      expect(lock.isLocked('chk')).toBe(false);
    });
  });

  describe('getLockDuration', () => {
    it('returns null for a key that is not locked', () => {
      expect(lock.getLockDuration('ghost')).toBeNull();
    });

    it('returns elapsed milliseconds while the lock is held', async () => {
      const release = await lock.acquire('dur-key');
      vi.advanceTimersByTime(50);
      const duration = lock.getLockDuration('dur-key');
      expect(duration).toBeGreaterThanOrEqual(50);
      release();
    });
  });

  describe('withLock', () => {
    it('acquires the lock, runs the function, and releases on success', async () => {
      let ran = false;
      await lock.withLock('wl', async () => {
        ran = true;
      });
      expect(ran).toBe(true);
      expect(lock.isLocked('wl')).toBe(false);
    });

    it('releases the lock even when the wrapped function throws', async () => {
      await expect(
        lock.withLock('wl-err', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(lock.isLocked('wl-err')).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('removes all held locks', async () => {
      await lock.acquire('a');
      await lock.acquire('b');

      expect(lock.isLocked('a')).toBe(true);
      expect(lock.isLocked('b')).toBe(true);

      lock.clearAll();

      expect(lock.isLocked('a')).toBe(false);
      expect(lock.isLocked('b')).toBe(false);
    });
  });
});

describe('LOCK_KEYS', () => {
  it('defines the standard lock keys', () => {
    expect(LOCK_KEYS.FOLDER_IMPORT).toBeDefined();
    expect(LOCK_KEYS.FOLDER_EXPORT).toBeDefined();
    expect(LOCK_KEYS.FOLDER_DATA_WRITE).toBeDefined();
    expect(LOCK_KEYS.FOLDER_DATA_READ).toBeDefined();
  });

  it('has unique values for every key', () => {
    const values = Object.values(LOCK_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('OperationQueue', () => {
  let queue: OperationQueue;

  beforeEach(() => {
    queue = new OperationQueue();
  });

  it('executes operations in the order they were enqueued', async () => {
    const results: number[] = [];

    await Promise.all([
      queue.enqueue(async () => {
        results.push(1);
      }),
      queue.enqueue(async () => {
        results.push(2);
      }),
      queue.enqueue(async () => {
        results.push(3);
      }),
    ]);

    expect(results).toEqual([1, 2, 3]);
  });

  it('returns the resolved value of each operation', async () => {
    const r1 = queue.enqueue(async () => 'first');
    const r2 = queue.enqueue(async () => 'second');

    expect(await r1).toBe('first');
    expect(await r2).toBe('second');
  });

  it('rejects the caller when an operation throws, but continues processing', async () => {
    const r1 = queue.enqueue(async () => 'ok');
    const r2 = queue.enqueue(async () => {
      throw new Error('oops');
    });
    const r3 = queue.enqueue(async () => 'after');

    expect(await r1).toBe('ok');
    await expect(r2).rejects.toThrow('oops');
    expect(await r3).toBe('after');
  });

  it('reports queue length correctly', () => {
    expect(queue.length).toBe(0);
  });

  it('clears pending operations', () => {
    queue.enqueue(async () => {});
    queue.enqueue(async () => {});
    queue.clear();
    expect(queue.length).toBe(0);
  });
});
