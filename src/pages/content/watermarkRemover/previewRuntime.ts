import { logger } from '@/core/services/LoggerService';

import { recordWatermarkPresence } from '../watermarkNativeNotice/cleanStreak';
import { DOWNLOAD_ICON_SELECTOR } from './downloadButton';
import type { WatermarkEngine } from './watermarkEngine';

/**
 * Preview writes and indicators share one DOM-observation lifetime. The caller
 * invalidates the generation/preview flag before stop; pending images then release
 * their queue slots and retry only when the latest state still enables previews.
 * watchIndicators runs before engine readiness; start upgrades to preview processing.
 */
export function createWatermarkPreviews({
  getState,
  fetchImage,
  health,
}: {
  getState: () => {
    engine: WatermarkEngine | null;
    generation: number;
    previewEnabled: boolean;
    downloadEnabled: boolean;
  };
  fetchImage: (url: string) => Promise<HTMLImageElement>;
  health: { rememberPreview: (image: HTMLImageElement, sourceSrc: string) => void };
}) {
  const processingQueue = new Set<HTMLImageElement>();
  let previewObserver: MutationObserver | null = null;
  let indicatorObserver: MutationObserver | null = null;
  const pendingDebounceTimeouts = new Set<ReturnType<typeof setTimeout>>();

  /**
   * Debounce function to limit execution frequency
   */
  const debounce = <T extends (...args: unknown[]) => void>(func: T, wait: number): T => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return ((...args: unknown[]) => {
      if (timeout) {
        clearTimeout(timeout);
        pendingDebounceTimeouts.delete(timeout);
      }
      timeout = setTimeout(() => {
        if (timeout) pendingDebounceTimeouts.delete(timeout);
        timeout = null;
        func(...args);
      }, wait);
      pendingDebounceTimeouts.add(timeout);
    }) as T;
  };

  /**
   * Convert canvas to blob
   */
  const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to convert canvas to blob'));
      }, type);
    });

  const isValidGeminiImage = (img: HTMLImageElement): boolean =>
    img.closest('generated-image,.generated-image-container') !== null;

  /**
   * Find all Gemini-generated images on the page
   */
  const findGeminiImages = (): HTMLImageElement[] =>
    [...document.querySelectorAll<HTMLImageElement>('img[src*="googleusercontent.com"]')].filter(
      (img) => isValidGeminiImage(img) && img.dataset.watermarkProcessed !== 'true',
    );

  /**
   * Clear preview bookkeeping without restoring the current image source.
   * Gemini can reuse an existing <img> for a later generated image, so stale
   * processed markers must not prevent the replacement source from being handled
   * after preview removal is re-enabled.
   */
  const clearPreviewImageState = (): void => {
    document
      .querySelectorAll<HTMLImageElement>(
        'img[data-watermark-processed], img[data-watermark-original-src]',
      )
      .forEach((img) => {
        delete img.dataset.watermarkProcessed;
        delete img.dataset.watermarkOriginalSrc;
        delete img.dataset.processedUrl;
      });
  };

  /**
   * Replace image URL size parameter to get full resolution
   */
  const replaceWithNormalSize = (src: string): string => {
    // Use normal size image to fit watermark
    return src.replace(/=[swh]\d+(?:-[wh]\d+)*/, '=s0');
  };

  /**
   * Attach the 🍌 badge to a download button. The badge lives INSIDE the button
   * because Gemini wraps it in `<gem-icon-button>` which has `overflow: hidden`,
   * so any negative offset overhanging the wrapper would be clipped.
   */
  function attachIndicatorToButton(nativeButton: HTMLButtonElement): void {
    // Idempotency: don't add a second indicator to the same button.
    if (nativeButton.querySelector('.nanobanana-indicator')) return;

    const indicator = document.createElement('span');
    indicator.className = 'nanobanana-indicator';
    indicator.textContent = '🍌';
    indicator.title =
      chrome.i18n.getMessage('nanobananaDownloadTooltip') ||
      'Image Refinement: Downloads will be processed automatically';

    Object.assign(indicator.style, {
      position: 'absolute',
      top: '2px',
      right: '2px',
      fontSize: '11px',
      lineHeight: '1',
      pointerEvents: 'none', // Let clicks pass through to the native button
      zIndex: '10',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
    });

    // mdc-icon-button is `position: relative` by default; guard against future
    // Gemini changes that might flip it to static.
    if (getComputedStyle(nativeButton).position === 'static') {
      nativeButton.style.position = 'relative';
    }
    nativeButton.appendChild(indicator);
  }

  /**
   * Add a visual indicator (🍌) to the native download button via the
   * preview-image path. Looks up the button through the generated-image
   * container; for the lightbox/expansion-dialog path, see
   * decorateDownloadButtons() which walks every `<download-generated-image-button>`
   * host (toolbar AND lightbox).
   */
  function addDownloadIndicator(imgElement: HTMLImageElement): void {
    const container = imgElement.closest('generated-image,.generated-image-container');
    if (!container) return;

    const nativeDownloadIcon = container.querySelector(DOWNLOAD_ICON_SELECTOR);
    const nativeButton = nativeDownloadIcon?.closest('button');
    if (!nativeButton) return;

    attachIndicatorToButton(nativeButton as HTMLButtonElement);
  }

  /**
   * Process a single image to remove watermark (for preview images)
   */
  async function processImage(imgElement: HTMLImageElement): Promise<void> {
    const { engine, generation } = getState();
    if (!engine || processingQueue.has(imgElement)) return;
    let stale = false;
    const isStale = (): boolean => {
      const state = getState();
      stale = generation !== state.generation || !state.previewEnabled;
      return stale;
    };

    processingQueue.add(imgElement);
    imgElement.dataset.watermarkProcessed = 'processing';

    const originalSrc = imgElement.src;
    try {
      health.rememberPreview(imgElement, originalSrc);

      // Fetch full resolution image via background script (bypasses CORS)
      const normalSizeSrc = replaceWithNormalSize(originalSrc);
      const normalSizeImg = await fetchImage(normalSizeSrc);
      if (isStale()) return;

      // Process image to remove watermark
      const processedCanvas = await engine.removeWatermarkFromImage(
        normalSizeImg,
        (presence) => void recordWatermarkPresence(presence),
      );
      if (isStale()) return;
      const processedBlob = await canvasToBlob(processedCanvas);
      if (isStale()) return;

      // Replace image source with processed blob URL
      const processedUrl = URL.createObjectURL(processedBlob);
      imgElement.dataset.watermarkOriginalSrc = originalSrc;
      imgElement.src = processedUrl;
      imgElement.dataset.watermarkProcessed = 'true';
      imgElement.dataset.processedUrl = processedUrl; // Store for reference

      logger.debug('[Gemini Voyager] Watermark removed from preview image');

      if (getState().downloadEnabled) {
        addDownloadIndicator(imgElement);
      }
    } catch (error) {
      if (isStale()) return;
      console.warn('[Gemini Voyager] Failed to process image for watermark removal:', error);
      imgElement.dataset.watermarkProcessed = 'failed';
    } finally {
      processingQueue.delete(imgElement);
      if (stale) {
        if (imgElement.dataset.watermarkProcessed === 'processing') {
          delete imgElement.dataset.watermarkProcessed;
        }
        // A full restart can invalidate this task while leaving preview removal
        // enabled (for example, when only the download toggle changed). Retry
        // after releasing the queue slot so the latest lifecycle owns the write.
        if (getState().previewEnabled && imgElement.isConnected && isValidGeminiImage(imgElement)) {
          void processImage(imgElement);
        }
      }
    }
  }

  /**
   * Process all Gemini-generated images on the page (preview path)
   */
  const processAllImages = (): void => {
    const images = findGeminiImages();
    images.forEach(processImage);

    if (getState().downloadEnabled) {
      // Re-run the indicator pass so blob-src previews and late-loading native
      // buttons still pick up the 🍌 badge (idempotent).
      decorateDownloadButtons();
    }
  };

  /**
   * Add the 🍌 indicator to every Gemini-generated image's download button.
   *
   * Walks `<download-generated-image-button>` hosts directly instead of going
   * through the img element. This covers:
   *  1. The in-message toolbar (host lives inside `<generated-image>`)
   *  2. The lightbox / `<expansion-dialog>` rendered into `cdk-overlay-container`
   *     — same custom element, but NOT inside any `generated-image` container.
   *
   * Also independent of the img src (blob: vs googleusercontent.com).
   */
  const decorateDownloadButtons = (): void => {
    const hosts = document.querySelectorAll<HTMLElement>('download-generated-image-button');
    hosts.forEach((host) => {
      const button = host.querySelector<HTMLButtonElement>('button');
      if (button) attachIndicatorToButton(button);
    });
  };

  /**
   * Setup MutationObserver to watch for new images and run the preview pipeline.
   */
  const setupMutationObserver = (): void => {
    if (previewObserver) return;
    const debouncedProcess = debounce(processAllImages, 100);
    previewObserver = new MutationObserver(debouncedProcess);
    previewObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true, // Watch for attribute changes (like native buttons appearing)
      attributeFilter: ['class', 'src'],
    });
    logger.debug('[Gemini Voyager] Watermark remover MutationObserver active');
  };

  /**
   * Lighter MutationObserver that skips the canvas pipeline and only decorates
   * download buttons. It also covers the engine-loading window before the full
   * preview observer can take over.
   */
  const setupIndicatorObserver = (): void => {
    if (indicatorObserver) return;
    const debouncedDecorate = debounce(decorateDownloadButtons, 100);
    indicatorObserver = new MutationObserver(debouncedDecorate);
    indicatorObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'src'],
    });
    logger.debug('[Gemini Voyager] Watermark download-indicator observer active');
  };
  const watchIndicators = (): void => {
    decorateDownloadButtons();
    setupIndicatorObserver();
  };

  const start = (): void => {
    // The preview observer takes over late-button decoration after the engine loads.
    indicatorObserver?.disconnect();
    indicatorObserver = null;
    processAllImages();
    setupMutationObserver();
  };

  const stop = (): void => {
    previewObserver?.disconnect();
    indicatorObserver?.disconnect();
    previewObserver = null;
    indicatorObserver = null;
    for (const timeout of pendingDebounceTimeouts) clearTimeout(timeout);
    pendingDebounceTimeouts.clear();
    clearPreviewImageState();
  };

  return { watchIndicators, start, stop };
}
