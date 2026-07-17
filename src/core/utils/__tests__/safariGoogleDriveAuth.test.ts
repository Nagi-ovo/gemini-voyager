import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestSafariGoogleDriveToken, signOutSafariGoogleDrive } from '../safariGoogleDriveAuth';

const sendNativeMessage = vi.hoisted(() => vi.fn());

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendNativeMessage } },
}));

afterEach(() => {
  sendNativeMessage.mockReset();
});

describe('Safari Google Drive authentication', () => {
  it('gets a refreshed Drive token from the native Keychain bridge', async () => {
    sendNativeMessage.mockResolvedValue({
      success: true,
      data: { accessToken: 'native-token', expiresAt: 1_800_000_000_000 },
    });

    await expect(requestSafariGoogleDriveToken(false)).resolves.toEqual({
      accessToken: 'native-token',
      expiresAt: 1_800_000_000_000,
      authorizationStarted: false,
    });
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'googleDriveGetToken',
      interactive: false,
    });
  });

  it('reports when interactive sign-in moved to the containing app', async () => {
    sendNativeMessage.mockResolvedValue({
      success: true,
      data: { authorizationStarted: true },
    });

    await expect(requestSafariGoogleDriveToken(true)).resolves.toEqual({
      accessToken: null,
      expiresAt: expect.any(Number),
      authorizationStarted: true,
    });
  });

  it('signs out through the native Google Sign-In session', async () => {
    sendNativeMessage.mockResolvedValue({ success: true, data: { signedOut: true } });

    await expect(signOutSafariGoogleDrive()).resolves.toBeUndefined();
    expect(sendNativeMessage).toHaveBeenCalledWith('com.yourCompany.Gemini-Voyager', {
      action: 'googleDriveSignOut',
    });
  });

  it('surfaces native configuration errors', async () => {
    sendNativeMessage.mockResolvedValue({ success: false, error: 'Missing client ID' });

    await expect(requestSafariGoogleDriveToken(true)).rejects.toThrow('Missing client ID');
  });
});
