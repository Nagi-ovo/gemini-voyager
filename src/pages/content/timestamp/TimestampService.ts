/**
 * Service for managing message timestamps
 */
import { type IStorageService, StorageFactory } from '@/core/services/StorageService';
import type { TurnId } from '@/core/types/common';
import { StorageKeys } from '@/core/types/common';

interface TimestampMap {
  [turnId: string]: number;
}

interface TimestampStorageData {
  version: 2;
  conversations: Record<string, TimestampMap>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTimestampMap(value: unknown): value is TimestampMap {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isFiniteTimestamp);
}

/** Cap on stored conversations; oldest (by latest timestamp) are pruned first. */
export const MAX_TIMESTAMP_CONVERSATIONS = 300;

/**
 * Pure helper: pick which conversation ids to drop so at most
 * `maxConversations` remain. Conversations whose latest timestamp is oldest
 * are dropped first; empty conversations count as oldest.
 */
export function selectConversationIdsToPrune<K>(
  conversations: ReadonlyMap<string, ReadonlyMap<K, number>>,
  maxConversations: number,
): string[] {
  if (maxConversations < 0 || conversations.size <= maxConversations) return [];

  const latestByConversation: Array<[string, number]> = [];
  conversations.forEach((turnTimestamps, conversationId) => {
    let latest = -Infinity;
    turnTimestamps.forEach((timestamp) => {
      if (timestamp > latest) latest = timestamp;
    });
    latestByConversation.push([conversationId, latest]);
  });

  latestByConversation.sort((a, b) => a[1] - b[1]);
  return latestByConversation
    .slice(0, conversations.size - maxConversations)
    .map(([conversationId]) => conversationId);
}

