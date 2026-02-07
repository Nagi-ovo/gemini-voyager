import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scriptPath = resolve(process.cwd(), 'public/fetchInterceptor.js');
const interceptorScript = readFileSync(scriptPath, 'utf-8');

function installInterceptor(): void {
  (0, eval)(interceptorScript);
}

describe('fetchInterceptor (MAIN world script)', () => {
  let originalFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    delete (window as Window & { __gvFetchInterceptorInstalled?: boolean })
      .__gvFetchInterceptorInstalled;

    document.documentElement.innerHTML = '';

    originalFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    Object.defineProperty(window, 'fetch', {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
  });

  it('short-circuits known CSP-blocked GTM telemetry requests', async () => {
    installInterceptor();

    const response = await window.fetch('https://www.googletagmanager.com/td?id=G-TEST');

    expect(response.status).toBe(204);
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it('passes through non-target requests to original fetch', async () => {
    const originalFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    Object.defineProperty(window, 'fetch', {
      value: originalFetch,
      writable: true,
      configurable: true,
    });

    installInterceptor();

    const response = await window.fetch('https://example.com/api');

    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });
});
