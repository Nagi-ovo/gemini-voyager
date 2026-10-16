import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const engineCreate = vi.hoisted(() => vi.fn());
const fetchImageViaExtensionRuntime = vi.hoisted(() => vi.fn());

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

type WatermarkRuntime = typeof import('./runtimeHarness');
type FakeEngine = { removeWatermarkFromImage: ReturnType<typeof vi.fn> };

const PROCESSED_DATA_URL = 'data:image/png;base64,cHJvY2Vzc2Vk';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settleResolve, settleReject) => {
    resolve = settleResolve;
    reject = settleReject;
  });
  return { promise, resolve, reject };
}

const createProcessedCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'toBlob', {
    value: (callback: BlobCallback) => callback(new Blob(['processed'], { type: 'image/png' })),
    configurable: true,
  });
  return canvas;
};

const createEngine = (): FakeEngine => ({
  removeWatermarkFromImage: vi.fn(async () => createProcessedCanvas()),
});

const createDownloadHost = (): HTMLElement => {
  const host = document.createElement('download-generated-image-button');
  host.appendChild(document.createElement('button'));
  document.body.appendChild(host);
  return host;
};

const createPreviewImage = (): HTMLImageElement => {
  const host = document.createElement('generated-image');
  const image = document.createElement('img');
  image.src = 'https://lh3.googleusercontent.com/generated=s1024';
  host.appendChild(image);
  document.body.appendChild(host);
  return image;
};

const getBridge = (): HTMLElement => {
  const bridge = document.getElementById('gv-watermark-bridge');
  if (!bridge) throw new Error('Expected the watermark bridge to exist.');
  return bridge;
};

/** Click the native button, then let the MAIN-world interceptor hand over the image. */
async function downloadThroughBridge(host: HTMLElement, requestId: string): Promise<void> {
  host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  getBridge().dataset.request = JSON.stringify({
    requestId,
    base64: 'data:image/png;base64,b3JpZ2luYWw=',
  });
  await vi.waitFor(() => expect(getBridge().dataset.request).toBeUndefined());
}

describe('watermarkRemover lifecycle generation', () => {
  let stored: Record<string, unknown>;
  let runtime: WatermarkRuntime | null;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    stored = { gvWatermarkDownloadEnabled: true, gvWatermarkPreviewEnabled: false };
    runtime = null;
    engineCreate.mockReset();
    fetchImageViaExtensionRuntime.mockReset();
    fetchImageViaExtensionRuntime.mockResolvedValue({
      base64: 'cHJldmlldy1pbWFnZQ==',
      contentType: 'image/png',
    });
    vi.stubGlobal(
      'Image',
      class AutoLoadingImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        crossOrigin = '';
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
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:processed-preview');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PROCESSED_DATA_URL);
    vi.mocked(chrome.storage.sync.get).mockImplementation(async () => ({ ...stored }));
  });

  afterEach(() => {
    runtime?.stopWatermarkRemover();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a superseded run whose engine loads late does not bring back its preview mode', async () => {
    const engineLoad = deferred<FakeEngine>();
    engineCreate.mockReturnValue(engineLoad.promise);
    runtime = await import('./runtimeHarness');
    const host = createDownloadHost();
    const preview = createPreviewImage();

    // The retired run had previews on; the run that replaced it does not.
    stored = { gvWatermarkDownloadEnabled: true, gvWatermarkPreviewEnabled: true };
    const oldStart = runtime.startWatermarkRemover();
    await vi.waitFor(() => expect(engineCreate).toHaveBeenCalledTimes(1));
    runtime.stopWatermarkRemover();

    stored = { gvWatermarkDownloadEnabled: true, gvWatermarkPreviewEnabled: false };
    const newStart = runtime.startWatermarkRemover();
    const engine = createEngine();
    engineLoad.resolve(engine);
    await Promise.all([oldStart, newStart]);

    expect(getBridge().dataset.enabled).toBe('true');
    expect(host.querySelector('.nanobanana-indicator')).not.toBeNull();
    await downloadThroughBridge(host, 'after-late-init');
    expect(getBridge().dataset.downloadIntentToken).toBeDefined();
    await vi.waitFor(() =>
      expect(JSON.parse(getBridge().dataset.response ?? '{}')).toMatchObject({
        requestId: 'after-late-init',
        base64: PROCESSED_DATA_URL,
      }),
    );
    // Only the download ran through the engine: the old run's preview mode stayed retired.
    expect(engine.removeWatermarkFromImage).toHaveBeenCalledTimes(1);
    expect(preview.dataset.watermarkProcessed).toBeUndefined();
  });

  it("a superseded run that fails late keeps the newer run's engine load for queued downloads", async () => {
    const oldRead = deferred<Record<string, unknown>>();
    vi.mocked(chrome.storage.sync.get).mockImplementationOnce(() => oldRead.promise);
    const engineLoad = deferred<FakeEngine>();
    engineCreate.mockReturnValue(engineLoad.promise);
    runtime = await import('./runtimeHarness');
    const host = createDownloadHost();

    const oldStart = runtime.startWatermarkRemover();
    runtime.stopWatermarkRemover();
    const newStart = runtime.startWatermarkRemover();
    await vi.waitFor(() => expect(engineCreate).toHaveBeenCalledTimes(1));

    oldRead.reject(new Error('storage read failed'));
    await oldStart;

    // The engine is still loading: the request must wait for it, not fail.
    await downloadThroughBridge(host, 'while-engine-loads');
    engineLoad.resolve(createEngine());
    await newStart;

    await vi.waitFor(() =>
      expect(JSON.parse(getBridge().dataset.response ?? '{}')).toMatchObject({
        requestId: 'while-engine-loads',
        base64: PROCESSED_DATA_URL,
      }),
    );
    expect(engineCreate).toHaveBeenCalledTimes(1);
  });

  it('a settings change while the engine loads still completes the queued download', async () => {
    const engineLoad = deferred<FakeEngine>();
    engineCreate.mockReturnValue(engineLoad.promise);
    runtime = await import('./runtimeHarness');
    const host = createDownloadHost();

    const start = runtime.startWatermarkRemover();
    await vi.waitFor(() => expect(engineCreate).toHaveBeenCalledTimes(1));
    await downloadThroughBridge(host, 'download-during-change');
    const intentToken = getBridge().dataset.downloadIntentToken;
    expect(intentToken).toBeDefined();

    // Preview turns on while the download still waits for the engine.
    stored = { gvWatermarkDownloadEnabled: true, gvWatermarkPreviewEnabled: true };
    const restart = runtime.restartWatermarkRemover();
    engineLoad.resolve(createEngine());
    await Promise.all([start, restart]);

    await vi.waitFor(() =>
      expect(JSON.parse(getBridge().dataset.response ?? '{}')).toMatchObject({
        requestId: 'download-during-change',
        base64: PROCESSED_DATA_URL,
      }),
    );
    expect(getBridge().dataset.enabled).toBe('true');
    expect(getBridge().dataset.downloadIntentToken).toBe(intentToken);
    expect(host.querySelector('.nanobanana-indicator')).not.toBeNull();
  });
});
