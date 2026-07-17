import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deliverSafariNativeNotification,
  prepareSafariNativeNotifications,
} from '../safariNativeNotifications';

const sendNativeMessage = vi.hoisted(() => vi.fn());

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendNativeMessage } },
}));

afterEach(() => {
  sendNativeMessage.mockReset();
});

describe('Safari native notifications', () => {
  it('requests native notification permission without sending a placeholder notification', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { granted: true } });

    await expect(prepareSafariNativeNotifications()).resolves.toBe(true);
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'requestNotificationPermission',
    });
  });

  it('keeps the notification setting off when native permission is denied', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { granted: false } });

    await expect(prepareSafariNativeNotifications()).resolves.toBe(false);
  });

  it('sends notification content through the native extension', async () => {
    sendNativeMessage.mockResolvedValue({ success: true });

    await expect(
      deliverSafariNativeNotification({ id: 'reply-1', title: 'Voyager', body: 'Done' }),
    ).resolves.toBe(true);
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'deliverNotification',
      id: 'reply-1',
      title: 'Voyager',
      body: 'Done',
    });
  });

  it('returns false when native messaging is unavailable', async () => {
    sendNativeMessage.mockRejectedValue(new Error('unavailable'));

    await expect(prepareSafariNativeNotifications()).resolves.toBe(false);
  });
});
