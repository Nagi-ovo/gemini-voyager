import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkSafariICloudAccount,
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

  it('surfaces native CloudKit errors', async () => {
    sendNativeMessage.mockResolvedValue({ success: false, error: 'iCloud is unavailable' });

    await expect(checkSafariICloudAccount()).rejects.toThrow('iCloud is unavailable');
  });
});
