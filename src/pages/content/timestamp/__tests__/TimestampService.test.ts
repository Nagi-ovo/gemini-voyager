import { beforeEach, describe, expect, it } from 'vitest';

import type { IStorageService } from '@/core/services/StorageService';
import type { Result } from '@/core/types/common';
import type { TurnId } from '@/core/types/common';
import { StorageKeys } from '@/core/types/common';

import { TimestampService } from '../TimestampService';

// Mock storage service
class MockStorageService implements IStorageService {
  private storage = new Map<string, unknown>();

  async get<T>(key: string): Promise<Result<T>> {
    const value = this.storage.get(key);
    if (value === undefined) {
      return { success: false, error: new Error('Key not found') };
    }
    return { success: true, data: value as T };
  }

  async set<T>(key: string, value: T): Promise<Result<void>> {
    this.storage.set(key, value);
    return { success: true, data: undefined };
  }

  async remove(key: string): Promise<Result<void>> {
    this.storage.delete(key);
    return { success: true, data: undefined };
  }

  async clear(): Promise<Result<void>> {
    this.storage.clear();
    return { success: true, data: undefined };
  }
}

describe('TimestampService', () => {
  let storageService: MockStorageService;
  let timestampService: TimestampService;

  beforeEach(() => {
    storageService = new MockStorageService();
    timestampService = new TimestampService(storageService);
  });

  it('should initialize with empty timestamps', async () => {
    await timestampService.initialize();
    const timestamp = timestampService.getTimestamp(
      'test-id' as import('@/core/types/common').TurnId,
    );
    expect(timestamp).toBeNull();
  });

  it('should record and retrieve timestamps', async () => {
    await timestampService.initialize();
    const testId = 'test-turn-id' as import('@/core/types/common').TurnId;
    const testTime = 1672531200000;

    await timestampService.recordTimestamp(testId, testTime);
    const retrieved = timestampService.getTimestamp(testId);

    expect(retrieved).toBe(testTime);
  });

  it('should persist timestamps to storage', async () => {
    await timestampService.initialize();
    const testId = 'test-turn-id' as import('@/core/types/common').TurnId;
    const testTime = 1672531200000;

    await timestampService.recordTimestamp(testId, testTime);

    const result = await storageService.get<Record<string, number>>(
      StorageKeys.GV_MESSAGE_TIMESTAMPS,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[testId]).toBe(testTime);
    }
  });

  it('should load timestamps from storage on initialize', async () => {
    const testId = 'test-turn-id' as import('@/core/types/common').TurnId;
    const testTime = 1672531200000;

    await storageService.set(StorageKeys.GV_MESSAGE_TIMESTAMPS, {
      [testId]: testTime,
    });

    await timestampService.initialize();
    const retrieved = timestampService.getTimestamp(testId);

    expect(retrieved).toBe(testTime);
  });

  it('should return empty string for non-existent timestamp', async () => {
    await timestampService.initialize();
    const testId = 'non-existent' as TurnId;

    const formatted = await timestampService.formatTimestamp(testId);
    expect(formatted).toBe('');
  });

  it('should format epoch (0) timestamp as non-empty text', async () => {
    await timestampService.initialize();
    const testId = 'epoch-turn-id' as TurnId;

    await timestampService.recordTimestamp(testId, 0);
    const formatted = await timestampService.formatTimestamp(testId);

    expect(formatted).not.toBe('');
  });
});
