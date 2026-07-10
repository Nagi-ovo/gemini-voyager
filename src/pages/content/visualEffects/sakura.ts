/**
 * Sakura (Cherry Blossom) effect for Gemini.
 *
 * Firefox content scripts cannot reliably create moz-extension:// workers
 * directly (Mozilla bug 1334891). The Firefox path therefore renders inside a
 * transparent extension-origin iframe, which owns an OffscreenCanvas worker.
 * The full 88-petal scene and display cadence are preserved. Other browsers,
 * or any failed worker startup, use the same scene on the page main thread.
 */
import { isFirefox } from '@/core/utils/browser';

import { SAKURA_BASE_FRAME_MS, SAKURA_MAX_DPR, SakuraScene } from './sakuraScene';
import {
  SAKURA_RENDERER_CONNECT_MESSAGE,
  type SakuraRendererCommand,
  type SakuraWorkerEvent,
} from './sakuraWorkerProtocol';

const CANVAS_ID = 'gv-sakura-effect-canvas';
const RENDERER_FRAME_ID = 'gv-sakura-effect-frame';
const RENDERER_PAGE_PATH = 'src/pages/sakuraRenderer/index.html';
const STORAGE_KEY = 'gvVisualEffect';
const LEGACY_KEY = 'gvSnowEffect';
const EFFECT_VALUE = 'sakura';
const RENDERER_READY_TIMEOUT_MS = 3_000;

type EffectState = 'off' | 'active' | 'draining';
type RendererMode = 'none' | 'main-thread' | 'worker-frame';

let state: EffectState = 'off';
let rendererMode: RendererMode = 'none';
let canvas: HTMLCanvasElement | null = null;
let rendererFrame: HTMLIFrameElement | null = null;
let rendererPort: MessagePort | null = null;
let rendererFrameLoadHandler: (() => void) | null = null;
let rendererFrameErrorHandler: (() => void) | null = null;
let rendererReadyTimeoutId: number | null = null;
let workerUnavailableForPage = false;
let mainScene: SakuraScene | null = null;
let mainAnimationFrameId: number | null = null;
let mainLastDrawTime = 0;
let sessionCounter = 0;
let currentSessionId = 0;
let drainCounter = 0;
let currentDrainId = 0;
let viewportWidth = 1;
let viewportHeight = 1;
let renderDpr = 1;
let resizeHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;

function createEffectCanvas(): HTMLCanvasElement {
  const nextCanvas = document.createElement('canvas');
  nextCanvas.id = CANVAS_ID;
  nextCanvas.dataset.gvSakuraRenderer = 'main-thread';
  nextCanvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
  document.documentElement.appendChild(nextCanvas);
  return nextCanvas;
}

function createChannelId(): string {
  try {
    const values = crypto.getRandomValues(new Uint32Array(4));
    return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function updateViewportMetrics(): void {
  const nextWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const nextHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const nextDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, SAKURA_MAX_DPR));

  if (nextWidth === viewportWidth && nextHeight === viewportHeight && nextDpr === renderDpr) {
    return;
  }

  viewportWidth = nextWidth;
  viewportHeight = nextHeight;
  renderDpr = nextDpr;

  if (rendererMode === 'main-thread') {
    mainScene?.resize(viewportWidth, viewportHeight, renderDpr);
  } else if (rendererMode === 'worker-frame' && rendererPort) {
    postRendererCommand({
      type: 'resize',
      sessionId: currentSessionId,
      width: viewportWidth,
      height: viewportHeight,
      dpr: renderDpr,
    });
  }
}

function clearRendererReadyTimeout(): void {
  if (rendererReadyTimeoutId === null) return;
  window.clearTimeout(rendererReadyTimeoutId);
  rendererReadyTimeoutId = null;
}

function teardownRendererFrame(sendDispose: boolean): void {
  clearRendererReadyTimeout();

  if (sendDispose && rendererPort) {
    try {
      rendererPort.postMessage({
        type: 'dispose',
        sessionId: currentSessionId,
      } satisfies SakuraRendererCommand);
    } catch {
      // The frame is being removed immediately below, which also stops its worker.
    }
  }

  if (rendererPort) {
    rendererPort.onmessage = null;
    rendererPort.onmessageerror = null;
    rendererPort.close();
    rendererPort = null;
  }

  if (rendererFrame) {
    if (rendererFrameLoadHandler) {
      rendererFrame.removeEventListener('load', rendererFrameLoadHandler);
    }
    if (rendererFrameErrorHandler) {
      rendererFrame.removeEventListener('error', rendererFrameErrorHandler);
    }
    rendererFrame.remove();
    rendererFrame = null;
  }

  rendererFrameLoadHandler = null;
  rendererFrameErrorHandler = null;
}

