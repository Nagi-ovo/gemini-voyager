import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startWatermarkRemover, stopWatermarkRemover } from '../index';
import { WatermarkEngine } from '../watermarkEngine';

const fetchImageViaExtensionRuntime = vi.hoisted(() => vi.fn());

vi.mock('@/core/utils/browser', () => ({
  getVoyagerBuildTarget: () => 'safari',
}));

vi.mock('@/core/utils/runtimeImageFetch', () => ({
  fetchImageViaExtensionRuntime,
}));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
}));

vi.mock('../watermarkEngine', () => ({
  WatermarkEngine: {
    create: vi.fn(),
  },
}));

const flushAsyncWork = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('Safari direct watermark download', () => {
  const processedBlob = new Blob(['processed'], { type: 'image/png' });
  const removeWatermarkFromImage = vi.fn(async () => ({
    toBlob: (callback: BlobCallback) => callback(processedBlob),
  }));

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      gvWatermarkDownloadEnabled: true,
      gvWatermarkPreviewEnabled: false,
    });
    vi.mocked(WatermarkEngine.create).mockResolvedValue({
      removeWatermarkFromImage,
    } as never);
    fetchImageViaExtensionRuntime.mockResolvedValue({
      base64: 'aW1hZ2U=',
      contentType: 'image/png',
    });

    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = '';
      width = 2816;
      height = 1536;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('Image', LoadedImage);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:https://gemini.google.com/download'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    stopWatermarkRemover();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('cancels the native click and downloads the Alpha-processed Blob', async () => {
    document.body.innerHTML = `
      <generated-image>
        <img src="https://lh3.googleusercontent.com/example=s512" />
        <download-generated-image-button>
          <button><mat-icon fonticon="download"></mat-icon></button>
        </download-generated-image-button>
      </generated-image>
    `;
    const downloadedAnchors: HTMLAnchorElement[] = [];
    const appendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node.nodeName === 'A') {
        const anchor = node as HTMLAnchorElement;
        downloadedAnchors.push(anchor);
        vi.spyOn(anchor, 'click').mockImplementation(() => {});
      }
      return appendChild(node);
    });
    const nativeClick = vi.fn();
    const button = document.querySelector('button')!;
    button.addEventListener('click', nativeClick);

    await startWatermarkRemover();

    const allowed = button.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await flushAsyncWork();

    expect(allowed).toBe(false);
    expect(nativeClick).not.toHaveBeenCalled();
    expect(fetchImageViaExtensionRuntime).toHaveBeenCalledWith(
      'https://lh3.googleusercontent.com/example=s0',
    );
    expect(removeWatermarkFromImage).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(downloadedAnchors).toHaveLength(1));
    expect(downloadedAnchors[0].download).toMatch(/^Gemini_Generated_Image_\d+\.png$/);
  });
});
