import { afterEach, describe, expect, it, vi } from 'vitest';

const requestSafariGoogleDriveToken = vi.hoisted(() => vi.fn());
const signOutSafariGoogleDrive = vi.hoisted(() => vi.fn());
const checkSafariICloudAccount = vi.hoisted(() => vi.fn());
const readSafariICloudFile = vi.hoisted(() => vi.fn());
const writeSafariICloudFile = vi.hoisted(() => vi.fn());

vi.mock('@/core/utils/browser', () => ({
  isBrave: () => false,
  isSafari: () => true,
}));

vi.mock('@/core/utils/safariGoogleDriveAuth', () => ({
  requestSafariGoogleDriveToken,
  signOutSafariGoogleDrive,
}));

vi.mock('@/core/utils/safariICloudSync', () => ({
  checkSafariICloudAccount,
  readSafariICloudFile,
  writeSafariICloudFile,
}));

function createChromeMock() {
  return {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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

  it('opens the containing app for first-time interactive sign-in', async () => {
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
