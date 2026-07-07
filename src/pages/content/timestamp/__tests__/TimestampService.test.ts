import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IStorageService } from '@/core/services/StorageService';
import type { Result } from '@/core/types/common';
import type { TurnId } from '@/core/types/common';
import { StorageKeys } from '@/core/types/common';

import {
  MAX_TIMESTAMP_CONVERSATIONS,
  TimestampService,
  selectConversationIdsToPrune,
} from '../TimestampService';

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

  it('persists mutations that arrive while a flush is writing to storage', async () => {
    let releaseFirstSet: () => void = () => {};
    let setCalls = 0;
    const storedValues: Array<{
      version: number;
      conversations: Record<string, Record<string, number>>;
    }> = [];
    const slowStorage: IStorageService = {
      async get<T>(): Promise<Result<T>> {
        return { success: false, error: new Error('empty') };
      },
      async set<T>(_key: string, value: T): Promise<Result<void>> {
        setCalls++;
        storedValues.push(
          value as { version: number; conversations: Record<string, Record<string, number>> },
        );
        if (setCalls === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstSet = resolve;
          });
        }
        return { success: true, data: undefined };
      },
      async remove(): Promise<Result<void>> {
        return { success: true, data: undefined };
      },
      async clear(): Promise<Result<void>> {
        return { success: true, data: undefined };
      },
    };
    const service = new TimestampService(slowStorage);
    await service.initialize();

    const firstPersist = service.recordTimestamp(conversationId, 'turn-a' as TurnId, 1000);
    // Wait until the first flush is inside storage.set (snapshot already taken)
    await vi.waitFor(() => expect(setCalls).toBe(1));

    // This mutation arrives mid-flush: it reuses the pending persist promise
    const secondPersist = service.recordTimestamp(conversationId, 'turn-b' as TurnId, 2000);

    releaseFirstSet();
    await firstPersist;
    await secondPersist;

    // A follow-up flush must run and include the mid-flight mutation
    await vi.waitFor(() => expect(setCalls).toBe(2));
    const lastStored = storedValues[storedValues.length - 1];
    expect(lastStored.conversations[conversationId]['turn-a']).toBe(1000);
    expect(lastStored.conversations[conversationId]['turn-b']).toBe(2000);
  });

  it('prunes the oldest conversations beyond the cap when persisting', async () => {
    await timestampService.initialize();

    for (let i = 0; i <= MAX_TIMESTAMP_CONVERSATIONS; i++) {
      await timestampService.recordTimestamp(`gemini:conv:cap-${i}`, 'turn-1' as TurnId, 1000 + i);
    }

    // The oldest conversation (cap-0) must be pruned, the newest retained
    expect(timestampService.getTimestamp('gemini:conv:cap-0', 'turn-1' as TurnId)).toBeNull();
    expect(
      timestampService.getTimestamp(
        `gemini:conv:cap-${MAX_TIMESTAMP_CONVERSATIONS}`,
        'turn-1' as TurnId,
      ),
    ).toBe(1000 + MAX_TIMESTAMP_CONVERSATIONS);

    const result = await storageService.get<{
      version: number;
      conversations: Record<string, Record<string, number>>;
    }>(StorageKeys.GV_MESSAGE_TIMESTAMPS);
    expect(result.success).toBe(true);
    if (result.success) {
      const ids = Object.keys(result.data.conversations);
      expect(ids).toHaveLength(MAX_TIMESTAMP_CONVERSATIONS);
      expect(ids).not.toContain('gemini:conv:cap-0');
    }
  });
});

describe('selectConversationIdsToPrune', () => {
  function conversationMap(entries: Array<[string, number[]]>): Map<string, Map<string, number>> {
    return new Map(
      entries.map(([id, timestamps]) => [
        id,
        new Map(timestamps.map((ts, i) => [`turn-${i}`, ts])),
      ]),
    );
  }

  it('returns empty when at or under the cap', () => {
    const conversations = conversationMap([
      ['a', [100]],
      ['b', [200]],
    ]);
    expect(selectConversationIdsToPrune(conversations, 2)).toEqual([]);
    expect(selectConversationIdsToPrune(conversations, 3)).toEqual([]);
  });

  it('drops conversations with the oldest latest-timestamp first', () => {
    const conversations = conversationMap([
      ['newest', [50, 900]],
      ['oldest', [100, 200]],
      ['middle', [500]],
    ]);
    expect(selectConversationIdsToPrune(conversations, 2)).toEqual(['oldest']);
    expect(selectConversationIdsToPrune(conversations, 1)).toEqual(['oldest', 'middle']);
  });

  it('treats empty conversations as oldest', () => {
    const conversations = conversationMap([
      ['empty', []],
      ['real', [100]],
    ]);
    expect(selectConversationIdsToPrune(conversations, 1)).toEqual(['empty']);
  });
});
