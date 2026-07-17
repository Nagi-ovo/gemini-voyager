import { afterEach, describe, expect, it, vi } from 'vitest';

const requestSafariGoogleDriveToken = vi.hoisted(() => vi.fn());
const signOutSafariGoogleDrive = vi.hoisted(() => vi.fn());
const checkSafariICloudAccount = vi.hoisted(() => vi.fn());
const getSafariICloudRetryDelay = vi.hoisted(() => vi.fn((): number | null => null));
const isSafariICloudConflictError = vi.hoisted(() => vi.fn(() => false));
const readSafariICloudFile = vi.hoisted(() => vi.fn());
const writeSafariICloudFile = vi.hoisted(() => vi.fn());
const safariRuntime = vi.hoisted(() => ({ buildTarget: 'safari', userAgentMatches: false }));

vi.mock('@/core/utils/browser', () => ({
  getVoyagerBuildTarget: () => safariRuntime.buildTarget,
  isBrave: () => false,
  isSafari: () => safariRuntime.userAgentMatches,
}));

vi.mock('@/core/utils/safariGoogleDriveAuth', () => ({
  requestSafariGoogleDriveToken,
  signOutSafariGoogleDrive,
}));

vi.mock('@/core/utils/safariICloudSync', () => ({
  checkSafariICloudAccount,
  getSafariICloudRetryDelay,
  isSafariICloudConflictError,
  readSafariICloudFile,
  writeSafariICloudFile,
}));

function createChromeMock(stored: Record<string, unknown> = {}) {
  return {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue(stored),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as typeof chrome;
}

async function loadServiceClass() {
  vi.resetModules();
  const module = await import('../GoogleDriveSyncService');
  return module.GoogleDriveSyncService;
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  getSafariICloudRetryDelay.mockReturnValue(null);
  isSafariICloudConflictError.mockReturnValue(false);
  safariRuntime.buildTarget = 'safari';
  safariRuntime.userAgentMatches = false;
});

describe('GoogleDriveSyncService Safari authentication', () => {
  it('uses the native token without persisting it in extension storage', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: typeof chrome }).chrome = chromeMock;
    requestSafariGoogleDriveToken.mockResolvedValue({
      accessToken: 'keychain-token',
      expiresAt: Date.now() + 3_600_000,
      authorizationStarted: false,
    });

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await expect(service.authenticate(true)).resolves.toBe(true);
    expect(requestSafariGoogleDriveToken).toHaveBeenCalledWith(true);
    expect(chromeMock.storage.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ gvAccessToken: expect.anything() }),
    );
  });

  it('handles a native authorization flow that has already started', async () => {
    (globalThis as { chrome: typeof chrome }).chrome = createChromeMock();
    requestSafariGoogleDriveToken.mockResolvedValue({
      accessToken: null,
      expiresAt: Date.now(),
      authorizationStarted: true,
    });

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await expect(service.authenticate(true)).resolves.toBe(false);
    await expect(service.getState()).resolves.toMatchObject({
      error: 'Finish signing in to Google in the Voyager app, then return to Safari.',
    });
  });

  it('asks Safari users to open Voyager when the native extension cannot launch the app', async () => {
    (globalThis as { chrome: typeof chrome }).chrome = createChromeMock();
    requestSafariGoogleDriveToken.mockResolvedValue({
      accessToken: null,
      expiresAt: Date.now(),
      authorizationStarted: false,
      requiresAppLaunch: true,
    });

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await expect(service.authenticate(true)).resolves.toBe(false);
    await expect(service.getState()).resolves.toMatchObject({
      error: 'Open Voyager to connect Google Drive, then try again.',
    });
  });

  it('clears the native Keychain session on sign out', async () => {
    (globalThis as { chrome: typeof chrome }).chrome = createChromeMock();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    requestSafariGoogleDriveToken.mockResolvedValue({
      accessToken: 'keychain-token',
      expiresAt: Date.now() + 3_600_000,
      authorizationStarted: false,
    });

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();
    await service.authenticate(true);
    await service.signOut();

    expect(signOutSafariGoogleDrive).toHaveBeenCalledOnce();
    await expect(service.getState()).resolves.toMatchObject({ isAuthenticated: false });
  });
});

describe('GoogleDriveSyncService Safari iCloud provider', () => {
  it('restores iCloud from the Safari build target when the background UA is reduced', async () => {
    (globalThis as { chrome: typeof chrome }).chrome = createChromeMock({
      gvSyncProvider: 'icloud',
    });
    checkSafariICloudAccount.mockResolvedValue(undefined);

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();

    await expect(service.getState()).resolves.toMatchObject({ provider: 'icloud' });
  });

  it('uses CloudKit as the file transport after switching providers', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: typeof chrome }).chrome = chromeMock;
    checkSafariICloudAccount.mockResolvedValue(undefined);
    writeSafariICloudFile.mockResolvedValue(undefined);

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();
    await service.setProvider('icloud');

    await expect(
      service.uploadPromptsOnly([{ id: '1', text: 'Hi', tags: [], createdAt: 1 }]),
    ).resolves.toBe(true);
    expect(checkSafariICloudAccount).toHaveBeenCalled();
    expect(writeSafariICloudFile).toHaveBeenCalledWith(
      'gemini-voyager-prompts.json',
      expect.objectContaining({ format: 'gemini-voyager.prompts.v1' }),
    );
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ gvSyncProvider: 'icloud' }),
    );
  });

  it('does not retry an iCloud conflict and reports the merge-first recovery', async () => {
    (globalThis as { chrome: typeof chrome }).chrome = createChromeMock();
    checkSafariICloudAccount.mockResolvedValue(undefined);
    writeSafariICloudFile.mockRejectedValue(
      new Error('prompts changed on another device. Download and merge before uploading again.'),
    );
    isSafariICloudConflictError.mockReturnValue(true);

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();
    await service.setProvider('icloud');

    await expect(
      service.uploadPromptsOnly([{ id: '1', text: 'Hi', tags: [], createdAt: 1 }]),
    ).resolves.toBe(false);
    expect(writeSafariICloudFile).toHaveBeenCalledOnce();
    await expect(service.getState()).resolves.toMatchObject({
      error: expect.stringContaining('Download and merge'),
    });
  });

  it('honors the native iCloud retry delay before trying the upload again', async () => {
    vi.useFakeTimers();
    (globalThis as { chrome: typeof chrome }).chrome = createChromeMock();
    checkSafariICloudAccount.mockResolvedValue(undefined);
    writeSafariICloudFile
      .mockRejectedValueOnce(new Error('Try again'))
      .mockResolvedValue(undefined);
    getSafariICloudRetryDelay.mockReturnValue(2_500);

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();
    await service.setProvider('icloud');

    const upload = service.uploadPromptsOnly([{ id: '1', text: 'Hi', tags: [], createdAt: 1 }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(writeSafariICloudFile).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2_499);
    expect(writeSafariICloudFile).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(upload).resolves.toBe(true);
    expect(writeSafariICloudFile).toHaveBeenCalledTimes(2);
  });

  it('reads missing CloudKit files as an empty cloud copy', async () => {
    (globalThis as { chrome: typeof chrome }).chrome = createChromeMock();
    checkSafariICloudAccount.mockResolvedValue(undefined);
    readSafariICloudFile.mockResolvedValue(null);

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();
    await service.setProvider('icloud');

    await expect(service.downloadPromptsOnly()).resolves.toBeNull();
    expect(readSafariICloudFile).toHaveBeenCalledWith('gemini-voyager-prompts.json');
  });
});
