import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FormFactorModule = typeof import('../formFactor');

const DESKTOP_FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const ANDROID_FIREFOX_UA = 'Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0';

// Each test gets a fresh module: the readings are kept per page / per context.
async function load(): Promise<FormFactorModule> {
  vi.resetModules();
  return import('../formFactor');
}

function setUserAgent(ua: string): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

/** Pointer media queries as a phone (coarse only) or a laptop (fine) answers them. */
function setPointer(kind: 'touch-only' | 'mouse'): void {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches:
          kind === 'touch-only' ? query === '(pointer: coarse)' : query === '(any-pointer: fine)',
        media: query,
      }) as MediaQueryList,
  );
}

const runtime = chrome.runtime as unknown as {
  sendMessage: Mock;
  getPlatformInfo?: Mock;
};

beforeEach(() => {
  setUserAgent(DESKTOP_FIREFOX_UA);
  setPointer('mouse');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  runtime.sendMessage.mockReset();
  delete runtime.getPlatformInfo;
});

describe('readPlatformFormFactor', () => {
  it('calls Android a phone even when Desktop site gave the page a desktop user agent', async () => {
    runtime.getPlatformInfo = vi.fn().mockResolvedValue({ os: 'android' });
    const { readPlatformFormFactor } = await load();
    expect(await readPlatformFormFactor()).toBe('mobile');
  });

  it('calls every other system a desktop', async () => {
    for (const os of ['mac', 'win', 'linux', 'cros']) {
      runtime.getPlatformInfo = vi.fn().mockResolvedValue({ os });
      const { readPlatformFormFactor } = await load();
      expect(await readPlatformFormFactor()).toBe('desktop');
    }
  });

  it('lets the dev build act as a phone from local storage, and only the dev build', async () => {
    runtime.getPlatformInfo = vi.fn().mockResolvedValue({ os: 'mac' });
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ gvDevFormFactor: 'mobile' } as never);
    expect(await (await load()).readPlatformFormFactor()).toBe('desktop');
    vi.stubEnv('VOYAGER_DEV_SETTINGS_BRIDGE', true as never);
    expect(await (await load()).readPlatformFormFactor()).toBe('mobile');
  });
});

describe('requestPageFormFactor', () => {
  it("takes the background's answer and asks it once per page", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: true, formFactor: 'mobile' });
    const { requestPageFormFactor } = await load();
    expect(await requestPageFormFactor()).toBe('mobile');
    expect(await requestPageFormFactor()).toBe('mobile');
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('guesses a phone from a touch-only page when the background does not answer', async () => {
    runtime.sendMessage.mockRejectedValue(new Error('Could not establish connection'));
    setPointer('touch-only');
    expect(await (await load()).requestPageFormFactor()).toBe('mobile');
  });

  it('guesses a phone from an Android user agent when the background does not answer', async () => {
    runtime.sendMessage.mockResolvedValue(undefined);
    setUserAgent(ANDROID_FIREFOX_UA);
    expect(await (await load()).requestPageFormFactor()).toBe('mobile');
  });

  it('keeps a desktop a desktop when the background stays silent past the wait', async () => {
    vi.useFakeTimers();
    runtime.sendMessage.mockReturnValue(new Promise(() => {}));
    const { PAGE_FORM_FACTOR_TIMEOUT_MS, requestPageFormFactor } = await load();
    const reading = requestPageFormFactor();
    await vi.advanceTimersByTimeAsync(PAGE_FORM_FACTOR_TIMEOUT_MS);
    expect(await reading).toBe('desktop');
  });
});
