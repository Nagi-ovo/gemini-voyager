import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scriptPath = resolve(process.cwd(), 'public/response-complete-observer.js');
const observerScript = readFileSync(scriptPath, 'utf-8');
const SOURCE = 'gemini-voyager-response-complete-observer';

function installObserver(): void {
  (0, eval)(observerScript);
}

function createResponseWithCloneSpy(): Response & { cloneSpy: ReturnType<typeof vi.fn> } {
  const cloneResponse = new Response('clone-ok');
  const response = new Response('ok') as Response & { cloneSpy: ReturnType<typeof vi.fn> };
  response.cloneSpy = vi.fn(() => cloneResponse);
  Object.defineProperty(response, 'clone', {
    value: response.cloneSpy,
    configurable: true,
  });
  return response;
}

describe('response-complete-observer page script', () => {
  let originalFetch: ReturnType<typeof vi.fn>;
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { __gvResponseCompleteObserverInstalled?: boolean })
      .__gvResponseCompleteObserverInstalled;

    originalFetch = vi.fn();
    Object.defineProperty(window, 'fetch', {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
    postMessageSpy = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {}) as unknown as ReturnType<typeof vi.fn>;
  });

  it('ignores non-generation batchexecute requests such as native Copy Response', async () => {
    const response = createResponseWithCloneSpy();
    originalFetch.mockResolvedValue(response);
    installObserver();

    await window.fetch('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=copyRpc', {
      method: 'POST',
      body: 'f.req=%5B%5B%5B%22copyRpc%22%2C%22%5B%5D%22%2Cnull%2C%22generic%22%5D%5D%5D',
    });

    expect(response.cloneSpy).not.toHaveBeenCalled();
    expect(postMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ source: SOURCE, type: 'request-start' }),
      expect.any(String),
    );
  });

  it('tracks explicit Gemini generation requests', async () => {
    const response = createResponseWithCloneSpy();
    originalFetch.mockResolvedValue(response);
    installObserver();

    await window.fetch('https://gemini.google.com/_/BardChatUi/data/StreamGenerate', {
      method: 'POST',
    });
    await vi.waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ source: SOURCE, type: 'request-complete' }),
        expect.any(String),
      );
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: SOURCE, type: 'request-start' }),
      expect.any(String),
    );
    expect(response.cloneSpy).toHaveBeenCalledTimes(1);
  });
});
