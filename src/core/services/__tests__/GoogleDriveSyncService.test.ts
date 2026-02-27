import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockedChrome = typeof chrome;

function createChromeMock(): MockedChrome {
  const localStorageArea = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  const syncStorageArea = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };

  const runtime = {
    lastError: null as chrome.runtime.LastError | null,
    id: 'test-extension-id',
    getManifest: vi.fn(() => ({
      oauth2: {
        client_id: 'test-client-id',
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      },
    })),
  };

  const identity = {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn((_details: { token: string }, callback?: () => void) => {
      callback?.();
    }),
    launchWebAuthFlow: vi.fn(),
    getRedirectURL: vi.fn(() => 'https://test-extension.chromiumapp.org/'),
  };

  return {
    storage: {
      local: localStorageArea,
      sync: syncStorageArea,
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    runtime,
    identity,
  } as unknown as MockedChrome;
}

async function loadServiceClass() {
  vi.resetModules();
  const mod = await import('../GoogleDriveSyncService');
  return mod.GoogleDriveSyncService;
}

describe('GoogleDriveSyncService authentication', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses identity.getAuthToken non-interactive first, then interactive fallback', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    const getAuthTokenMock = chromeMock.identity.getAuthToken as unknown as ReturnType<
      typeof vi.fn
    >;
    getAuthTokenMock.mockImplementation(
      (details: { interactive?: boolean }, callback: (token?: string) => void) => {
        callback(details.interactive ? 'interactive-token' : undefined);
      },
    );

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();
    getAuthTokenMock.mockClear();

    const ok = await service.authenticate(true);

    expect(ok).toBe(true);
    expect(getAuthTokenMock).toHaveBeenCalledTimes(2);
    expect(getAuthTokenMock).toHaveBeenNthCalledWith(
      1,
      { interactive: false },
      expect.any(Function),
    );
    expect(getAuthTokenMock).toHaveBeenNthCalledWith(
      2,
      { interactive: true },
      expect.any(Function),
    );

    const state = await service.getState();
    expect(state.isAuthenticated).toBe(true);
  });

  it('removes cached identity token during sign out', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    const getAuthTokenMock = chromeMock.identity.getAuthToken as unknown as ReturnType<
      typeof vi.fn
    >;
    getAuthTokenMock.mockImplementation(
      (_details: { interactive?: boolean }, callback: (token?: string) => void) => {
        callback('cached-token');
      },
    );

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await service.authenticate(true);
    await service.signOut();

    const removeCachedAuthTokenMock = chromeMock.identity
      .removeCachedAuthToken as unknown as ReturnType<typeof vi.fn>;
    expect(removeCachedAuthTokenMock).toHaveBeenCalledWith(
      { token: 'cached-token' },
      expect.any(Function),
    );

    const removeLocalTokenMock = chromeMock.storage.local.remove as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(removeLocalTokenMock).toHaveBeenCalledWith(['gvAccessToken', 'gvTokenExpiry']);

    const state = await service.getState();
    expect(state.isAuthenticated).toBe(false);
  });

  it('falls back to launchWebAuthFlow when identity.getAuthToken is unavailable', async () => {
    const chromeMock = createChromeMock();
    const launchWebAuthFlowMock = chromeMock.identity.launchWebAuthFlow as unknown as ReturnType<
      typeof vi.fn
    >;
    launchWebAuthFlowMock.mockImplementation(
      (_details: { url: string; interactive: boolean }, callback: (response?: string) => void) => {
        callback(
          'https://test-extension.chromiumapp.org/#access_token=legacy-token&expires_in=3600',
        );
      },
    );

    const identityWithoutGetAuthToken = {
      ...chromeMock.identity,
      getAuthToken: undefined,
    };

    (globalThis as { chrome: MockedChrome }).chrome = {
      ...chromeMock,
      identity: identityWithoutGetAuthToken,
    } as unknown as MockedChrome;

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    const ok = await service.authenticate(true);

    expect(ok).toBe(true);
    expect(launchWebAuthFlowMock).toHaveBeenCalledTimes(1);

    const saveLocalTokenMock = chromeMock.storage.local.set as unknown as ReturnType<typeof vi.fn>;
    expect(saveLocalTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ gvAccessToken: 'legacy-token' }),
    );
  });

  it('falls back to launchWebAuthFlow when identity.getAuthToken fails interactively', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    const getAuthTokenMock = chromeMock.identity.getAuthToken as unknown as ReturnType<
      typeof vi.fn
    >;
    getAuthTokenMock.mockImplementation(
      (details: { interactive?: boolean }, callback: (token?: string) => void) => {
        if (details.interactive) {
          (chromeMock.runtime as { lastError: chrome.runtime.LastError | null }).lastError = {
            message: 'OAuth2 service failure',
          } as chrome.runtime.LastError;
          callback(undefined);
          (chromeMock.runtime as { lastError: chrome.runtime.LastError | null }).lastError = null;
          return;
        }
        callback(undefined);
      },
    );

    const launchWebAuthFlowMock = chromeMock.identity.launchWebAuthFlow as unknown as ReturnType<
      typeof vi.fn
    >;
    launchWebAuthFlowMock.mockImplementation(
      (_details: { url: string; interactive: boolean }, callback: (response?: string) => void) => {
        callback(
          'https://test-extension.chromiumapp.org/#access_token=legacy-fallback-token&expires_in=3600',
        );
      },
    );

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    const ok = await service.authenticate(true);

    expect(ok).toBe(true);
    expect(launchWebAuthFlowMock).toHaveBeenCalledTimes(1);
  });
});
