import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SafariICloudSyncError,
  checkSafariICloudAccount,
  deleteSafariICloudBackup,
  getSafariICloudRetryDelay,
  isSafariICloudConflictError,
  readSafariICloudFile,
  writeSafariICloudFile,
} from '../safariICloudSync';

const sendNativeMessage = vi.hoisted(() => vi.fn());

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendNativeMessage } },
}));

afterEach(() => {
  sendNativeMessage.mockReset();
});

describe('Safari iCloud sync bridge', () => {
  it('checks the native iCloud account', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { available: true } });

    await expect(checkSafariICloudAccount()).resolves.toBeUndefined();
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'iCloudAccountStatus',
    });
  });

  it('serializes a sync file for the native bridge', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { saved: true } });

    await writeSafariICloudFile('prompts.json', { items: [1] });
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'iCloudWriteFile',
      fileName: 'prompts.json',
      json: '{"items":[1]}',
    });
  });

  it('parses a downloaded sync file', async () => {
    sendNativeMessage.mockResolvedValue({
      success: true,
      data: { found: true, json: '{"items":[1]}' },
    });

    await expect(readSafariICloudFile('prompts.json')).resolves.toEqual({ items: [1] });
  });

  it('returns null when the iCloud record does not exist', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { found: false } });

    await expect(readSafariICloudFile('prompts.json')).resolves.toBeNull();
  });

  it('deletes every native iCloud backup record', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { deleted: 4 } });

    await expect(deleteSafariICloudBackup()).resolves.toBe(4);
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'iCloudDeleteBackup',
    });
  });

  it('surfaces native CloudKit errors', async () => {
    sendNativeMessage.mockResolvedValue({ success: false, error: 'iCloud is unavailable' });

    await expect(checkSafariICloudAccount()).rejects.toThrow('iCloud is unavailable');
  });

  it('preserves native conflict metadata so uploads do not overwrite newer cloud data', async () => {
    sendNativeMessage.mockResolvedValue({
      success: false,
      code: 'icloud_conflict',
      error: 'prompts.json changed on another device',
    });

    const error = await writeSafariICloudFile('prompts.json', {}).catch((caught) => caught);
    expect(error).toBeInstanceOf(SafariICloudSyncError);
    expect(isSafariICloudConflictError(error)).toBe(true);
  });

  it('preserves the native CloudKit retry delay', async () => {
    sendNativeMessage.mockResolvedValue({
      success: false,
      code: 'icloud_temporarily_unavailable',
      error: 'Try again shortly',
      retryAfterMs: 2500,
    });

    const error = await readSafariICloudFile('prompts.json').catch((caught) => caught);
    expect(getSafariICloudRetryDelay(error)).toBe(2500);
  });
});
