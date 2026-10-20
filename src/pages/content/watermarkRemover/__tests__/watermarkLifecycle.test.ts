import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CleanupPositions } from '@/core/types/cleanupPositions';
import { CleanupManager } from '@/core/utils/cleanupManager';

import {
  mountNativeFeature,
  type NativeFeature,
  type StopNativeFeature,
} from '../../featureLifecycle';

const engineCreate = vi.hoisted(() => vi.fn());
const fetchImageViaExtensionRuntime = vi.hoisted(() => vi.fn());
const recordWatermarkPresence = vi.hoisted(() => vi.fn());

vi.mock('../../watermarkNativeNotice/cleanStreak', () => ({ recordWatermarkPresence }));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
}));

vi.mock('@/core/utils/runtimeImageFetch', () => ({
  fetchImageViaExtensionRuntime,
}));

vi.mock('../downloadButton', () => ({
  DOWNLOAD_ICON_SELECTOR: '.gv-test-download-icon',
  findNativeDownloadButton: (target: unknown) =>
    target instanceof HTMLButtonElement ? target : null,
}));

vi.mock('../watermarkEngine', () => ({
  WatermarkEngine: {
    create: engineCreate,
  },
}));

type TestEngine = { removeWatermarkFromImage: ReturnType<typeof vi.fn> };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const createEngine = (): TestEngine => ({
  removeWatermarkFromImage: vi.fn(async () => document.createElement('canvas')),
});

const createDownloadHost = (): { host: HTMLElement; button: HTMLButtonElement } => {
  const host = document.createElement('download-generated-image-button');
  const button = document.createElement('button');
  host.appendChild(button);
  document.body.appendChild(host);
  return { host, button };
};

const getBridge = (): HTMLElement => {
  const bridge = document.getElementById('gv-watermark-bridge');
  if (!bridge) throw new Error('watermark bridge missing');
  return bridge;
};

