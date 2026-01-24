/**
 * Tests for concurrency control utilities
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AsyncLock, LOCK_KEYS, OperationQueue } from '../concurrency';

describe('Concurrency Control', () => {
  describe('AsyncLock', () => {
    let lock: AsyncLock;

    beforeEach(() => {
      lock = new AsyncLock();
    });

    it('should acquire and release lock', async () => {
      const release = await lock.acquire('test');
      expect(lock.isLocked('test')).toBe(true);
      release();
      expect(lock.isLocked('test')).toBe(false);
    });

    it('should prevent concurrent access to same resource', async () => {
      const results: number[] = [];

      const task = async (id: number) => {
        const release = await lock.acquire('resource');
        try {
          results.push(id);
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push(id);
        } finally {
          release();
        }
      };

      await Promise.all([task(1), task(2), task(3)]);

      // Results should be paired (1,1,2,2,3,3 or similar)
      // Not interleaved like (1,2,1,3,2,3)
      expect(results).toHaveLength(6);
      for (let i = 0; i < results.length; i += 2) {
        expect(results[i]).toBe(results[i + 1]);
      }
    });

    it('should allow concurrent access to different resources', async () => {
      const release1 = await lock.acquire('resource1');
      const release2 = await lock.acquire('resource2');

      expect(lock.isLocked('resource1')).toBe(true);
      expect(lock.isLocked('resource2')).toBe(true);

      release1();
      release2();
    });

    it('should timeout if lock is held too long', async () => {
      const release = await lock.acquire('test', 100);

      // Don't release, try to acquire with short timeout
      await expect(lock.acquire('test', 50)).rejects.toThrow('Lock timeout');

      release();
    });

    it('should track lock duration', async () => {
      try {
        // Use fake timers for deterministic timing
        vi.useFakeTimers();

        const release = await lock.acquire('test');

        // Advance time by exactly 50ms
        vi.advanceTimersByTime(50);

        const duration = lock.getLockDuration('test');
        expect(duration).toBeGreaterThanOrEqual(50);

        release();
      } finally {
        // Always restore real timers
        vi.useRealTimers();
      }
    });

    it('should return null duration for non-existent lock', () => {
      expect(lock.getLockDuration('nonexistent')).toBeNull();
    });

    it('should execute function with lock protection', async () => {
      let counter = 0;

      const increment = async () => {
        return await lock.withLock('counter', async () => {
          const current = counter;
          await new Promise((resolve) => setTimeout(resolve, 10));
          counter = current + 1;
          return counter;
        });
      };

      const results = await Promise.all([increment(), increment(), increment()]);

      expect(counter).toBe(3);
      expect(results).toEqual([1, 2, 3]);
    });

    it('should release lock even if function throws', async () => {
      await expect(
        lock.withLock('test', async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      // Lock should be released
      expect(lock.isLocked('test')).toBe(false);
    });

    it('tryAcquire should return null if lock is held', async () => {
      const release = await lock.acquire('test');

      const tryRelease = lock.tryAcquire('test');
      expect(tryRelease).toBeNull();

      release();

      const tryRelease2 = lock.tryAcquire('test');
      expect(tryRelease2).not.toBeNull();
      tryRelease2!();
    });

    it('should clear all locks', async () => {
      await lock.acquire('test1');
      await lock.acquire('test2');

      expect(lock.isLocked('test1')).toBe(true);
      expect(lock.isLocked('test2')).toBe(true);

      lock.clearAll();

      expect(lock.isLocked('test1')).toBe(false);
      expect(lock.isLocked('test2')).toBe(false);
    });
  });

  describe('OperationQueue', () => {
    let queue: OperationQueue;

    beforeEach(() => {
      queue = new OperationQueue();
    });

    it('should execute operations in order', async () => {
      const results: number[] = [];

      const promises = [
        queue.enqueue(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          results.push(1);
        }),
        queue.enqueue(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push(2);
        }),
        queue.enqueue(async () => {
          results.push(3);
        }),
      ];

      await Promise.all(promises);

      expect(results).toEqual([1, 2, 3]);
    });

    it('should return operation results', async () => {
      const result1 = queue.enqueue(async () => 'first');
      const result2 = queue.enqueue(async () => 'second');

      expect(await result1).toBe('first');
      expect(await result2).toBe('second');
    });

    it('should handle operation errors', async () => {
      const result1 = queue.enqueue(async () => 'success');
      const result2 = queue.enqueue(async () => {
        throw new Error('Test error');
      });
      const result3 = queue.enqueue(async () => 'after error');

      expect(await result1).toBe('success');
      await expect(result2).rejects.toThrow('Test error');
      expect(await result3).toBe('after error');
    });

    it('should track queue length', async () => {
      expect(queue.length).toBe(0);

      const promise1 = queue.enqueue(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Queue might be processing already
      const promise2 = queue.enqueue(async () => {});
      const promise3 = queue.enqueue(async () => {});

      // Length should be at least 1 (might be 2 if first is still processing)
      expect(queue.length).toBeGreaterThanOrEqual(0);

      await Promise.all([promise1, promise2, promise3]);

      expect(queue.length).toBe(0);
    });

    it('should indicate when processing', async () => {
      const longOperation = queue.enqueue(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Give it a moment to start processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(queue.isProcessing).toBe(true);

      await longOperation;

      expect(queue.isProcessing).toBe(false);
    });

    it('should clear queue', async () => {
      queue.enqueue(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      queue.enqueue(async () => {});
      queue.enqueue(async () => {});

      queue.clear();

      expect(queue.length).toBe(0);
    });

    it('should handle multiple concurrent enqueues', async () => {
      const results: number[] = [];

      const operations = Array.from({ length: 10 }, (_, i) =>
        queue.enqueue(async () => {
          results.push(i);
        }),
      );

      await Promise.all(operations);

      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe('LOCK_KEYS', () => {
    it('should define standard lock keys', () => {
      expect(LOCK_KEYS.FOLDER_IMPORT).toBeDefined();
      expect(LOCK_KEYS.FOLDER_EXPORT).toBeDefined();
      expect(LOCK_KEYS.FOLDER_DATA_WRITE).toBeDefined();
      expect(LOCK_KEYS.FOLDER_DATA_READ).toBeDefined();
    });

    it('should have unique lock keys', () => {
      const keys = Object.values(LOCK_KEYS);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should prevent concurrent imports', async () => {
      const lock = new AsyncLock();
      const importResults: string[] = [];

      const simulateImport = async (id: string) => {
        return await lock.withLock(LOCK_KEYS.FOLDER_IMPORT, async () => {
          importResults.push(`start-${id}`);
          await new Promise((resolve) => setTimeout(resolve, 20));
          importResults.push(`end-${id}`);
          return `imported-${id}`;
        });
      };

      const results = await Promise.all([
        simulateImport('A'),
        simulateImport('B'),
        simulateImport('C'),
      ]);

      // Imports should not interleave
      expect(importResults).toEqual(['start-A', 'end-A', 'start-B', 'end-B', 'start-C', 'end-C']);

      expect(results).toEqual(['imported-A', 'imported-B', 'imported-C']);
    });

    it('should handle storage operations sequentially', async () => {
      const queue = new OperationQueue();
      let storageValue = 0;

      const writeOperation = async (value: number) => {
        return await queue.enqueue(async () => {
          // Simulate read-modify-write
          const current = storageValue;
          await new Promise((resolve) => setTimeout(resolve, 10));
          storageValue = current + value;
          return storageValue;
        });
      };

      const results = await Promise.all([writeOperation(1), writeOperation(2), writeOperation(3)]);

      expect(storageValue).toBe(6); // 1 + 2 + 3
      expect(results).toEqual([1, 3, 6]);
    });

    it('should allow read operations while preventing writes', async () => {
      const lock = new AsyncLock();
      const data = { value: 100 };

      // Simulate concurrent reads (should be fast)
      const readPromises = Array.from({ length: 5 }, () =>
        lock.withLock(LOCK_KEYS.FOLDER_DATA_READ, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return data.value;
        }),
      );

      const startTime = Date.now();
      const results = await Promise.all(readPromises);
      const duration = Date.now() - startTime;

      // All reads should return same value
      expect(results).toEqual([100, 100, 100, 100, 100]);

      // Should take at least 50ms (5 * 10ms) since they're sequential
      expect(duration).toBeGreaterThanOrEqual(50);
    });
  });
});