function postRendererCommand(command: SakuraRendererCommand): boolean {
  if (!rendererPort || rendererMode !== 'worker-frame') return false;

  try {
    rendererPort.postMessage(command);
    return true;
  } catch (error) {
    fallbackFromWorkerFrame(error);
    return false;
  }
}

function stopMainAnimation(): void {
  if (mainAnimationFrameId === null) return;
  cancelAnimationFrame(mainAnimationFrameId);
  mainAnimationFrameId = null;
}

function startMainAnimation(): void {
  if (
    rendererMode !== 'main-thread' ||
    mainAnimationFrameId !== null ||
    document.visibilityState !== 'visible'
  ) {
    return;
  }
  mainAnimationFrameId = requestAnimationFrame(updateAndDrawOnMainThread);
}

function updateAndDrawOnMainThread(time: number): void {
  mainAnimationFrameId = null;
  if (rendererMode !== 'main-thread' || !mainScene || state === 'off') return;

  const elapsedMs = mainLastDrawTime > 0 ? time - mainLastDrawTime : SAKURA_BASE_FRAME_MS;
  mainLastDrawTime = time;
  const visibleCount = mainScene.renderFrame(time, elapsedMs, state === 'draining');

  if (state === 'draining' && visibleCount === 0) {
    finalizeDrain();
    return;
  }

  startMainAnimation();
}

function startMainThreadRenderer(): boolean {
  canvas = createEffectCanvas();
  const context = canvas.getContext('2d');
  if (!context) return false;

  mainScene = new SakuraScene({
    canvas,
    context,
    createSpriteCanvas: () => document.createElement('canvas'),
  });
  mainScene.initialize(viewportWidth, viewportHeight, renderDpr);
  mainLastDrawTime = 0;
  rendererMode = 'main-thread';
  startMainAnimation();
  return true;
}

function handleRendererMessage(event: MessageEvent<SakuraWorkerEvent>): void {
  const message = event.data;
  if (message.sessionId !== currentSessionId || rendererMode !== 'worker-frame') return;

  if (message.type === 'ready') {
    clearRendererReadyTimeout();
    if (rendererFrame) rendererFrame.dataset.gvSakuraRenderer = 'worker';
    return;
  }

  if (message.type === 'fatal') {
    fallbackFromWorkerFrame(new Error(message.reason));
    return;
  }

  if (message.type === 'drained' && state === 'draining' && message.drainId === currentDrainId) {
    finalizeDrain();
  }
}

function fallbackFromWorkerFrame(error: unknown): void {
  if (rendererMode !== 'worker-frame' || state === 'off') return;

  console.warn('[Gemini Voyager] Sakura worker frame unavailable; using fallback:', error);
  workerUnavailableForPage = true;
  teardownRendererFrame(false);
  rendererMode = 'none';

  if (!startMainThreadRenderer()) forceDisable();
}

function canUseFirefoxWorkerFrame(): boolean {
  return (
    isFirefox() &&
    !workerUnavailableForPage &&
    typeof MessageChannel === 'function' &&
    typeof chrome.runtime?.getURL === 'function'
  );
}

function connectRendererFrame(frame: HTMLIFrameElement, channelId: string): void {
  if (rendererFrame !== frame || rendererMode !== 'worker-frame') return;

  try {
    const frameWindow = frame.contentWindow;
    if (!frameWindow) throw new Error('Sakura renderer frame has no content window');

    const rendererUrl = chrome.runtime.getURL(RENDERER_PAGE_PATH);
    const parsedRendererUrl = new URL(rendererUrl);
    const rendererOrigin = `${parsedRendererUrl.protocol}//${parsedRendererUrl.host}`;
    const channel = new MessageChannel();
    rendererPort = channel.port1;
    channel.port1.onmessage = handleRendererMessage;
    channel.port1.onmessageerror = (): void => {
      fallbackFromWorkerFrame(new Error('Unable to decode a Sakura renderer event'));
    };
    channel.port1.start();

    frameWindow.postMessage({ type: SAKURA_RENDERER_CONNECT_MESSAGE, channelId }, rendererOrigin, [
      channel.port2,
    ]);

    postRendererCommand({
      type: 'init',
      sessionId: currentSessionId,
      width: viewportWidth,
      height: viewportHeight,
      dpr: renderDpr,
      visible: document.visibilityState === 'visible',
      mode: state === 'draining' ? 'draining' : 'active',
      drainId: currentDrainId,
    });
  } catch (error) {
    fallbackFromWorkerFrame(error);
  }
}

