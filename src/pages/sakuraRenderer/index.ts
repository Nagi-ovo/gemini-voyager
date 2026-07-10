import SakuraWorker from '../content/visualEffects/sakura.worker?worker';
import {
  SAKURA_RENDERER_CONNECT_MESSAGE,
  type SakuraRendererCommand,
  type SakuraWorkerCommand,
  type SakuraWorkerEvent,
} from '../content/visualEffects/sakuraWorkerProtocol';

const canvas = document.getElementById('gv-sakura-effect-canvas') as HTMLCanvasElement | null;
const channelId = decodeURIComponent(window.location.hash.slice(1));
const ALLOWED_PARENT_ORIGINS = new Set([
  'https://gemini.google.com',
  'https://business.gemini.google',
  'https://aistudio.google.com',
  'https://aistudio.google.cn',
]);

let rendererPort: MessagePort | null = null;
let renderWorker: Worker | null = null;
let currentSessionId = 0;
let canvasTransferred = false;

function postEvent(event: SakuraWorkerEvent): void {
  rendererPort?.postMessage(event);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function terminateWorker(): void {
  if (!renderWorker) return;
  renderWorker.onmessage = null;
  renderWorker.onerror = null;
  renderWorker.onmessageerror = null;
  renderWorker.terminate();
  renderWorker = null;
}

function fail(error: unknown): void {
  terminateWorker();
  postEvent({
    type: 'fatal',
    sessionId: currentSessionId,
    reason: errorMessage(error),
  });
}

function initializeRenderer(command: Extract<SakuraRendererCommand, { type: 'init' }>): void {
  if (!canvas) {
    currentSessionId = command.sessionId;
    fail(new Error('Sakura renderer canvas is missing'));
    return;
  }

  if (renderWorker || canvasTransferred) {
    currentSessionId = command.sessionId;
    fail(new Error('Sakura renderer was initialized more than once'));
    return;
  }

  currentSessionId = command.sessionId;

  try {
    const worker = new SakuraWorker({ name: 'gv-sakura-renderer' });
    const offscreenCanvas = canvas.transferControlToOffscreen();
    canvasTransferred = true;
    renderWorker = worker;

    worker.onmessage = (event: MessageEvent<SakuraWorkerEvent>): void => {
      postEvent(event.data);
    };
    worker.onerror = (event): void => {
      event.preventDefault();
      fail(event.error ?? new Error(event.message));
    };
    worker.onmessageerror = (): void => {
      fail(new Error('Unable to decode a Sakura worker message'));
    };

    const workerCommand: SakuraWorkerCommand = {
      ...command,
      canvas: offscreenCanvas,
    };
    worker.postMessage(workerCommand, [offscreenCanvas]);
  } catch (error) {
    fail(error);
  }
}

function handleCommand(command: SakuraRendererCommand): void {
  if (command.type === 'init') {
    initializeRenderer(command);
    return;
  }

  if (command.sessionId !== currentSessionId || !renderWorker) return;

  if (command.type === 'dispose') {
    try {
      renderWorker.postMessage(command);
    } finally {
      terminateWorker();
      rendererPort?.close();
      rendererPort = null;
    }
    return;
  }

  try {
    renderWorker.postMessage(command);
  } catch (error) {
    fail(error);
  }
}

function connect(port: MessagePort): void {
  if (rendererPort) {
    port.close();
    return;
  }

  rendererPort = port;
  port.onmessage = (event: MessageEvent<SakuraRendererCommand>): void => {
    try {
      handleCommand(event.data);
    } catch (error) {
      fail(error);
    }
  };
  port.onmessageerror = (): void => {
    fail(new Error('Unable to decode a Sakura renderer command'));
  };
  port.start();
}

window.addEventListener('message', (event) => {
  const data = event.data as { type?: unknown; channelId?: unknown } | null;
  if (
    rendererPort ||
    !data ||
    data.type !== SAKURA_RENDERER_CONNECT_MESSAGE ||
    data.channelId !== channelId ||
    !ALLOWED_PARENT_ORIGINS.has(event.origin) ||
    event.ports.length !== 1
  ) {
    return;
  }

  connect(event.ports[0]);
});

window.addEventListener('beforeunload', () => {
  terminateWorker();
  rendererPort?.close();
  rendererPort = null;
});
