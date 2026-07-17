import browser from 'webextension-polyfill';

const SAFARI_NATIVE_APP_ID = 'com.yourCompany.Gemini-Voyager';

type NativeResponse<Data> = {
  success?: boolean;
  data?: Data;
  error?: unknown;
};

type NativeSessionData = {
  signedIn?: unknown;
  requiresAppLaunch?: unknown;
};

type NativeFileData = {
  fileID?: unknown;
};

type NativeDownloadData = {
  found?: unknown;
  json?: unknown;
};

export type SafariGoogleDriveSession = {
  signedIn: boolean;
  requiresAppLaunch: boolean;
};

async function sendNativeMessage<Data>(
  message: Record<string, unknown>,
): Promise<NativeResponse<Data>> {
  return browser.runtime.sendNativeMessage<Record<string, unknown>, NativeResponse<Data>>(
    SAFARI_NATIVE_APP_ID,
    message,
  );
}

function requireSuccess<Data>(response: NativeResponse<Data>, fallback: string): Data {
  if (response?.success !== true || response.data === undefined) {
    throw new Error(typeof response?.error === 'string' ? response.error : fallback);
  }
  return response.data;
}

export async function requestSafariGoogleDriveSession(
  interactive: boolean,
): Promise<SafariGoogleDriveSession> {
  const response = await sendNativeMessage<NativeSessionData>({
    action: 'googleDriveGetSession',
    interactive,
  });
  const data = requireSuccess(response, 'Safari Google Sign-In is unavailable');
  return {
    signedIn: data.signedIn === true,
    requiresAppLaunch: data.requiresAppLaunch === true,
  };
}

export async function signOutSafariGoogleDrive(): Promise<void> {
  const response = await sendNativeMessage<{ signedOut?: unknown }>({
    action: 'googleDriveSignOut',
  });
  requireSuccess(response, 'Safari Google Sign-Out failed');
}

export async function findSafariGoogleDriveFile(fileName: string): Promise<string | null> {
  const response = await sendNativeMessage<NativeFileData>({
    action: 'googleDriveFindFile',
    fileName,
  });
  const data = requireSuccess(response, 'Safari Google Drive file search failed');
  return typeof data.fileID === 'string' ? data.fileID : null;
}

export async function ensureSafariGoogleDriveFile(
  fileName: string,
  cachedFileID: string | null,
): Promise<string> {
  const response = await sendNativeMessage<NativeFileData>({
    action: 'googleDriveEnsureFile',
    fileName,
    ...(cachedFileID ? { cachedFileID } : {}),
  });
  const data = requireSuccess(response, 'Safari Google Drive file setup failed');
  if (typeof data.fileID !== 'string' || !data.fileID) {
    throw new Error('Safari Google Drive returned an invalid file ID');
  }
  return data.fileID;
}

export async function uploadSafariGoogleDriveFile(fileID: string, data: unknown): Promise<void> {
  const response = await sendNativeMessage<{ saved?: unknown }>({
    action: 'googleDriveUploadFile',
    fileID,
    json: JSON.stringify(data),
  });
  requireSuccess(response, 'Safari Google Drive upload failed');
}

export async function downloadSafariGoogleDriveFile<T>(fileID: string): Promise<T | null> {
  const response = await sendNativeMessage<NativeDownloadData>({
    action: 'googleDriveDownloadFile',
    fileID,
  });
  const data = requireSuccess(response, 'Safari Google Drive download failed');
  if (data.found !== true) return null;
  if (typeof data.json !== 'string') {
    throw new Error('Safari Google Drive returned an invalid download');
  }
  return JSON.parse(data.json) as T;
}
