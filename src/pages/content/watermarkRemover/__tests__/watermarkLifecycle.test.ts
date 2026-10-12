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
  shell: typeof import('../feature');
  runtime: typeof import('../index');
}> {
  vi.resetModules();
  const runtime = await import('../index');
  const shell = await import('../feature');
  return { shell, runtime };
}

function asNativeFeature(start: () => StopNativeFeature): NativeFeature {
  return { id: 'watermark-remover', position: CleanupPositions.StopWatermarkRemover, start };
}

describe('watermark remover feature shell', () => {
  let settings: Record<string, unknown>;
  const stops: StopNativeFeature[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.getElementById('gv-watermark-bridge')?.remove();
    settings = { gvWatermarkDownloadEnabled: true, gvWatermarkPreviewEnabled: false };
    engineCreate.mockReset();
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
    vi.mocked(chrome.storage.sync.get).mockImplementation(async () => ({ ...settings }));
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
      asNativeFeature(oldCopy.shell.startWatermarkRemoverFeature),
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
        asNativeFeature(newCopy.shell.startWatermarkRemoverFeature),
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
    expect(host.querySelector('.nanobanana-indicator')).not.toBeNull();

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

  it('stop is available synchronously before the engine loads', async () => {
    const engineLoad = deferred<TestEngine>();
    engineCreate.mockReturnValueOnce(engineLoad.promise);
    settings.gvWatermarkPreviewEnabled = true;
    const { host } = createDownloadHost();
    const { shell } = await loadContentScriptCopy();

    const stop = shell.startWatermarkRemoverFeature();
    expect(typeof stop).toBe('function');
    await vi.waitFor(() => expect(engineCreate).toHaveBeenCalledTimes(1));
    expect(getBridge().dataset.enabled).toBe('true');

    stop();
    engineLoad.resolve(createEngine());
    await settleAsyncWork();

    expect(getBridge().dataset.enabled).toBe('false');
    expect(host.querySelector('.nanobanana-indicator')).toBeNull();
  });

  it('a settings change during a download keeps the download runtime', async () => {
    const engine = createEngine();
    engineCreate.mockResolvedValue(engine);
    const { button } = createDownloadHost();
    const { shell, runtime } = await loadContentScriptCopy();

    const stop = shell.startWatermarkRemoverFeature();
    stops.push(stop);
    await settleAsyncWork();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const bridge = getBridge();
    const intentToken = bridge.dataset.downloadIntentToken;
    expect(intentToken).toBeDefined();

    // The storage router restarts the runtime when only the preview mode changes.
    settings.gvWatermarkPreviewEnabled = true;
    await runtime.restartWatermarkRemover();

    expect(bridge.dataset.enabled).toBe('true');
    expect(bridge.dataset.downloadIntentToken).toBe(intentToken);
    bridge.dataset.request = JSON.stringify({
      requestId: 'download-across-restart',
      base64: 'data:image/png;base64,b3JpZ2luYWw=',
      intentToken,
    });
    await vi.waitFor(() =>
      expect(JSON.parse(bridge.dataset.response ?? '{}')).toMatchObject({
        requestId: 'download-across-restart',
        base64: 'data:image/png;base64,cHJvY2Vzc2Vk',
      }),
    );

    // The shell's stop still owns the restarted runtime.
    stop();
    expect(bridge.dataset.enabled).toBe('false');
    expect(bridge.dataset.downloadIntentToken).toBeUndefined();
  });

  it('a settings change after stop does not bring the runtime back', async () => {
    engineCreate.mockResolvedValue(createEngine());
    const { host, button } = createDownloadHost();
    const { shell } = await loadContentScriptCopy();
    const stop = shell.startWatermarkRemoverFeature();
    await settleAsyncWork();
    stop();

    settings.gvWatermarkPreviewEnabled = true;
    await shell.restartWatermarkRemoverFeature();
    await settleAsyncWork();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(getBridge().dataset.enabled).toBe('false');
    expect(getBridge().dataset.downloadIntentToken).toBeUndefined();
    expect(host.querySelector('.nanobanana-indicator')).toBeNull();
  });

  it('a settings change before startup starts nothing', async () => {
    const { shell } = await loadContentScriptCopy();

    await shell.restartWatermarkRemoverFeature();

    expect(document.getElementById('gv-watermark-bridge')).toBeNull();
    expect(engineCreate).not.toHaveBeenCalled();
  });

  it('a stop from an earlier start does not stop a later one', async () => {
    engineCreate.mockResolvedValue(createEngine());
    const { host } = createDownloadHost();
    const { shell } = await loadContentScriptCopy();

    const earlierStop = shell.startWatermarkRemoverFeature();
    await settleAsyncWork();
    earlierStop();
    stops.push(shell.startWatermarkRemoverFeature());
    await settleAsyncWork();

    earlierStop();

    expect(getBridge().dataset.enabled).toBe('true');
    expect(host.querySelector('.nanobanana-indicator')).not.toBeNull();
  });
});
