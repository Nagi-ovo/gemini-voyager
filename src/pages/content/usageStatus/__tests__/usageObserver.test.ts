import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const observerScript = readFileSync(resolve(process.cwd(), 'public/usage-observer.js'), 'utf-8');

type UsageWindow = Window &
  typeof globalThis & {
    __gvUsageObserverInstalled?: boolean;
    WIZ_global_data?: Record<string, string>;
  };

function installObserver(): void {
  (0, eval)(observerScript);
}

function dispatchReplay(sourcePath: string): void {
  const event = new MessageEvent('message', {
    data: {
      source: 'gv-usage-observer-cmd',
      type: 'replay',
      payload: {
        id: 1,
        rpcid: 'jSf9Qc',
        args: '[]',
        sourcePath,
      },
    },
  });
  Object.defineProperty(event, 'source', { value: window });
  window.dispatchEvent(event);
}

describe('usage-observer replay', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();

    const usageWindow = window as UsageWindow;
    delete usageWindow.__gvUsageObserverInstalled;
    usageWindow.WIZ_global_data = {
      SNlM0e: 'at-token',
      cfb2h: 'bl-token',
      FdrFJe: 'fsid-token',
    };

    fetchMock = vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue('[]'),
    });
    Object.defineProperty(window, 'fetch', {
      value: fetchMock,
      writable: true,
      configurable: true,
    });
  });

  it('replays multi-account usage requests on the same account route', async () => {
    installObserver();

    dispatchReplay('/u/2/app');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe('/u/2/_/BardChatUi/data/batchexecute');
    expect(requestUrl.searchParams.get('source-path')).toBe('/u/2/app');
  });
});
