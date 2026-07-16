import browser from 'webextension-polyfill';

const SAFARI_NATIVE_APP_ID = 'com.yourCompany.Gemini-Voyager';

type NativeNotificationResponse = {
  success?: boolean;
};

async function sendNativeNotificationMessage(
  message: Record<string, unknown>,
): Promise<NativeNotificationResponse | null> {
  try {
    return await browser.runtime.sendNativeMessage<
      Record<string, unknown>,
      NativeNotificationResponse
    >(SAFARI_NATIVE_APP_ID, message);
  } catch {
    return null;
  }
}

export async function prepareSafariNativeNotifications(): Promise<boolean> {
  return deliverSafariNativeNotification({
    id: 'gemini-voyager-notification-permission',
    title: 'Gemini Voyager',
    body: 'Notifications are enabled.',
  });
}

export async function deliverSafariNativeNotification(details: {
  id: string;
  title: string;
  body: string;
}): Promise<boolean> {
  const response = await sendNativeNotificationMessage({
    action: 'deliverNotification',
    ...details,
  });
  return response?.success === true;
}
