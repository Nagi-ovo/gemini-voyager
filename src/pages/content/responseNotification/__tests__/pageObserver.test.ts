import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scriptPath = resolve(process.cwd(), 'public/response-complete-observer.js');
const observerScript = readFileSync(scriptPath, 'utf-8');
const SOURCE = 'gemini-voyager-response-complete-observer';
const NativeXMLHttpRequest = window.XMLHttpRequest;

function installObserver(): void {
  // oxlint-disable-next-line no-eval -- evaluating the observer under test is what this suite exercises
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

class MockXMLHttpRequest {
  public status = 200;
  public readonly removeEventListener = vi.fn();
  public readonly addEventListener = vi.fn(
    (_type: string, _listener: EventListenerOrEventListenerObject) => {},
  );
  public readonly open = vi.fn();
  public readonly send = vi.fn();
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
    Object.defineProperty(window, 'XMLHttpRequest', {
      value: NativeXMLHttpRequest,
      writable: true,
      configurable: true,
    });
    postMessageSpy = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {}) as unknown as ReturnType<typeof vi.fn>;
  });

  it.each(['rejection', 'abort', 'http-error', 'read-error', 'read-abort'])(
    'releases a fetch %s without allowing a completion notification',
    async (failure) => {
      const error = new DOMException(
        'test failure',
        failure.includes('abort') ? 'AbortError' : 'NetworkError',
      );
      if (failure === 'rejection' || failure === 'abort') originalFetch.mockRejectedValue(error);
      else if (failure === 'http-error')
        originalFetch.mockResolvedValue(new Response('failed', { status: 500 }));
      else {
        const response = createResponseWithCloneSpy();
        response.cloneSpy.mockReturnValue({
          text: () => Promise.reject(error),
        } as unknown as Response);
        originalFetch.mockResolvedValue(response);
      }
      installObserver();
      await window
        .fetch('https://gemini.google.com/_/BardChatUi/data/StreamGenerate')
        .catch(() => {});
      await vi.waitFor(() =>
        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'request-complete',
            payload: expect.objectContaining({
              requestId: 1,
              outcome: failure.includes('abort') ? 'cancelled' : 'failed',
              shouldNotify: false,
            }),
          }),
          expect.any(String),
        ),
      );
    },
  );

  it.each(['load', 'non-text-load', 'error', 'abort', 'timeout', 'http-error'])(
    'classifies XHR %s before releasing its pending request',
    (terminal) => {
      Object.defineProperty(window, 'XMLHttpRequest', {
        value: MockXMLHttpRequest,
        writable: true,
        configurable: true,
      });
      installObserver();
      const xhr = new window.XMLHttpRequest() as unknown as MockXMLHttpRequest;
      const loaded = terminal === 'load' || terminal === 'non-text-load';
      xhr.status = terminal === 'http-error' ? 500 : loaded ? 200 : 0;
      // A json/arraybuffer responseType throws on responseText; that must not turn success into failure.
      if (terminal === 'non-text-load')
        Object.defineProperty(xhr, 'responseText', {
          get: () => {
            throw new DOMException('Not a text response', 'InvalidStateError');
          },
        });
      xhr.open('POST', 'https://gemini.google.com/_/BardChatUi/data/StreamGenerate');
      xhr.send();
      for (const eventType of [
        terminal === 'http-error' || loaded ? 'load' : terminal,
        'loadend',
      ]) {
        const listener = xhr.addEventListener.mock.calls.find(([type]) => type === eventType)?.[1];
        if (typeof listener === 'function')
          listener.call(xhr as unknown as XMLHttpRequest, new Event(eventType));
      }
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'request-complete',
          payload: expect.objectContaining({
            requestId: 1,
            outcome: loaded ? 'success' : terminal === 'abort' ? 'cancelled' : 'failed',
            shouldNotify: loaded,
          }),
        }),
        expect.any(String),
      );
    },
  );

  it('tracks a successful generation shorter than 800ms and lets it notify', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(1010);
    const response = createResponseWithCloneSpy();
    originalFetch.mockResolvedValue(response);
    installObserver();
    await window.fetch('https://gemini.google.com/_/BardChatUi/data/StreamGenerate', {
      method: 'POST',
    });
    await vi.waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'request-complete',
          payload: expect.objectContaining({ outcome: 'success', shouldNotify: true }),
        }),
        expect.any(String),
      ),
    );
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: SOURCE, type: 'request-start' }),
      expect.any(String),
    );
    expect(response.cloneSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['fetch', 'xhr'])(
    'does not announce a stopped %s response when the server closes with HTTP 200',
    async (transport) => {
      let resolveResponse!: (response: Response) => void;
      originalFetch.mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
      );
      Object.defineProperty(window, 'XMLHttpRequest', {
        value: MockXMLHttpRequest,
        writable: true,
        configurable: true,
      });
      installObserver();
      let request: Promise<Response> | undefined;
      let xhr: MockXMLHttpRequest | undefined;
      if (transport === 'fetch')
        request = window.fetch('https://gemini.google.com/_/BardChatUi/data/StreamGenerate');
      else {
        xhr = new window.XMLHttpRequest() as unknown as MockXMLHttpRequest;
        xhr.open('POST', 'https://gemini.google.com/_/BardChatUi/data/StreamGenerate');
        xhr.send();
      }
      const stop = document.createElement('button');
      stop.setAttribute('aria-label', 'Stop response');
      stop.innerHTML = '<span>Stop</span>';
      document.body.appendChild(stop);
      stop.querySelector('span')!.click();
      stop.remove();
      if (transport === 'fetch') {
        resolveResponse(new Response('Partial response'));
        await request;
      } else {
        const listener = xhr!.addEventListener.mock.calls.find(([type]) => type === 'loadend')?.[1];
        if (typeof listener === 'function')
          listener.call(xhr as unknown as XMLHttpRequest, new Event('loadend'));
      }
      await vi.waitFor(() =>
        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'request-complete',
            payload: expect.objectContaining({
              requestId: 1,
              outcome: 'cancelled',
              shouldNotify: false,
            }),
          }),
          expect.any(String),
        ),
      );
      originalFetch.mockResolvedValue(new Response('Next completed response'));
      await window.fetch('https://gemini.google.com/_/BardChatUi/data/StreamGenerate');
      await vi.waitFor(() =>
        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'request-complete',
            payload: expect.objectContaining({
              requestId: 2,
              outcome: 'success',
              shouldNotify: true,
            }),
          }),
          expect.any(String),
        ),
      );
    },
  );

  it.each([
    ['generic copied text', JSON.stringify([])],
    [
      'copied text that mentions generation APIs',
      JSON.stringify([
        'This answer mentions generateContent, BardFrontendService, and assistant.lamda.',
      ]),
    ],
  ])('ignores native Copy Response batchexecute with %s', async (_name, copiedPayload) => {
    const response = createResponseWithCloneSpy();
    originalFetch.mockResolvedValue(response);
    installObserver();

    const copyArgs = JSON.stringify([[['copyRpc', copiedPayload, null, 'generic']]]);
    await window.fetch('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=copyRpc', {
      method: 'POST',
      body: `f.req=${encodeURIComponent(copyArgs)}`,
    });

    expect(response.cloneSpy).not.toHaveBeenCalled();
    expect(postMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ source: SOURCE, type: 'request-start' }),
      expect.any(String),
    );
  });

  it('ignores Copy Response XHR batchexecute requests with generation-looking body text', () => {
    Object.defineProperty(window, 'XMLHttpRequest', {
      value: MockXMLHttpRequest,
      writable: true,
      configurable: true,
    });
    installObserver();

    const xhr = new window.XMLHttpRequest() as unknown as MockXMLHttpRequest;
    xhr.open('POST', 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=copyRpc');
    xhr.send('f.req=' + encodeURIComponent('generateContent BardFrontendService assistant.lamda'));

    expect(xhr.addEventListener).not.toHaveBeenCalledWith(
      'loadend',
      expect.any(Function),
      expect.anything(),
    );
    expect(postMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ source: SOURCE, type: 'request-start' }),
      expect.any(String),
    );
  });

  it.each(['fetch', 'xhr'])(
    'correlates full prompts and response conversation ids through %s',
    async (transport) => {
      const prompt = 'x'.repeat(139) + ' full ending';
      const body = new URLSearchParams({
        'f.req': JSON.stringify([null, JSON.stringify([[prompt], null, ['', '', '']])]),
      });
      const responseText = `)]}'\n123\n${JSON.stringify([
        ['wrb.fr', null, JSON.stringify([null, ['c_0123456789abcdef', 'r_1111111111111111']])],
      ])}\n`;
      originalFetch.mockResolvedValue(new Response(responseText));
      Object.defineProperty(window, 'XMLHttpRequest', {
        value: MockXMLHttpRequest,
        writable: true,
        configurable: true,
      });
      installObserver();
      if (transport === 'fetch') {
        await window.fetch('https://gemini.google.com/_/BardChatUi/data/StreamGenerate', { body });
      } else {
        const xhr = new window.XMLHttpRequest() as unknown as MockXMLHttpRequest;
        xhr.open('POST', 'https://gemini.google.com/_/BardChatUi/data/StreamGenerate');
        Object.defineProperty(xhr, 'responseText', { value: responseText });
        xhr.send(body.toString());
        const listener = xhr.addEventListener.mock.calls.find(([type]) => type === 'loadend')?.[1];
        if (typeof listener !== 'function') throw new Error('missing loadend');
        listener.call(xhr as unknown as XMLHttpRequest, new Event('loadend'));
      }
      await vi.waitFor(() =>
        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'request-complete',
            payload: expect.objectContaining({ requestId: 1, conversationId: '0123456789abcdef' }),
          }),
          expect.any(String),
        ),
      );
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'request-start',
          payload: expect.objectContaining({ requestId: 1, prompt, pageUrl: location.href }),
        }),
        expect.any(String),
      );
    },
  );

  it.each(['answer text', 'conflicting ids', 'malformed frame'])(
    'does not infer response identity from %s',
    async (shape) => {
      const frame = (payload: unknown) =>
        JSON.stringify([['wrb.fr', null, JSON.stringify(payload)]]);
      const responseText =
        shape === 'answer text'
          ? frame([null, null, 'c_0123456789abcdef'])
          : shape === 'conflicting ids'
            ? frame([null, ['c_0123456789abcdef']]) + '\n' + frame([null, ['c_1111111111111111']])
            : '[["wrb.fr",null,"broken"';
      originalFetch.mockResolvedValue(new Response(responseText));
      installObserver();
      await window.fetch('https://gemini.google.com/_/BardChatUi/data/StreamGenerate');
      await vi.waitFor(() =>
        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'request-complete',
            payload: expect.objectContaining({ conversationId: null }),
          }),
          expect.any(String),
        ),
      );
    },
  );
});
