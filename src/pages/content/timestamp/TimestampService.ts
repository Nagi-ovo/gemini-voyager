/**
 * Service for managing message timestamps
 */
import { type IStorageService, StorageFactory } from '@/core/services/StorageService';
import type { TurnId } from '@/core/types/common';
import { StorageKeys } from '@/core/types/common';

interface TimestampMap {
  [turnId: string]: number;
}

export class TimestampService {
  private timestamps: Map<TurnId, number> = new Map();
  private pendingPersist: {
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason?: unknown) => void;
  } | null = null;

  constructor(private storageService: IStorageService = StorageFactory.create('local')) {}

  async initialize(): Promise<void> {
    const result = await this.storageService.get<TimestampMap>(StorageKeys.GV_MESSAGE_TIMESTAMPS);
    if (result.success && result.data) {
      Object.entries(result.data).forEach(([turnId, timestamp]) => {
        this.timestamps.set(turnId as TurnId, timestamp);
      });
    }
  }

  async recordTimestamp(turnId: TurnId, timestamp?: number): Promise<void> {
    const ts = timestamp ?? Date.now();
    this.timestamps.set(turnId, ts);
    await this.schedulePersist();
  }

  getTimestamp(turnId: TurnId): number | null {
    return this.timestamps.get(turnId) ?? null;
  }

  async formatTimestamp(turnId: TurnId): Promise<string> {
    const timestamp = this.getTimestamp(turnId);
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
    const obj: TimestampMap = {};
    this.timestamps.forEach((timestamp, turnId) => {
      obj[turnId] = timestamp;
    });
    await this.storageService.set(StorageKeys.GV_MESSAGE_TIMESTAMPS, obj);
  }

  private schedulePersist(): Promise<void> {
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
    try {
      await this.persistTimestamps();
      this.pendingPersist?.resolve();
    } catch (error) {
      this.pendingPersist?.reject(error);
    } finally {
      this.pendingPersist = null;
    }
  }

  async clearOldTimestamps(_conversationId: string): Promise<void> {
    // TurnId currently does not encode conversationId. Keeping this as no-op avoids accidental data loss.
    return;
  }
}