function tryStartFirefoxWorkerFrame(): boolean {
  if (!canUseFirefoxWorkerFrame()) return false;

  try {
    const channelId = createChannelId();
    const frame = document.createElement('iframe');
    frame.id = RENDERER_FRAME_ID;
    frame.dataset.gvSakuraRenderer = 'worker-pending';
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;border:0;pointer-events:none;background:transparent;z-index:2147483647;';
    frame.src = `${chrome.runtime.getURL(RENDERER_PAGE_PATH)}#${encodeURIComponent(channelId)}`;

    rendererMode = 'worker-frame';
    rendererFrame = frame;
    rendererFrameLoadHandler = () => connectRendererFrame(frame, channelId);
    rendererFrameErrorHandler = () => {
      fallbackFromWorkerFrame(new Error('Sakura renderer frame failed to load'));
    };
    frame.addEventListener('load', rendererFrameLoadHandler, { once: true });
    frame.addEventListener('error', rendererFrameErrorHandler, { once: true });

    rendererReadyTimeoutId = window.setTimeout(() => {
      fallbackFromWorkerFrame(new Error('Sakura renderer did not become ready in time'));
    }, RENDERER_READY_TIMEOUT_MS);

    document.documentElement.appendChild(frame);
    return true;
  } catch (error) {
    teardownRendererFrame(false);
    rendererMode = 'none';
    workerUnavailableForPage = true;
    console.warn('[Gemini Voyager] Failed to start Sakura renderer frame:', error);
    return false;
  }
}

function handleVisibilityChange(): void {
  const visible = document.visibilityState === 'visible';

  if (rendererMode === 'worker-frame') {
    if (rendererPort) {
      postRendererCommand({
        type: 'visibility',
        sessionId: currentSessionId,
        visible,
      });
    }
    return;
  }

  if (visible) {
    mainLastDrawTime = 0;
    startMainAnimation();
  } else {
    stopMainAnimation();
  }
}

function enable(): void {
  if (state === 'active') return;

  if (state === 'draining') {
    state = 'active';
    currentDrainId = ++drainCounter;
    if (rendererMode === 'worker-frame') {
      if (rendererPort) {
        postRendererCommand({
          type: 'set-mode',
          sessionId: currentSessionId,
          mode: 'active',
          drainId: currentDrainId,
        });
      }
    } else {
      startMainAnimation();
    }
    return;
  }

  state = 'active';
  rendererMode = 'none';
  currentSessionId = ++sessionCounter;
  currentDrainId = ++drainCounter;
  mainLastDrawTime = 0;
  viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  renderDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, SAKURA_MAX_DPR));

  if (!tryStartFirefoxWorkerFrame() && !startMainThreadRenderer()) {
    forceDisable();
    return;
  }

  resizeHandler = updateViewportMetrics;
  window.addEventListener('resize', resizeHandler);

  visibilityHandler = handleVisibilityChange;
  document.addEventListener('visibilitychange', visibilityHandler);
}

/** Stop recycling petals and let the existing full-quality scene drain. */
function disable(): void {
  if (state !== 'active') return;

  state = 'draining';
  currentDrainId = ++drainCounter;
  if (rendererMode === 'worker-frame' && rendererPort) {
    postRendererCommand({
      type: 'set-mode',
      sessionId: currentSessionId,
      mode: 'draining',
      drainId: currentDrainId,
    });
  }
}

function finalizeDrain(): void {
  state = 'off';
  stopMainAnimation();
  teardownRendererFrame(true);
  mainScene?.dispose();
  mainScene = null;

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }

  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }

  canvas?.remove();
  canvas = null;
  rendererMode = 'none';
  mainLastDrawTime = 0;
  viewportWidth = 1;
  viewportHeight = 1;
  renderDpr = 1;
}

function forceDisable(): void {
  if (state === 'off') return;
  finalizeDrain();
}

function resolveEffect(result: Record<string, unknown>): string {
  if (typeof result[STORAGE_KEY] === 'string') return result[STORAGE_KEY] as string;
  if (result[LEGACY_KEY] === true) return 'snow';
  return 'off';
}

export function startSakuraEffect(): void {
  try {
    chrome.storage?.sync?.get({ [STORAGE_KEY]: null, [LEGACY_KEY]: false }, (result) => {
      if (resolveEffect(result) === EFFECT_VALUE) enable();
    });
  } catch (error) {
    console.error('[Gemini Voyager] Failed to get sakura effect setting:', error);
  }

  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'sync' || !changes[STORAGE_KEY]) return;

      if (changes[STORAGE_KEY].newValue === EFFECT_VALUE) {
        enable();
      } else {
        disable();
      }
    });
  } catch (error) {
    console.error('[Gemini Voyager] Failed to add storage listener for sakura effect:', error);
  }

  window.addEventListener('beforeunload', forceDisable);
}