export class TimestampService {
  private timestamps: Map<string, Map<TurnId, number>> = new Map();
  /** True when in-memory state has mutations not yet serialized to storage. */
  private dirty = false;
  private pendingPersist: {
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason?: unknown) => void;
  } | null = null;

  constructor(private storageService: IStorageService = StorageFactory.create('local')) {}

  async initialize(): Promise<void> {
    const result = await this.storageService.get<unknown>(StorageKeys.GV_MESSAGE_TIMESTAMPS);
    if (!result.success || !result.data) return;

    const { conversations, legacyDetected } = this.parseStorageData(result.data);
    this.timestamps = conversations;

    if (legacyDetected) {
      // Legacy v1 stored timestamps globally by turnId only, which can leak across conversations.
      await this.storageService.remove(StorageKeys.GV_MESSAGE_TIMESTAMPS);
    }
  }

  async recordTimestamp(conversationId: string, turnId: TurnId, timestamp?: number): Promise<void> {
    const ts = timestamp ?? Date.now();
    const conversationTimestamps = this.getConversationTimestamps(conversationId, true);
    conversationTimestamps.set(turnId, ts);
    await this.schedulePersist();
  }

  getTimestamp(conversationId: string, turnId: TurnId): number | null {
    return this.timestamps.get(conversationId)?.get(turnId) ?? null;
  }

  async formatTimestamp(conversationId: string, turnId: TurnId): Promise<string> {
    const timestamp = this.getTimestamp(conversationId, turnId);
    if (timestamp == null) return '';
    return this.formatAbsoluteTime(timestamp);
  }

  formatAbsoluteTime(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private async persistTimestamps(): Promise<void> {
    // The snapshot below is taken synchronously, so any mutation arriving
    // after this point re-marks dirty and triggers another persist round.
    this.dirty = false;

    // Bound growth: prune the oldest conversations beyond the cap.
    selectConversationIdsToPrune(this.timestamps, MAX_TIMESTAMP_CONVERSATIONS).forEach(
      (conversationId) => this.timestamps.delete(conversationId),
    );

    const conversations: Record<string, TimestampMap> = {};
    this.timestamps.forEach((conversationTimestamps, conversationId) => {
      if (conversationTimestamps.size === 0) return;

      const turnTimestamps: TimestampMap = {};
      conversationTimestamps.forEach((timestamp, turnId) => {
        turnTimestamps[turnId] = timestamp;
      });
      conversations[conversationId] = turnTimestamps;
    });
    await this.storageService.set<TimestampStorageData>(StorageKeys.GV_MESSAGE_TIMESTAMPS, {
      version: 2,
      conversations,
    });
  }

  private schedulePersist(): Promise<void> {
    this.dirty = true;
    if (this.pendingPersist) {
      return this.pendingPersist.promise;
    }

    let resolvePersist!: () => void;
    let rejectPersist!: (reason?: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePersist = resolve;
      rejectPersist = reject;
    });
    this.pendingPersist = {
      promise,
      resolve: resolvePersist,
      reject: rejectPersist,
    };

    setTimeout(() => {
      void this.flushPersist();
    }, 0);

    return promise;
  }

  private async flushPersist(): Promise<void> {
    const pending = this.pendingPersist;
    try {
      await this.persistTimestamps();
      pending?.resolve();
    } catch (error) {
      pending?.reject(error);
    } finally {
      this.pendingPersist = null;
      // Mutations that arrived while persistTimestamps was awaiting storage
      // reused the now-settled pending promise; without this re-schedule they
      // would sit in memory until the next unrelated mutation.
      if (this.dirty) {
        void this.schedulePersist();
      }
    }
  }

  async clearOldTimestamps(conversationId: string): Promise<void> {
    if (!this.timestamps.delete(conversationId)) return;
    await this.schedulePersist();
  }

  getLatestTimestampForConversation(conversationId: string): number | null {
    const conversationTimestamps = this.timestamps.get(conversationId);
    if (!conversationTimestamps || conversationTimestamps.size === 0) return null;

    let latestTimestamp = -Infinity;
    conversationTimestamps.forEach((timestamp) => {
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
      }
    });

    return Number.isFinite(latestTimestamp) ? latestTimestamp : null;
  }

  async adoptTimestamps(
    sourceConversationId: string,
    targetConversationId: string,
    turnIds: TurnId[],
  ): Promise<void> {
    if (sourceConversationId === targetConversationId || turnIds.length === 0) return;

    const sourceTimestamps = this.timestamps.get(sourceConversationId);
    if (!sourceTimestamps || sourceTimestamps.size === 0) return;

    const targetTimestamps = this.getConversationTimestamps(targetConversationId, true);
    let changed = false;

    turnIds.forEach((turnId) => {
      const timestamp = sourceTimestamps.get(turnId);
      if (timestamp == null || targetTimestamps.has(turnId)) return;

      targetTimestamps.set(turnId, timestamp);
      sourceTimestamps.delete(turnId);
      changed = true;
    });

    if (!changed) return;

    if (sourceTimestamps.size === 0) {
      this.timestamps.delete(sourceConversationId);
    }

    await this.schedulePersist();
  }

  private parseStorageData(data: unknown): {
    conversations: Map<string, Map<TurnId, number>>;
    legacyDetected: boolean;
  } {
    const conversations = new Map<string, Map<TurnId, number>>();
    let legacyDetected = false;

    if (!isRecord(data)) {
      return { conversations, legacyDetected };
    }

    if (isTimestampMap(data)) {
      legacyDetected = true;
      return { conversations, legacyDetected };
    }

    if (data.version !== 2 || !isRecord(data.conversations)) {
      return { conversations, legacyDetected };
    }

    Object.entries(data.conversations).forEach(([conversationId, turnTimestamps]) => {
      if (!isTimestampMap(turnTimestamps)) return;

      const perConversationMap = new Map<TurnId, number>();
      Object.entries(turnTimestamps).forEach(([turnId, timestamp]) => {
        perConversationMap.set(turnId as TurnId, timestamp);
      });

      if (perConversationMap.size > 0) {
        conversations.set(conversationId, perConversationMap);
      }
    });

    return { conversations, legacyDetected };
  }

  private getConversationTimestamps(
    conversationId: string,
    createIfMissing: boolean,
  ): Map<TurnId, number> {
    const existing = this.timestamps.get(conversationId);
    if (existing) return existing;

    if (!createIfMissing) {
      return new Map<TurnId, number>();
    }

    const created = new Map<TurnId, number>();
    this.timestamps.set(conversationId, created);
    return created;
  }
}
