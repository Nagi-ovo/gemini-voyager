import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  requestSafariNotificationPermission,
  showSafariNativeNotification,
} from '../safariNativeNotifications';

const sendNativeMessage = vi.hoisted(() => vi.fn());

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendNativeMessage } },
}));

afterEach(() => {
  sendNativeMessage.mockReset();
});

describe('Safari native notifications', () => {
  it('requests notification permission through the native extension', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { authorized: true } });

    await expect(requestSafariNotificationPermission()).resolves.toBe(true);
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'requestNotificationPermission',
    });
  });

  it('sends notification content through the native extension', async () => {
    sendNativeMessage.mockResolvedValue({ success: true });

    await expect(
      showSafariNativeNotification({ id: 'reply-1', title: 'Voyager', message: 'Done' }),
    ).resolves.toBe(true);
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'showNotification',
      id: 'reply-1',
      title: 'Voyager',
      message: 'Done',
    });
  });

  it('returns false when native messaging is unavailable', async () => {
    sendNativeMessage.mockRejectedValue(new Error('unavailable'));

    await expect(requestSafariNotificationPermission()).resolves.toBe(false);
  });
});
