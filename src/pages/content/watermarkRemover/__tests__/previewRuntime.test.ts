import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWatermarkPreviews } from '../previewRuntime';
import { WatermarkEngine } from '../watermarkEngine';

describe('watermark preview lifetime', () => {
  let previews: ReturnType<typeof createWatermarkPreviews>;
  let state: {
    engine: WatermarkEngine;
    generation: number;
    previewEnabled: boolean;
    downloadEnabled: boolean;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    const capture = document.createElement('img');
    const engine = new WatermarkEngine({
      bg36_20260520: capture,
      bg48: capture,
      bg96: capture,
      bg96_20260520: capture,
    });
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(new Blob(['clean'])));
    vi.spyOn(engine, 'removeWatermarkFromImage').mockResolvedValue(canvas);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clean-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    state = { engine, generation: 0, previewEnabled: true, downloadEnabled: false };
    previews = createWatermarkPreviews({
      getState: () => state,
      fetchImage: vi.fn(async () => document.createElement('img')),
      health: { rememberPreview: vi.fn() },
    });
  });

  afterEach(() => {
    state.previewEnabled = false;
    state.downloadEnabled = false;
    previews.stopPreviews();
    previews.stopIndicators();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function settleMutations(): Promise<void> {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
  }

  function createPreview(): HTMLImageElement {
    const host = document.createElement('generated-image');
    const img = document.createElement('img');
    img.src = 'https://lh3.googleusercontent.com/generated=s1024';
    img.srcset = `${img.src} 2x`;
    host.append(img);
    document.body.append(host);
    return img;
  }

  function createDownloadButton(): HTMLButtonElement {
    const host = document.createElement('download-generated-image-button');
    const button = document.createElement('button');
    host.append(button);
    document.body.append(host);
    return button;
  }

  it('releases a detached preview before shutdown and can process it again after reattachment', async () => {
    const img = createPreview();
    const originalSrc = img.src;
    const originalSrcset = img.srcset;
    previews.start();
    await settleMutations();
    expect(img.src).toBe('blob:clean-preview');

    const host = img.parentElement!;
    host.remove();
    await settleMutations();

    expect(img.src).toBe(originalSrc);
    expect(img.srcset).toBe(originalSrcset);
    expect(img.dataset.processedUrl).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:clean-preview');

    state.previewEnabled = false;
    previews.stopPreviews();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);

    document.body.append(host);
    state.previewEnabled = true;
    previews.start();
    await settleMutations();
    expect(img.src).toBe('blob:clean-preview');
    expect(state.engine.removeWatermarkFromImage).toHaveBeenCalledTimes(2);
  });

  it.each(['src', 'srcset'] as const)(
    'preserves a newer host %s when a preview is detached',
    async (attribute) => {
      const img = createPreview();
      previews.start();
      await settleMutations();

      const replacement = 'https://lh3.googleusercontent.com/new-native-image';
      img.setAttribute(attribute, replacement);
      img.parentElement!.remove();
      await settleMutations();

      expect(img.getAttribute(attribute)).toBe(replacement);
      expect(img.dataset.processedUrl).toBeUndefined();
      if (attribute === 'srcset') {
        expect(img.src).toBe('blob:clean-preview');
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      } else {
        expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:clean-preview');
      }
    },
  );

  it.each(['download', 'preview'] as const)(
    'keeps one body observer and decorates late downloads across preview handoff when %s starts first',
    async (first) => {
      const bodyObservers = new Set<MutationObserver>();
      const observe = MutationObserver.prototype.observe;
      const disconnect = MutationObserver.prototype.disconnect;
      vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(
        function (this: MutationObserver, target, options) {
          if (target === document.body) bodyObservers.add(this);
          return observe.call(this, target, options);
        },
      );
      vi.spyOn(MutationObserver.prototype, 'disconnect').mockImplementation(
        function (this: MutationObserver) {
          bodyObservers.delete(this);
          return disconnect.call(this);
        },
      );
      state.downloadEnabled = true;
      if (first === 'download') previews.watchIndicators();
      previews.start();
      previews.watchIndicators();
      expect(bodyObservers.size).toBe(1);

      const duringPreview = createDownloadButton();
      await settleMutations();
      expect(duringPreview.querySelectorAll('.nanobanana-indicator')).toHaveLength(1);

      state.previewEnabled = false;
      previews.stopPreviews();
      expect(bodyObservers.size).toBe(1);
      const afterPreview = createDownloadButton();
      await settleMutations();
      expect(afterPreview.querySelectorAll('.nanobanana-indicator')).toHaveLength(1);

      state.downloadEnabled = false;
      previews.stopIndicators();
      expect(bodyObservers.size).toBe(0);
    },
  );
});
