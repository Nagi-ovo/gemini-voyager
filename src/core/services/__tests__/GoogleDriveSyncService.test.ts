import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HighlightExportPayload, SyncAccountScope } from '@/core/types/sync';
import { hashString } from '@/core/utils/hash';

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

function createHighlightPayload(
  accountScope: SyncAccountScope,
  exact: string = 'A highlighted answer',
): HighlightExportPayload {
  const accountHash = hashString(accountScope.accountKey);
  return {
    format: 'gemini-voyager.annotations.v1',
    exportedAt: '2026-07-12T20:00:00.000Z',
    version: '1.2.3',
    accountScope: { platform: 'gemini', accountHash },
    items: [
      {
        id: 'highlight-1',
        schemaVersion: 1,
        platform: 'gemini',
        accountHash,
        conversationId: 'conversation-1',
        conversationUrl: 'https://gemini.google.com/u/2/app/conversation-1',
        conversationTitle: 'Conversation title',
        turnId: 'turn-1',
        role: 'assistant',
        anchor: {
          quote: { exact, prefix: 'before ', suffix: ' after' },
          position: { start: 7, end: 7 + exact.length },
          sourceTextHash: 'source-text-hash',
        },
        note: 'Keep this exact quote intact.',
        color: 'yellow',
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_001_000,
        revision: { counter: 1, deviceId: 'device-1' },
      },
    ],
  };
}

