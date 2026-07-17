import browser from 'webextension-polyfill';

const SAFARI_NATIVE_APP_ID = 'com.yourCompany.Gemini-Voyager';

type NativeAuthResponse = {
  success?: boolean;
  data?: {
    accessToken?: unknown;
    expiresAt?: unknown;
    authorizationStarted?: unknown;
    requiresAppLaunch?: unknown;
  };
  error?: unknown;
};

export type SafariGoogleDriveToken = {
  accessToken: string | null;
  expiresAt: number;
  authorizationStarted: boolean;
  requiresAppLaunch: boolean;
};

async function sendAuthMessage(message: Record<string, unknown>): Promise<NativeAuthResponse> {
  return browser.runtime.sendNativeMessage<Record<string, unknown>, NativeAuthResponse>(
    SAFARI_NATIVE_APP_ID,
    message,
  );
}

export async function requestSafariGoogleDriveToken(
  interactive: boolean,
): Promise<SafariGoogleDriveToken> {
  const response = await sendAuthMessage({ action: 'googleDriveGetToken', interactive });
  if (response?.success !== true) {
    throw new Error(
      typeof response?.error === 'string' ? response.error : 'Safari Google Sign-In is unavailable',
    );
  }

  const accessToken =
    typeof response.data?.accessToken === 'string' ? response.data.accessToken : null;
  const expiresAt =
    typeof response.data?.expiresAt === 'number' ? response.data.expiresAt : Date.now();

  return {
    accessToken,
    expiresAt,
    authorizationStarted: response.data?.authorizationStarted === true,
    requiresAppLaunch: response.data?.requiresAppLaunch === true,
  };
}

export async function signOutSafariGoogleDrive(): Promise<void> {
  const response = await sendAuthMessage({ action: 'googleDriveSignOut' });
  if (response?.success !== true) {
    throw new Error(
      typeof response?.error === 'string' ? response.error : 'Safari Google Sign-Out failed',
    );
  }
}
