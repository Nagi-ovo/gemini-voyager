import { describe, expect, it, vi } from 'vitest';

import {
  StorageQuotaWarningBackgroundService,
  type StorageQuotaWarningLevel,
  resolveStorageQuotaWarningTransition,
} from './background';

describe('storage quota warning transitions', () => {
  it('notifies only when crossing the warning and critical thresholds', () => {
    expect(resolveStorageQuotaWarningTransition('normal', 0.8)).toEqual({
      nextLevel: 'warning',
      notify: 'warning',
    });
    expect(resolveStorageQuotaWarningTransition('warning', 0.94)).toEqual({
      nextLevel: 'warning',
      notify: null,
    });
    expect(resolveStorageQuotaWarningTransition('warning', 0.95)).toEqual({
      nextLevel: 'critical',
      notify: 'critical',
    });
    expect(resolveStorageQuotaWarningTransition('critical', 1.02)).toEqual({
      nextLevel: 'critical',
      notify: null,
    });
  });

  it('uses hysteresis before re-arming a warning', () => {
    expect(resolveStorageQuotaWarningTransition('warning', 0.79)).toEqual({
      nextLevel: 'warning',
      notify: null,
    });
    expect(resolveStorageQuotaWarningTransition('warning', 0.74)).toEqual({
      nextLevel: 'normal',
      notify: null,
    });
    expect(resolveStorageQuotaWarningTransition('critical', 0.91)).toEqual({
      nextLevel: 'critical',
      notify: null,
    });
    expect(resolveStorageQuotaWarningTransition('critical', 0.89)).toEqual({
      nextLevel: 'warning',
      notify: null,
    });
  });
});

describe('StorageQuotaWarningBackgroundService', () => {
  it('acknowledges ready messages without holding the reply channel open', () => {
    const service = new StorageQuotaWarningBackgroundService({
      getUsageRatio: async () => null,
    });
    service.start();

    const addListener = chrome.runtime.onMessage.addListener as unknown as ReturnType<typeof vi.fn>;
    const listener = addListener.mock.calls.at(-1)?.[0] as (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ) => boolean | undefined;
    const sendResponse = vi.fn();

    const result = listener(
      { type: 'gv.storageQuota.ready' },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    expect(result).toBeUndefined();
  });

  it('persists a delivered warning so repeated checks stay quiet', async () => {
    let storedLevel: StorageQuotaWarningLevel = 'normal';
    const writeLevel = vi.fn(async (level: StorageQuotaWarningLevel) => {
      storedLevel = level;
    });
    const deliverWarning = vi.fn(async () => true);
    const service = new StorageQuotaWarningBackgroundService({
      getUsageRatio: async () => 0.82,
      readLevel: async () => storedLevel,
      writeLevel,
      deliverWarning,
    });

    await service.checkNow(42);
    await service.checkNow(42);

    expect(deliverWarning).toHaveBeenCalledOnce();
    expect(deliverWarning).toHaveBeenCalledWith({ level: 'warning', percent: 82 }, 42);
    expect(writeLevel).toHaveBeenCalledOnce();
    expect(storedLevel).toBe('warning');
  });

  it('does not consume the warning when no page received it', async () => {
    const writeLevel = vi.fn(async () => undefined);
    const deliverWarning = vi.fn(async () => false);
    const service = new StorageQuotaWarningBackgroundService({
      getUsageRatio: async () => 0.96,
      readLevel: async () => 'normal',
      writeLevel,
      deliverWarning,
    });

    await service.checkNow();

    expect(deliverWarning).toHaveBeenCalledWith({ level: 'critical', percent: 96 }, undefined);
    expect(writeLevel).not.toHaveBeenCalled();
  });

  it('re-arms only after usage falls below the reset boundary', async () => {
    let ratio = 0.82;
    let storedLevel: StorageQuotaWarningLevel = 'normal';
    const deliverWarning = vi.fn(async () => true);
    const service = new StorageQuotaWarningBackgroundService({
      getUsageRatio: async () => ratio,
      readLevel: async () => storedLevel,
      writeLevel: async (level) => {
        storedLevel = level;
      },
      deliverWarning,
    });

    await service.checkNow();
    ratio = 0.79;
    await service.checkNow();
    ratio = 0.74;
    await service.checkNow();
    ratio = 0.81;
    await service.checkNow();

    expect(deliverWarning).toHaveBeenCalledTimes(2);
  });
});
