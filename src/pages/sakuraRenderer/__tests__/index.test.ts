import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SAKURA_RENDERER_CONNECT_MESSAGE } from '../../content/visualEffects/sakuraWorkerProtocol';

const workers: FakeWorker[] = [];

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    workers.push(this);
  }
}

vi.mock('../../content/visualEffects/sakura.worker?worker', () => ({ default: FakeWorker }));

class FakePort {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  start = vi.fn();
  close = vi.fn();
}

const CHANNEL_ID = 'test-channel';

function connectMessage(options: {
  source: unknown;
  origin: string;
  channelId?: string;
  port: FakePort;
}): Event {
  const event = new Event('message');
  Object.defineProperties(event, {
    data: {
      value: { type: SAKURA_RENDERER_CONNECT_MESSAGE, channelId: options.channelId ?? CHANNEL_ID },
    },
    source: { value: options.source },
    origin: { value: options.origin },
    ports: { value: [options.port] },
  });
  return event;
}

function sendInit(port: FakePort): void {
  port.onmessage?.({
    data: {
      type: 'init',
      sessionId: 1,
      width: 800,
      height: 600,
      dpr: 1,
      running: true,
      scheme: 'light',
      mode: 'active',
      drainId: 1,
    },
  });
}

describe('Sakura renderer frame handshake', () => {
  /** Each import registers fresh window listeners; remove them so cases stay independent. */
  let added: Array<[string, EventListenerOrEventListenerObject]> = [];

  beforeEach(async () => {
    vi.resetModules();
    workers.length = 0;
    window.history.replaceState(null, '', `#${CHANNEL_ID}`);
    document.body.innerHTML = '<canvas id="gv-sakura-effect-canvas"></canvas>';
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {
      configurable: true,
      value: () => ({}),
    });
    const addListener = vi.spyOn(window, 'addEventListener');
    await import('../index');
    added = addListener.mock.calls.map(([type, listener]) => [type, listener!]);
    addListener.mockRestore();
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
    for (const [type, listener] of added) window.removeEventListener(type, listener);
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '#');
  });

  it.each(['https://chatgpt.com', 'https://claude.ai', 'https://chat.deepseek.com'])(
    'connects a parent page on %s and starts the worker',
    (origin) => {
      const port = new FakePort();
      window.dispatchEvent(connectMessage({ source: window.parent, origin, port }));
      expect(port.start).toHaveBeenCalledOnce();

      sendInit(port);
      expect(workers).toHaveLength(1);
      expect(workers[0].postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'init', sessionId: 1 }),
        expect.any(Array),
      );
    },
  );

  it('ignores a connect message from a window other than its parent', () => {
    const other = document.createElement('iframe');
    document.body.appendChild(other);
    const port = new FakePort();
    window.dispatchEvent(
      connectMessage({ source: other.contentWindow, origin: 'https://gemini.google.com', port }),
    );
    expect(port.start).not.toHaveBeenCalled();
    expect(port.onmessage).toBeNull();

    // The rejected message did not use up the one connection.
    const parentPort = new FakePort();
    window.dispatchEvent(
      connectMessage({
        source: window.parent,
        origin: 'https://gemini.google.com',
        port: parentPort,
      }),
    );
    expect(parentPort.start).toHaveBeenCalledOnce();
  });

  it('ignores a connect message with the wrong channel id', () => {
    const port = new FakePort();
    window.dispatchEvent(
      connectMessage({
        source: window.parent,
        origin: 'https://gemini.google.com',
        channelId: 'guessed',
        port,
      }),
    );
    expect(port.start).not.toHaveBeenCalled();
    expect(port.onmessage).toBeNull();
  });
});
