import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SAFARI_CLIPBOARD_IMAGE_COPY_REQUEST,
  copySafariNativeImagePng,
  requestSafariNativeImageCopy,
} from '../safariNativeClipboard';

const sendNativeMessage = vi.hoisted(() => vi.fn());
const sendMessage = vi.hoisted(() => vi.fn());

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendNativeMessage, sendMessage } },
}));

afterEach(() => {
  sendNativeMessage.mockReset();
  sendMessage.mockReset();
});

describe('Safari native clipboard bridge', () => {
  it('copies a png through the native pasteboard action', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { copied: true } });

    await expect(copySafariNativeImagePng('aW1n')).resolves.toBe(true);
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'copyImageToPasteboard',
      pngBase64: 'aW1n',
    });
  });

  it('reports failure when the native app declines the write', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { copied: false } });

    await expect(copySafariNativeImagePng('aW1n')).resolves.toBe(false);
  });

  it('returns false instead of throwing when native messaging is unavailable', async () => {
    sendNativeMessage.mockRejectedValue(new Error('no native host'));

    await expect(copySafariNativeImagePng('aW1n')).resolves.toBe(false);
  });

  it('routes content-script requests through the background service worker', async () => {
    sendMessage.mockResolvedValue({ ok: true, copied: true });

    await expect(requestSafariNativeImageCopy('aW1n')).resolves.toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({
      type: SAFARI_CLIPBOARD_IMAGE_COPY_REQUEST,
      payload: { pngBase64: 'aW1n' },
    });

    sendMessage.mockRejectedValue(new Error('no background'));
    await expect(requestSafariNativeImageCopy('aW1n')).resolves.toBe(false);
  });
});
