import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageMonitor } from '../StorageMonitor';

function mockStorageEstimate(usage: number, quota: number) {
  Object.defineProperty(navigator, 'storage', {
    value: { estimate: vi.fn().mockResolvedValue({ usage, quota }) },
    configurable: true,
    writable: true,
  });
}

describe('StorageMonitor', () => {
  beforeEach(() => {
    // Reset singleton before each test so tests are isolated
    StorageMonitor.resetInstance();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    StorageMonitor.resetInstance();
    vi.restoreAllMocks();
  });

  describe('isStorageApiAvailable()', () => {
    it('returns true when navigator.storage.estimate is a function', () => {
      mockStorageEstimate(500_000, 1_000_000);

      expect(StorageMonitor.isStorageApiAvailable()).toBe(true);
    });

    it('returns false when navigator.storage.estimate is not a function', () => {
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: undefined },
        configurable: true,
        writable: true,
      });

      expect(StorageMonitor.isStorageApiAvailable()).toBe(false);
    });
  });

  describe('checkQuota()', () => {
    it('returns an object containing usage, quota, and usagePercent fields', async () => {
      mockStorageEstimate(500_000, 1_000_000);

      const monitor = StorageMonitor.getInstance();
      const result = await monitor.checkQuota();

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('quota');
      expect(result).toHaveProperty('usagePercent');
    });

    it('returns usagePercent ≈ 0.5 when usage=500_000 and quota=1_000_000', async () => {
      mockStorageEstimate(500_000, 1_000_000);

      const monitor = StorageMonitor.getInstance();
      const result = await monitor.checkQuota();

      expect(result).not.toBeNull();
      expect(result!.usage).toBe(500_000);
      expect(result!.quota).toBe(1_000_000);
      expect(result!.usagePercent).toBeCloseTo(0.5);
    });

    it('does not throw and returns null gracefully when estimate returns empty object {}', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: vi.fn().mockResolvedValue({}) },
        configurable: true,
        writable: true,
      });

      const monitor = StorageMonitor.getInstance();

      // quota will be 0 → triggers the "quota is 0" guard → returns null without throwing
      await expect(monitor.checkQuota()).resolves.toBeNull();
    });
  });
});
