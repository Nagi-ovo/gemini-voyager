/// <reference lib="webworker" />
import { SAKURA_BASE_FRAME_MS, SAKURA_SPRITE_SIZE, SakuraScene } from './sakuraScene';
import type { SakuraWorkerCommand, SakuraWorkerEvent } from './sakuraWorkerProtocol';

type WorkerScope = {
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (handle: number) => void;
  postMessage: (message: SakuraWorkerEvent) => void;
  close?: () => void;
  onmessage: ((event: MessageEvent<SakuraWorkerCommand>) => void) | null;
};

type ScheduledFrame = {
  kind: 'animation-frame' | 'timer';
  handle: number;
};

const workerScope = globalThis as unknown as WorkerScope;

let sessionId = 0;
let scene: SakuraScene | null = null;
let mode: 'idle' | 'active' | 'draining' | 'disposed' = 'idle';
let visible = true;
let currentDrainId = 0;
let lastDrawTime = 0;
let scheduledFrame: ScheduledFrame | null = null;

function postEvent(event: SakuraWorkerEvent): void {
  workerScope.postMessage(event);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cancelScheduledFrame(): void {
  if (!scheduledFrame) return;

  if (scheduledFrame.kind === 'animation-frame') {
    workerScope.cancelAnimationFrame?.(scheduledFrame.handle);
  } else {
    workerScope.clearTimeout(scheduledFrame.handle);
  }
  scheduledFrame = null;
}

function disposeRenderer(closeWorker: boolean): void {
  cancelScheduledFrame();
  scene?.dispose();
  scene = null;
  mode = 'disposed';
  lastDrawTime = 0;

  if (closeWorker) workerScope.close?.();
}

function fail(error: unknown): void {
  const failedSessionId = sessionId;
  disposeRenderer(false);
  postEvent({
    type: 'fatal',
    sessionId: failedSessionId,
    reason: errorMessage(error),
  });
}

function shouldAnimate(): boolean {
  return visible && scene !== null && (mode === 'active' || mode === 'draining');
}

function scheduleNextFrame(): void {
  if (scheduledFrame || !shouldAnimate()) return;

  if (typeof workerScope.requestAnimationFrame === 'function') {
    scheduledFrame = {
      kind: 'animation-frame',
      handle: workerScope.requestAnimationFrame(renderFrame),
    };
    return;
  }

  scheduledFrame = {
    kind: 'timer',
    handle: workerScope.setTimeout(() => renderFrame(performance.now()), SAKURA_BASE_FRAME_MS),
  };
}

function renderFrame(time: number): void {
  scheduledFrame = null;
  if (!shouldAnimate() || !scene) return;

  try {
    const elapsedMs = lastDrawTime > 0 ? time - lastDrawTime : SAKURA_BASE_FRAME_MS;
    lastDrawTime = time;
    const visibleCount = scene.renderFrame(time, elapsedMs, mode === 'draining');

    if (mode === 'draining' && visibleCount === 0) {
      mode = 'idle';
      postEvent({ type: 'drained', sessionId, drainId: currentDrainId });
      return;
    }

    scheduleNextFrame();
  } catch (error) {
    fail(error);
  }
}

function initialize(command: Extract<SakuraWorkerCommand, { type: 'init' }>): void {
  if (scene || mode === 'disposed') {
    postEvent({
      type: 'fatal',
      sessionId: command.sessionId,
      reason: 'Sakura worker was initialized more than once',
    });
    return;
  }

  sessionId = command.sessionId;

  try {
    const context = command.canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas 2D context is unavailable');

    scene = new SakuraScene({
      canvas: command.canvas,
      context,
      createSpriteCanvas: () => new OffscreenCanvas(SAKURA_SPRITE_SIZE, SAKURA_SPRITE_SIZE),
    });
    scene.initialize(command.width, command.height, command.dpr);
    visible = command.visible;
    mode = command.mode;
    currentDrainId = command.drainId;
    lastDrawTime = 0;

    postEvent({ type: 'ready', sessionId });
    scheduleNextFrame();
  } catch (error) {
    fail(error);
  }
}

function handleCommand(command: SakuraWorkerCommand): void {
  if (command.type === 'init') {
    initialize(command);
    return;
  }

  if (command.sessionId !== sessionId || mode === 'disposed' || !scene) return;

  switch (command.type) {
    case 'resize':
      scene.resize(command.width, command.height, command.dpr);
      break;

    case 'visibility':
      visible = command.visible;
      if (!visible) {
        cancelScheduledFrame();
      } else {
        lastDrawTime = 0;
        scheduleNextFrame();
      }
      break;

    case 'set-mode':
      currentDrainId = command.drainId;
      mode = command.mode;
      scheduleNextFrame();
      break;

    case 'dispose':
      disposeRenderer(true);
      break;
  }
}

workerScope.onmessage = (event): void => {
  try {
    handleCommand(event.data);
  } catch (error) {
    fail(error);
  }
};