function responseJson(data: unknown, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
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

  it('persists identity tokens to local storage for worker restarts', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    // loadState() only calls getAuthToken when sync mode is not 'disabled'
    const localGetMock = chromeMock.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    localGetMock.mockResolvedValue({ gvSyncMode: 'auto' });

    const getAuthTokenMock = chromeMock.identity.getAuthToken as unknown as ReturnType<
      typeof vi.fn
    >;
    getAuthTokenMock.mockImplementation(
      (_details: { interactive?: boolean }, callback: (token?: string) => void) => {
        callback('identity-token');
      },
    );

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    const saveLocalTokenMock = chromeMock.storage.local.set as unknown as ReturnType<typeof vi.fn>;
    expect(saveLocalTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ gvAccessToken: 'identity-token' }),
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

  it('reuses cached token before falling back to interactive web auth again', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    const runtimeRef = chromeMock.runtime as { lastError: chrome.runtime.LastError | null };
    const getAuthTokenMock = chromeMock.identity.getAuthToken as unknown as ReturnType<
      typeof vi.fn
    >;
    getAuthTokenMock.mockImplementation(
      (details: { interactive?: boolean }, callback: (token?: string) => void) => {
        if (details.interactive) {
          runtimeRef.lastError = { message: 'OAuth2 service failure' } as chrome.runtime.LastError;
          callback(undefined);
          runtimeRef.lastError = null;
          return;
        }

        callback(undefined);
      },
    );

    const launchWebAuthFlowMock = chromeMock.identity.launchWebAuthFlow as unknown as ReturnType<
      typeof vi.fn
    >;
    launchWebAuthFlowMock.mockImplementationOnce(
      (_details: { url: string; interactive: boolean }, callback: (response?: string) => void) => {
        callback(
          'https://test-extension.chromiumapp.org/#access_token=legacy-token&expires_in=3600',
        );
      },
    );
    launchWebAuthFlowMock.mockImplementation(
      (_details: { url: string; interactive: boolean }, callback: (response?: string) => void) => {
        runtimeRef.lastError = {
          message: 'The user did not approve access',
        } as chrome.runtime.LastError;
        callback(undefined);
        runtimeRef.lastError = null;
      },
    );

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    const firstAuth = await service.authenticate(true);
    const secondAuth = await service.authenticate(true);

    expect(firstAuth).toBe(true);
    expect(secondAuth).toBe(true);
    expect(launchWebAuthFlowMock).toHaveBeenCalledTimes(1);
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

describe('GoogleDriveSyncService prompts-only sync', () => {
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

  it('uploadPromptsOnly returns false (does not throw) when not authenticated non-interactively', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;
    (chromeMock.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_details: { interactive?: boolean }, callback: (token?: string) => void) =>
        callback(undefined),
    );

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();

    await expect(service.uploadPromptsOnly([], null, false)).resolves.toBe(false);
    // Never reached the Drive API — no file writes attempted.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloadPromptsOnly returns null (does not throw) when not authenticated non-interactively', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;
    (chromeMock.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_details: { interactive?: boolean }, callback: (token?: string) => void) =>
        callback(undefined),
    );

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();

    await expect(service.downloadPromptsOnly(null, false)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GoogleDriveSyncService highlights-only sync', () => {
  const fetchMock = vi.fn();
  const accountScope: SyncAccountScope = {
    accountKey: 'email:account@example.com',
    accountId: 2,
    routeUserId: '2',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function authenticate(chromeMock: MockedChrome): void {
    (chromeMock.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_details: { interactive?: boolean }, callback: (token?: string) => void) => {
        callback('highlight-token');
      },
    );
  }

  it('round-trips the exact payload through an account-scoped independent file', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;
    authenticate(chromeMock);

    const exact = `${'0123456789'.repeat(1_000)}-exact-tail`;
    const payload = createHighlightPayload(accountScope, exact);
    let uploadedPayload: unknown = null;
    const searchedFileNames: string[] = [];

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin === 'https://www.googleapis.com' && url.pathname === '/drive/v3/files') {
        const query = url.searchParams.get('q') ?? '';
        if (query.includes("mimeType='application/vnd.google-apps.folder'")) {
          return responseJson({ files: [{ id: 'backup-folder' }] });
        }
        const name = /name='([^']+)'/.exec(query)?.[1];
        if (name) searchedFileNames.push(name);
        return responseJson({ files: [{ id: 'highlight-file' }] });
      }
      if (url.pathname === '/drive/v3/files/highlight-file') {
        if (url.searchParams.get('alt') === 'media') return responseJson(uploadedPayload);
        return responseJson({ parents: ['backup-folder'], trashed: false });
      }
      if (url.pathname === '/upload/drive/v3/files/highlight-file') {
        expect(init?.method).toBe('PATCH');
        uploadedPayload = JSON.parse(String(init?.body));
        return responseJson({ id: 'highlight-file' });
      }
      throw new Error(`Unexpected Drive request: ${url.toString()}`);
    });

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await expect(service.uploadHighlightsOnly(payload, accountScope, true)).resolves.toBe(true);
    await expect(service.downloadHighlightsOnly(accountScope, true)).resolves.toEqual(payload);

    const scopedFileName = `gemini-voyager-highlights.acct-${hashString(accountScope.accountKey)}.json`;
    expect(searchedFileNames).toEqual([scopedFileName, scopedFileName]);
    expect(searchedFileNames).not.toContain('gemini-voyager-highlights.json');
    expect(uploadedPayload).toEqual(payload);
    expect((uploadedPayload as HighlightExportPayload).items[0].anchor.quote.exact).toBe(exact);
  });

  it('does not fall back to an unscoped legacy file when the scoped file is absent', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;
    authenticate(chromeMock);

    const searchedFileNames: string[] = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('q') ?? '';
      const name = /name='([^']+)'/.exec(query)?.[1];
      if (name) searchedFileNames.push(name);
      return responseJson({ files: [] });
    });

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await expect(service.downloadHighlightsOnly(accountScope, true)).resolves.toBeNull();
    expect(searchedFileNames).toEqual([
      `gemini-voyager-highlights.acct-${hashString(accountScope.accountKey)}.json`,
    ]);
  });

  it('rejects a payload from another account before authenticating or writing', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;
    const payload = createHighlightPayload(accountScope);
    payload.accountScope.accountHash = 'wrong-account-hash';

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await expect(service.uploadHighlightsOnly(payload, accountScope, true)).resolves.toBe(false);
    expect(chromeMock.identity.getAuthToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(service.getState()).resolves.toMatchObject({
      isSyncing: false,
      error: 'Highlight sync payload does not match the requested account scope',
    });
  });

  it('rejects an invalid remote payload and exposes a failure state', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;
    authenticate(chromeMock);

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/drive/v3/files') {
        return responseJson({ files: [{ id: 'highlight-file' }] });
      }
      if (
        url.pathname === '/drive/v3/files/highlight-file' &&
        url.searchParams.get('alt') === 'media'
      ) {
        return responseJson({ format: 'gemini-voyager.annotations.v0', items: [] });
      }
      throw new Error(`Unexpected Drive request: ${url.toString()}`);
    });

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await expect(service.downloadHighlightsOnly(accountScope, true)).resolves.toBeNull();
    await expect(service.getState()).resolves.toMatchObject({
      isSyncing: false,
      error: 'Invalid highlight sync payload',
    });
  });

  it('records Drive API failures in sync state', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;
    authenticate(chromeMock);
    const payload = createHighlightPayload(accountScope);

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('q') ?? '';
      if (query.includes("mimeType='application/vnd.google-apps.folder'")) {
        return responseJson({ files: [{ id: 'backup-folder' }] });
      }
      return responseJson({ error: 'unavailable' }, 503);
    });

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await expect(service.uploadHighlightsOnly(payload, accountScope, true)).resolves.toBe(false);
    await expect(service.getState()).resolves.toMatchObject({
      isSyncing: false,
      error: 'Failed to search files: 503',
    });
  });

  it('returns null/false without Drive requests when non-interactive auth is unavailable', async () => {
    const chromeMock = createChromeMock();
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;
    (chromeMock.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_details: { interactive?: boolean }, callback: (token?: string) => void) =>
        callback(undefined),
    );
    const payload = createHighlightPayload(accountScope);

    const GoogleDriveSyncService = await loadServiceClass();
    const service = new GoogleDriveSyncService();
    await service.getState();

    await expect(service.uploadHighlightsOnly(payload, accountScope, false)).resolves.toBe(false);
    await expect(service.downloadHighlightsOnly(accountScope, false)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
