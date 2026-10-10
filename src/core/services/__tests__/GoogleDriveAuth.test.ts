import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncProvider } from '@/core/types/sync';

import { GoogleDriveAuth } from '../GoogleDriveAuth';

const runtime = vi.hoisted(() => ({ brave: false, safari: false, buildTarget: 'chrome' }));
const webAuth = vi.hoisted(() => vi.fn());
const checkICloud = vi.hoisted(() => vi.fn());

vi.mock('@/core/utils/browser', () => ({
  getVoyagerBuildTarget: () => runtime.buildTarget,
  isBrave: () => runtime.brave,
  isSafari: () => runtime.safari,
}));
vi.mock('@/core/services/googleOAuthWebFlow', () => ({ runGoogleWebAuthFlow: webAuth }));
vi.mock('@/core/utils/safariICloudSync', () => ({ checkSafariICloudAccount: checkICloud }));

function chromeApi() {
  const stored: Record<string, unknown> = {};
  const local = {
    get: vi.fn(async () => ({ ...stored })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(stored, items);
    }),
    remove: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => delete stored[key]);
    }),
  };
  const identity = {
    getAuthToken: vi.fn((_details: { interactive: boolean }, callback: (token: unknown) => void) =>
      callback({ token: 'identity-token' }),
    ),
    getRedirectURL: vi.fn(() => 'https://iifacdnjakkhjjiengaffnegbndgingi.chromiumapp.org/'),
    launchWebAuthFlow: vi.fn(),
    removeCachedAuthToken: vi.fn((_details: { token: string }, callback: () => void) => callback()),
  };
  const api = {
    storage: { local },
    identity,
    runtime: {
      lastError: null,
      getManifest: () => ({ oauth2: { client_id: 'client', scopes: ['drive.file'] } }),
    },
  };
  vi.stubGlobal('chrome', api);
  return { stored, local, identity };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  vi.clearAllMocks();
  runtime.brave = false;
  runtime.safari = false;
  runtime.buildTarget = 'chrome';
  webAuth.mockResolvedValue({ accessToken: 'web-token', expiresIn: 3600 });
  checkICloud.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GoogleDriveAuth', () => {
  it('accepts an object identity token and reuses the worker cache only until its padded expiry', async () => {
    const { stored, identity } = chromeApi();
    const firstWorker = new GoogleDriveAuth(() => 'googleDrive');
    await expect(firstWorker.getToken(false)).resolves.toBe('identity-token');
    const expiry = Date.now() + 54 * 60 * 1000;
    expect(stored).toEqual({ gvAccessToken: 'identity-token', gvTokenExpiry: expiry });

    const nextWorker = new GoogleDriveAuth(() => 'googleDrive');
    vi.setSystemTime(expiry - 1);
    await expect(nextWorker.getToken(false)).resolves.toBe('identity-token');
    expect(identity.getAuthToken).toHaveBeenCalledOnce();

    identity.getAuthToken.mockImplementation((_details, callback) => callback('refreshed-token'));
    vi.setSystemTime(expiry);
    await expect(nextWorker.getToken(false)).resolves.toBe('refreshed-token');
    expect(identity.getAuthToken).toHaveBeenCalledTimes(2);
    expect(stored.gvAccessToken).toBe('refreshed-token');
  });

  it('skips identity on Brave and never opens the web flow for a non-interactive request', async () => {
    const { identity } = chromeApi();
    runtime.brave = true;
    const auth = new GoogleDriveAuth(() => 'googleDrive');
    await expect(auth.getToken(false)).resolves.toBeNull();
    expect(webAuth).not.toHaveBeenCalled();

    await expect(auth.getToken(true)).resolves.toBe('web-token');
    expect(identity.getAuthToken).not.toHaveBeenCalled();
    expect(webAuth).toHaveBeenCalledOnce();
  });

  it('checks the live provider before using an already cached Google token', async () => {
    const { identity } = chromeApi();
    let provider: SyncProvider = 'googleDrive';
    const auth = new GoogleDriveAuth(() => provider);
    await expect(auth.getToken(false)).resolves.toBe('identity-token');

    provider = 'icloud';
    await expect(auth.getToken(false)).resolves.toBe('icloud');
    expect(checkICloud).toHaveBeenCalledOnce();

    provider = 'googleDrive';
    await expect(auth.getToken(false)).resolves.toBe('identity-token');
    expect(identity.getAuthToken).toHaveBeenCalledOnce();
  });

  it('leaves token clearing to the facade after revocation, then forgets both cache layers', async () => {
    const { stored, local, identity } = chromeApi();
    const revoke = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', revoke);
    const auth = new GoogleDriveAuth(() => 'googleDrive');
    await auth.getToken(false);

    await auth.signOutGoogle();
    expect(revoke).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/revoke?token=identity-token',
    );
    expect(local.remove).not.toHaveBeenCalled();
    await expect(auth.getToken(false)).resolves.toBe('identity-token');
    expect(identity.getAuthToken).toHaveBeenCalledOnce();

    await auth.clear();
    expect(stored).toEqual({});
    identity.getAuthToken.mockImplementation((_details, callback) => callback('new-token'));
    await expect(auth.getToken(false)).resolves.toBe('new-token');
    expect(identity.getAuthToken).toHaveBeenCalledTimes(2);
  });
});
