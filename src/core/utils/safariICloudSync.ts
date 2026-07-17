import browser from 'webextension-polyfill';

const SAFARI_NATIVE_APP_ID = 'com.yourCompany.Gemini-Voyager';

type NativeICloudResponse = {
  success?: boolean;
  data?: {
    available?: unknown;
    found?: unknown;
    json?: unknown;
  };
  error?: unknown;
};

async function sendICloudMessage(message: Record<string, unknown>): Promise<NativeICloudResponse> {
  return browser.runtime.sendNativeMessage<Record<string, unknown>, NativeICloudResponse>(
    SAFARI_NATIVE_APP_ID,
    message,
  );
}

function responseError(response: NativeICloudResponse, fallback: string): Error {
  return new Error(typeof response.error === 'string' ? response.error : fallback);
}

export async function checkSafariICloudAccount(): Promise<void> {
  const response = await sendICloudMessage({ action: 'iCloudAccountStatus' });
  if (response.success !== true || response.data?.available !== true) {
    throw responseError(response, 'iCloud is unavailable');
  }
}

export async function writeSafariICloudFile(fileName: string, value: unknown): Promise<void> {
  const response = await sendICloudMessage({
    action: 'iCloudWriteFile',
    fileName,
    json: JSON.stringify(value),
  });
  if (response.success !== true) {
    throw responseError(response, 'iCloud upload failed');
  }
}

export async function readSafariICloudFile<T>(fileName: string): Promise<T | null> {
  const response = await sendICloudMessage({ action: 'iCloudReadFile', fileName });
  if (response.success !== true) {
    throw responseError(response, 'iCloud download failed');
  }
  if (response.data?.found !== true) return null;
  if (typeof response.data.json !== 'string') {
    throw new Error('The iCloud sync file is invalid');
  }
  return JSON.parse(response.data.json) as T;
}
