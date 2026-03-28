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
  const conversationId = 'gemini:conv:test-1';
  const secondConversationId = 'gemini:conv:test-2';

  beforeEach(() => {
    storageService = new MockStorageService();
    timestampService = new TimestampService(storageService);
  });

  it('should initialize with empty timestamps', async () => {
    await timestampService.initialize();
    const timestamp = timestampService.getTimestamp(
      conversationId,
      'test-id' as import('@/core/types/common').TurnId,
    );
    expect(timestamp).toBeNull();
  });

  it('should record and retrieve timestamps', async () => {
    await timestampService.initialize();
    const testId = 'test-turn-id' as import('@/core/types/common').TurnId;
    const testTime = 1672531200000;

    await timestampService.recordTimestamp(conversationId, testId, testTime);
    const retrieved = timestampService.getTimestamp(conversationId, testId);

    expect(retrieved).toBe(testTime);
  });

  it('should persist timestamps to storage', async () => {
    await timestampService.initialize();
    const testId = 'test-turn-id' as import('@/core/types/common').TurnId;
    const testTime = 1672531200000;

    await timestampService.recordTimestamp(conversationId, testId, testTime);

    const result = await storageService.get<{
      version: number;
      conversations: Record<string, Record<string, number>>;
    }>(StorageKeys.GV_MESSAGE_TIMESTAMPS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(2);
      expect(result.data.conversations[conversationId]?.[testId]).toBe(testTime);
    }
  });

  it('should load timestamps from storage on initialize', async () => {
    const testId = 'test-turn-id' as import('@/core/types/common').TurnId;
    const testTime = 1672531200000;

    await storageService.set(StorageKeys.GV_MESSAGE_TIMESTAMPS, {
      version: 2,
      conversations: {
        [conversationId]: {
          [testId]: testTime,
        },
      },
    });

    await timestampService.initialize();
    const retrieved = timestampService.getTimestamp(conversationId, testId);

    expect(retrieved).toBe(testTime);
  });

  it('should return empty string for non-existent timestamp', async () => {
    await timestampService.initialize();
    const testId = 'non-existent' as TurnId;

    const formatted = await timestampService.formatTimestamp(conversationId, testId);
    expect(formatted).toBe('');
  });

  it('should format epoch (0) timestamp as non-empty text', async () => {
    await timestampService.initialize();
    const testId = 'epoch-turn-id' as TurnId;

    await timestampService.recordTimestamp(conversationId, testId, 0);
    const formatted = await timestampService.formatTimestamp(conversationId, testId);

    expect(formatted).not.toBe('');
  });

  it('should isolate timestamps by conversation', async () => {
    await timestampService.initialize();
    const testId = 'shared-turn-id' as TurnId;

    await timestampService.recordTimestamp(conversationId, testId, 1000);
    await timestampService.recordTimestamp(secondConversationId, testId, 2000);

    expect(timestampService.getTimestamp(conversationId, testId)).toBe(1000);
    expect(timestampService.getTimestamp(secondConversationId, testId)).toBe(2000);
  });

  it('should ignore legacy flat timestamp storage', async () => {
    const testId = 'legacy-turn-id' as TurnId;

    await storageService.set(StorageKeys.GV_MESSAGE_TIMESTAMPS, {
      [testId]: 1672531200000,
    });

    await timestampService.initialize();

    expect(timestampService.getTimestamp(conversationId, testId)).toBeNull();

    const stored = await storageService.get(StorageKeys.GV_MESSAGE_TIMESTAMPS);
    expect(stored.success).toBe(false);
  });

  it('should clear timestamps for a single conversation', async () => {
    await timestampService.initialize();
    const firstId = 'turn-1' as TurnId;
    const secondId = 'turn-2' as TurnId;

    await timestampService.recordTimestamp(conversationId, firstId, 1000);
    await timestampService.recordTimestamp(secondConversationId, secondId, 2000);
    await timestampService.clearOldTimestamps(conversationId);

    expect(timestampService.getTimestamp(conversationId, firstId)).toBeNull();
    expect(timestampService.getTimestamp(secondConversationId, secondId)).toBe(2000);
  });

  it('should adopt timestamps from a source conversation for matching turn ids', async () => {
    await timestampService.initialize();
    const sharedTurnId = 'turn-shared' as TurnId;
    const untouchedTurnId = 'turn-untouched' as TurnId;

    await timestampService.recordTimestamp(conversationId, sharedTurnId, 1000);
    await timestampService.recordTimestamp(conversationId, untouchedTurnId, 2000);
    await timestampService.adoptTimestamps(conversationId, secondConversationId, [sharedTurnId]);

    expect(timestampService.getTimestamp(secondConversationId, sharedTurnId)).toBe(1000);
    expect(timestampService.getTimestamp(conversationId, sharedTurnId)).toBeNull();
    expect(timestampService.getTimestamp(conversationId, untouchedTurnId)).toBe(2000);
  });

  it('should return the latest timestamp for a conversation', async () => {
    await timestampService.initialize();
    const firstId = 'turn-1' as TurnId;
    const secondId = 'turn-2' as TurnId;

    await timestampService.recordTimestamp(conversationId, firstId, 1000);
    await timestampService.recordTimestamp(conversationId, secondId, 3000);

    expect(timestampService.getLatestTimestampForConversation(conversationId)).toBe(3000);
    expect(timestampService.getLatestTimestampForConversation(secondConversationId)).toBeNull();
  });
});