/** Let storage reads, engine continuations and queued image loads run. */
async function settleAsyncWork(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Each import after `vi.resetModules()` is a separate content-script copy with its own state. */
async function loadContentScriptCopy(): Promise<{
  runtime: typeof import('../index');
}> {
  vi.resetModules();
  const runtime = await import('../index');
  return { runtime };
}

function asNativeFeature(start: () => StopNativeFeature): NativeFeature {
  return { id: 'watermark-remover', position: CleanupPositions.StopWatermarkRemover, start };
}

function startOwners(runtime: typeof import('../index')): () => void {
  const stopHealth = runtime.startWatermarkImageHealth();
  const stopDownload = runtime.acquireWatermarkControl('download');
  return () => {
    stopDownload();
    stopHealth();
  };
}

describe('watermark runtime owners', () => {
  const stops: StopNativeFeature[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.getElementById('gv-watermark-bridge')?.remove();
    engineCreate.mockReset();
    recordWatermarkPresence.mockReset();
    fetchImageViaExtensionRuntime.mockReset();
    fetchImageViaExtensionRuntime.mockResolvedValue({
      base64: 'cHJldmlldw==',
      contentType: 'image/png',
    });
    vi.stubGlobal(
      'Image',
      class AutoLoadingImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        crossOrigin = '';
        naturalWidth = 32;
        naturalHeight = 32;
        width = 32;
        height = 32;
        private currentSrc = '';

        get src(): string {
          return this.currentSrc;
        }

        set src(value: string) {
          this.currentSrc = value;
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,cHJvY2Vzc2Vk',
    );
  });

  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    document.getElementById('gv-watermark-bridge')?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('after an old initialization finishes late, the new instance still downloads normally', async () => {
    const oldEngineLoad = deferred<TestEngine>();
    const newEngine = createEngine();
    engineCreate.mockReturnValueOnce(oldEngineLoad.promise).mockResolvedValueOnce(newEngine);
    const { host, button } = createDownloadHost();

    // The old copy starts and waits for its engine assets.
    const oldCopy = await loadContentScriptCopy();
    const oldManager = new CleanupManager();
    const oldLifetime = new AbortController();
    const oldMount = mountNativeFeature(
      oldManager,
      asNativeFeature(() => startOwners(oldCopy.runtime)),
      oldLifetime.signal,
    );
    await vi.waitFor(() => expect(engineCreate).toHaveBeenCalledTimes(1));

    // An extension update retires it before the engine loads.
    oldLifetime.abort();
    oldManager.executeCleanups();

    // Its successor starts, loads its own engine and takes a download click.
    const newCopy = await loadContentScriptCopy();
    const newManager = new CleanupManager();
    stops.push(
      await mountNativeFeature(
        newManager,
        asNativeFeature(() => startOwners(newCopy.runtime)),
        new AbortController().signal,
      ),
    );
    await vi.waitFor(() => expect(engineCreate).toHaveBeenCalledTimes(2));
    await settleAsyncWork();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const bridge = getBridge();
    const intentToken = bridge.dataset.downloadIntentToken;
    expect(intentToken).toBeDefined();

    // The old engine finishes loading only now.
    oldEngineLoad.resolve(createEngine());
    await oldMount;
    await settleAsyncWork();

    expect(bridge.dataset.enabled).toBe('true');
    expect(bridge.dataset.downloadIntentToken).toBe(intentToken);
    expect(bridge.dataset.downloadIntentExpiresAt).toBeDefined();
    expect(host.querySelector('.gv-watermark-indicator')).not.toBeNull();

    // The MAIN-world interceptor hands the download over and gets it back clean.
    bridge.dataset.request = JSON.stringify({
      requestId: 'download-after-late-old-init',
      base64: 'data:image/png;base64,b3JpZ2luYWw=',
      intentToken,
    });
    await vi.waitFor(() =>
      expect(JSON.parse(bridge.dataset.response ?? '{}')).toMatchObject({
        requestId: 'download-after-late-old-init',
        base64: 'data:image/png;base64,cHJvY2Vzc2Vk',
      }),
    );
    expect(newEngine.removeWatermarkFromImage).toHaveBeenCalledTimes(1);
  });

  it.each(['engine load', 'processing', 'engine error', 'processing error'])(
    'a content-script handoff during an accepted download still answers MAIN (%s)',
    async (phase) => {
      const engineLoad = deferred<TestEngine>();
      const processing = deferred<HTMLCanvasElement>();
      const oldEngine = createEngine();
      oldEngine.removeWatermarkFromImage.mockImplementation(
        async (_image: HTMLImageElement, report: (presence: string) => void) => {
          const canvas = await processing.promise;
          report('none');
          if (phase === 'processing error') throw new Error('processing failed');
          return canvas;
        },
      );
      engineCreate.mockReturnValueOnce(
        engineLoad.promise.then((loaded) => {
          if (phase === 'engine error') throw new Error('engine failed');
          return loaded;
        }),
      );
      const oldCopy = await loadContentScriptCopy();
      const oldManager = new CleanupManager();
      stops.push(
        await mountNativeFeature(
          oldManager,
          asNativeFeature(() => startOwners(oldCopy.runtime)),
          new AbortController().signal,
        ),
      );
      const bridge = getBridge();
      bridge.dataset.request = JSON.stringify({
        requestId: 'accepted-before-handoff',
        base64: 'data:image/png;base64,b3JpZ2luYWw=',
      });
      await vi.waitFor(() => expect(bridge.dataset.request).toBeUndefined());
      if (phase.startsWith('processing')) {
        engineLoad.resolve(oldEngine);
        await vi.waitFor(() => expect(oldEngine.removeWatermarkFromImage).toHaveBeenCalledOnce());
      }

      oldManager.executeCleanups();
      engineCreate.mockResolvedValueOnce(createEngine());
      const newCopy = await loadContentScriptCopy();
      stops.push(startOwners(newCopy.runtime));
      engineLoad.resolve(oldEngine);
      processing.resolve(document.createElement('canvas'));

      await vi.waitFor(() => {
        const response = JSON.parse(bridge.dataset.response ?? '{}');
        expect(response.requestId).toBe('accepted-before-handoff');
        if (phase.endsWith('error')) expect(response.error).toMatch(/failed/);
        else expect(response.base64).toBe('data:image/png;base64,cHJvY2Vzc2Vk');
      });
      expect(oldEngine.removeWatermarkFromImage).toHaveBeenCalledTimes(
        phase === 'engine error' ? 0 : 1,
      );
      expect(recordWatermarkPresence).not.toHaveBeenCalled();
      expect(bridge.dataset.enabled).toBe('true');
    },
  );

  it('stop is available synchronously before the engine loads', async () => {
    const engineLoad = deferred<TestEngine>();
    engineCreate.mockReturnValueOnce(engineLoad.promise);
    const { host } = createDownloadHost();
    const { runtime } = await loadContentScriptCopy();

    const stop = startOwners(runtime);
    expect(typeof stop).toBe('function');
    await vi.waitFor(() => expect(engineCreate).toHaveBeenCalledTimes(1));
    expect(getBridge().dataset.enabled).toBe('true');

    stop();
    engineLoad.resolve(createEngine());
    await settleAsyncWork();

    expect(getBridge().dataset.enabled).toBe('false');
    expect(host.querySelector('.gv-watermark-indicator')).toBeNull();
  });

  it('a released download owner cannot stop its successor or duplicate listeners', async () => {
    engineCreate.mockResolvedValue(createEngine());
    const { host, button } = createDownloadHost();
    const { runtime } = await loadContentScriptCopy();
    stops.push(runtime.startWatermarkImageHealth());
    const earlierStop = runtime.acquireWatermarkControl('download');
    earlierStop();
    stops.push(runtime.acquireWatermarkControl('download'));
    earlierStop();
    await settleAsyncWork();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getBridge().dataset.enabled).toBe('true');
    expect(host.querySelectorAll('.gv-watermark-indicator')).toHaveLength(1);
    expect(getBridge().dataset.downloadIntentToken).toMatch(/_1$/);
  });

  it('an unacquired runtime installs nothing', async () => {
    await loadContentScriptCopy();
    expect(document.getElementById('gv-watermark-bridge')).toBeNull();
    expect(engineCreate).not.toHaveBeenCalled();
  });
});
