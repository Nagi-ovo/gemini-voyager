/**
 * Concurrency control utilities
 * Provides lock mechanisms to prevent race conditions in async operations
 */

/**
 * Simple async lock implementation to prevent concurrent operations
 * Useful for preventing data corruption during import/export operations
 */
export class AsyncLock {
  private locks: Map<string, Promise<void>> = new Map();
  private lockHolders: Map<string, number> = new Map();

  /**
   * Acquire a lock for a given key
   * If lock is already held, waits until it's released
   * @param key - Lock identifier
   * @param timeout - Optional timeout in milliseconds (default: 30000ms)
   * @returns Release function to unlock
   */
  async acquire(key: string, timeout: number = 30000): Promise<() => void> {
    // Wait for existing lock to be released
    while (this.locks.has(key)) {
      const existingLock = this.locks.get(key)!;
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error(`Lock timeout for key: ${key}`)), timeout);
      });

      try {
        await Promise.race([existingLock, timeoutPromise]);
      } catch (error) {
        // Timeout occurred, force release the lock
        this.forceRelease(key);
        throw error;
      }
    }

    // Create new lock
    let releaseFn: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });

    this.locks.set(key, lockPromise);
    this.lockHolders.set(key, Date.now());

    // Return release function
    return () => {
      this.release(key);
      releaseFn!();
    };
  }

  /**
   * Try to acquire lock without waiting
   * @param key - Lock identifier
   * @returns Release function if acquired, null if lock is held
   */
  tryAcquire(key: string): (() => void) | null {
    if (this.locks.has(key)) {
      return null;
    }

    let releaseFn: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });

    this.locks.set(key, lockPromise);
    this.lockHolders.set(key, Date.now());

    return () => {
      this.release(key);
      releaseFn!();
    };
  }

  /**
   * Release a lock
   */
  private release(key: string): void {
    this.locks.delete(key);
    this.lockHolders.delete(key);
  }

  /**
   * Force release a lock (use with caution)
   */
  private forceRelease(key: string): void {
    this.release(key);
  }

  /**
   * Check if a lock is currently held
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * Get how long a lock has been held (in milliseconds)
   */
  getLockDuration(key: string): number | null {
    const timestamp = this.lockHolders.get(key);
    if (!timestamp) {
      return null;
    }
    return Date.now() - timestamp;
  }

  /**
   * Execute a function with lock protection
   * Automatically acquires and releases lock
   */
  async withLock<T>(key: string, fn: () => Promise<T>, timeout?: number): Promise<T> {
    const release = await this.acquire(key, timeout);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Clear all locks (use with caution, mainly for cleanup)
   */
  clearAll(): void {
    this.locks.clear();
    this.lockHolders.clear();
  }
}

/**
 * Global lock instance for import/export operations
 * Use this to prevent concurrent import/export operations
 */
export const importExportLock = new AsyncLock();

/**
 * Lock keys for different operations
 */
export const LOCK_KEYS = {
  FOLDER_IMPORT: 'folder:import',
  FOLDER_EXPORT: 'folder:export',
  FOLDER_DATA_WRITE: 'folder:data:write',
  FOLDER_DATA_READ: 'folder:data:read',
} as const;

/**
 * Decorator for methods that need lock protection
 * Usage: @withLock(LOCK_KEYS.FOLDER_IMPORT)
 */
export function withLock(lockKey: string, timeout?: number) {
  return function (target: object, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (...args: unknown[]) {
      return await importExportLock.withLock(
        lockKey,
        () => originalMethod.apply(this, args),
        timeout,
      );
    };

    return descriptor;
  };
}

/**
 * Storage operation queue to prevent write conflicts
 * Ensures operations are executed in order
 */
export class OperationQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private processing = false;

  /**
   * Add operation to queue
   */
  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.process();
    });
  }

  /**
   * Process queue
   */
  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const operation = this.queue.shift()!;
      try {
        await operation();
      } catch (error) {
        console.error('Operation queue error:', error);
      }
    }

    this.processing = false;
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is processing
   */
  get isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue = [];
  }
}

/**
 * Global operation queue for storage operations
 */
export const storageQueue = new OperationQueue();
