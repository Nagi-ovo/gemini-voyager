import browser from 'webextension-polyfill';

const SAFARI_NATIVE_APP_ID = 'com.yourCompany.Gemini-Voyager';

type NativeNotificationResponse = {
  success?: boolean;
  data?: {
    authorized?: boolean;
  };
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

export async function requestSafariNotificationPermission(): Promise<boolean> {
  const response = await sendNativeNotificationMessage({
    action: 'requestNotificationPermission',
  });
  return response?.success === true && response.data?.authorized === true;
}

export async function showSafariNativeNotification(details: {
  id: string;
  title: string;
  message: string;
}): Promise<boolean> {
  const response = await sendNativeNotificationMessage({
    action: 'showNotification',
    ...details,
  });
  return response?.success === true;
}
