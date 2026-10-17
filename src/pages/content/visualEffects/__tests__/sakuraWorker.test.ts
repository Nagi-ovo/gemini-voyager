import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRAIN_CAP_MS, EFFECT_FRAME_MS } from '../effectClock';
import type { SakuraWorkerCommand } from '../sakuraWorkerProtocol';

type WorkerGlobal = typeof globalThis & {
  onmessage: ((event: { data: SakuraWorkerCommand }) => void) | null;
};

describe('Sakura worker', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let posted: unknown[];
  let fillStyles: string[];

  function createContext() {
    return {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      set fillStyle(value: string) {
        fillStyles.push(value);
      },
      get fillStyle(): string {
        return fillStyles.at(-1) ?? '';
      },
    };
  }

  function send(command: SakuraWorkerCommand): void {
    (globalThis as WorkerGlobal).onmessage?.({ data: command });
  }

  function flush(time: number): void {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  }

  async function startWorker(scheme: 'light' | 'dark' = 'light'): Promise<void> {
    await import('../sakura.worker');
    const canvas = { width: 0, height: 0, getContext: () => createContext() };
    send({
      type: 'init',
      sessionId: 1,
      width: 1000,
      height: 1080,
      dpr: 1,
      running: true,
      scheme,
      mode: 'active',
      drainId: 1,
      canvas: canvas as unknown as OffscreenCanvas,
    });
  }

  beforeEach(() => {
    vi.resetModules();
    frames = new Map();
    nextFrameId = 1;
    posted = [];
    fillStyles = [];
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        width = 0;
        height = 0;
        getContext() {
          return createContext();
        }
      },
    );
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message);
    });
    vi.spyOn(window, 'close').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    (globalThis as WorkerGlobal).onmessage = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stops drawing while the page reports it paused and resumes after', async () => {
    await startWorker();
    expect(posted).toContainEqual({ type: 'ready', sessionId: 1 });
    flush(0);
    expect(frames.size).toBe(1);

    send({ type: 'running', sessionId: 1, running: false });
    expect(frames.size).toBe(0);

    send({ type: 'running', sessionId: 1, running: true });
    expect(frames.size).toBe(1);
  });

  it('accelerates a drain out and reports it within the cap', async () => {
    await startWorker();
    flush(0);
    send({ type: 'set-mode', sessionId: 1, mode: 'draining', drainId: 2 });
    let time = 0;
    while (frames.size > 0 && time < 10_000) {
      time += EFFECT_FRAME_MS;
      flush(time);
    }
    expect(posted).toContainEqual({ type: 'drained', sessionId: 1, drainId: 2 });
    expect(time).toBeLessThanOrEqual(DRAIN_CAP_MS);
  });

  it('re-renders its petal sprites when the page scheme changes', async () => {
    await startWorker('light');
    expect(fillStyles).toContain('hsla(350,72%,80%,1)');
    fillStyles.length = 0;

    send({ type: 'scheme', sessionId: 1, scheme: 'dark' });
    expect(fillStyles).toHaveLength(8);
    expect(fillStyles).toContain('hsla(350,50%,94%,1)');
  });
});
