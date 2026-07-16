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
  it('prepares notifications by delivering the native permission primer', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { delivered: true } });

    await expect(prepareSafariNativeNotifications()).resolves.toBe(true);
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'deliverNotification',
      id: 'gemini-voyager-notification-permission',
      title: 'Gemini Voyager',
      body: 'Notifications are enabled.',
    });
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
