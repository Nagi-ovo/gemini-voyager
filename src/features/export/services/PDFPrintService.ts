/**
 * PDF Print Service
 * Implements elegant "paper book" style PDF export using browser's print function
 * Philosophy: Content over design, readability over fidelity
 */
import { isSafari } from '@/core/utils/browser';

import {
  type ChatTurn,
  type ConversationMetadata,
  DEFAULT_EXPORT_SPEAKER_LABELS,
  type ExportSpeakerLabels,
} from '../types/export';
import {
  EXPORT_IMAGE_FETCH_CONCURRENCY,
  MAX_EXPORT_IMAGE_COUNT,
  MAX_EXPORT_IMAGE_TOTAL_BYTES,
  fetchBoundedExportImage,
  mapWithConcurrency,
} from './boundedImageFetch';
import { isolateMermaidSvgImages, rasterizeMermaidSvgImages } from './mermaidSvgImage';
import { PDF_PRINT_CONTAINER_ID, createPDFPrintContainer } from './pdfPrintDocument';
import { PDF_PRINT_BODY_CLASS, PDF_PRINT_STYLES_ID, injectPDFPrintStyles } from './pdfPrintStyles';
import { resolvePDFPrintTitle } from './pdfPrintTitles';

/**
 * PDF print service using browser's native print dialog
 * Injects optimized styles for paper-friendly output
 */
export class PDFPrintService {
  private static CLEANUP_FALLBACK_DELAY_MS = 60_000;
  private static INLINE_FETCH_TIMEOUT_MS = 2_000;
  private static INLINE_DECODE_TIMEOUT_MS = 1_000;
  private static cleanupFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private static originalDocumentTitle: string | null = null;

  /**
   * Export conversation as PDF using browser print
   */
  static async export(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    options?: { fontSize?: number; speakerLabels?: ExportSpeakerLabels; signal?: AbortSignal },
  ): Promise<void> {
    await this.exportInternal(
      turns,
      metadata,
      options?.fontSize,
      options?.speakerLabels,
      options?.signal,
    );
  }

  private static async exportInternal(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    fontSize?: number,
    speakerLabels: ExportSpeakerLabels = DEFAULT_EXPORT_SPEAKER_LABELS,
    signal?: AbortSignal,
  ): Promise<void> {
    this.assertNotAborted(signal);
    // Ensure we don't leave a previous export container around (e.g. if a prior export failed)
    this.cleanup();

    const safari = isSafari();

    // Create print container
    const container = createPDFPrintContainer(turns, metadata, speakerLabels);
    if (safari) {
      isolateMermaidSvgImages(container);
    } else {
      await rasterizeMermaidSvgImages(container);
    }
    this.assertNotAborted(signal);
    document.body.appendChild(container);

    // Remove existing print styles so we can re-inject with new font size
    const existingStyles = document.getElementById(PDF_PRINT_STYLES_ID);
    if (existingStyles) existingStyles.remove();

    // Inject print styles
    injectPDFPrintStyles(fontSize);
    document.body.classList.add(PDF_PRINT_BODY_CLASS);

    // Keep print header/footer title aligned with conversation title in print dialog output.
    this.originalDocumentTitle = document.title;
    const printDialogTitle = resolvePDFPrintTitle(metadata, 'conversation');
    if (printDialogTitle) {
      document.title = printDialogTitle;
    }

    // Inline images as data URLs (best-effort) to avoid auth-bound links failing in print.
    // Safari is very strict about `window.print()` being called with a user gesture; awaiting here
    // may cause the print dialog to be blocked. So on Safari we do not await.
    const inlineImagesPromise = this.inlineImages(container, signal).catch(() => {
      /* ignore */
    });

    if (safari) {
      this.assertNotAborted(signal);
      this.forceStyleFlush(container);
      this.triggerPrint();
      this.registerCleanupHandlers();
      void inlineImagesPromise;
      return;
    }

    await inlineImagesPromise;
    await this.delay(100);
    this.assertNotAborted(signal);
    this.triggerPrint();
    this.registerCleanupHandlers();
  }

  private static assertNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      this.cleanup();
      throw new DOMException('Export cancelled', 'AbortError');
    }
  }

  private static triggerPrint(): void {
    try {
      window.print();
    } catch {
      // Ignore: some environments (tests/iframes) may not support printing
    }
  }

  private static forceStyleFlush(container: HTMLElement): void {
    try {
      // Force a synchronous style/layout flush so the print-only DOM is "real" before printing.
      // (Helps on Safari/WebKit where style application can lag behind DOM insertion.)
      container.getBoundingClientRect();
    } catch {
      /* ignore */
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.setTimeoutUnref(resolve, ms);
    });
  }

  private static registerCleanupHandlers(): void {
    // Prefer afterprint (reliable when supported); keep a fallback timer in case it never fires.
    const cleanupNow = (): void => {
      this.cleanup();
    };

    try {
      window.addEventListener('afterprint', cleanupNow, { once: true });
    } catch {
      /* ignore */
    }

    if (this.cleanupFallbackTimer !== null) {
      clearTimeout(this.cleanupFallbackTimer);
    }
    this.cleanupFallbackTimer = this.setTimeoutUnref(() => {
      this.cleanup();
    }, this.CLEANUP_FALLBACK_DELAY_MS);
  }

  private static setTimeoutUnref(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const handle = setTimeout(callback, ms);
    // Node.js timers support unref(), which avoids keeping the process alive in tests.
    if (
      typeof handle === 'object' &&
      handle !== null &&
      'unref' in handle &&
      typeof (handle as { unref?: unknown }).unref === 'function'
    ) {
      (handle as { unref: () => void }).unref();
    }
    return handle;
  }

  /**
   * Convert <img src> links in container to data URLs (best-effort)
   */
  private static async inlineImages(container: HTMLElement, signal?: AbortSignal): Promise<void> {
    const allImages = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
    const imgs = allImages.slice(0, MAX_EXPORT_IMAGE_COUNT);
    if (imgs.length === 0) return;
    const budget = { remainingBytes: MAX_EXPORT_IMAGE_TOTAL_BYTES };

    const toDataUrl = async (url: string): Promise<string | null> => {
      try {
        const fetched = await fetchBoundedExportImage(
          url,
          budget,
          signal,
          this.INLINE_FETCH_TIMEOUT_MS,
        );
        if (!fetched) return null;
        return await new Promise<string>((resolve, reject) => {
          try {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('readAsDataURL failed'));
            reader.onload = () => resolve(String(reader.result || ''));
            reader.readAsDataURL(fetched.blob);
          } catch (error) {
            reject(error);
          }
        });
      } catch {
        return null;
      }
    };

    await mapWithConcurrency(imgs, EXPORT_IMAGE_FETCH_CONCURRENCY, async (img) => {
      this.assertNotAborted(signal);
      let src = img.getAttribute('src') || '';
      if (
        (src.includes('googleusercontent.com') || src.includes('ggpht.com')) &&
        !src.startsWith('blob:')
      ) {
        const sizePattern = /=[swh]\d+[^?#]*/;
        src = sizePattern.test(src) ? src.replace(sizePattern, '=s0') : src + '=s0';
      }
      const data = await toDataUrl(src);
      if (data) img.src = data;
    });

    this.assertNotAborted(signal);
    type DecodableImage = HTMLImageElement & { decode?: () => Promise<void> };
    await Promise.all(
      imgs
        .filter((img) => img.isConnected)
        .map(async (img) => {
          const decode = (img as DecodableImage).decode;
          if (typeof decode !== 'function') return;

          try {
            await Promise.race([
              decode.call(img).catch(() => {
                /* ignore */
              }),
              this.delay(this.INLINE_DECODE_TIMEOUT_MS),
            ]);
          } catch {
            /* ignore */
          }
        }),
    );
  }

  /**
   * Cleanup print container and styles
   */
  private static cleanup(): void {
    if (this.cleanupFallbackTimer !== null) {
      try {
        clearTimeout(this.cleanupFallbackTimer);
      } catch {
        /* ignore */
      }
      this.cleanupFallbackTimer = null;
    }

    const container = document.getElementById(PDF_PRINT_CONTAINER_ID);
    if (container) {
      container.remove();
    }

    try {
      document.body.classList.remove(PDF_PRINT_BODY_CLASS);
    } catch {
      /* ignore */
    }

    if (this.originalDocumentTitle !== null) {
      try {
        document.title = this.originalDocumentTitle;
      } catch {
        /* ignore */
      }
      this.originalDocumentTitle = null;
    }

    // Keep styles for potential reuse
    // They don't affect screen display anyway

    // Notify other UI components (export button, folder manager) that printing ended.
    // Gemini may re-render parts of the DOM during print, removing plugin-injected elements.
    // This event gives them a chance to detect the loss and re-inject.
    try {
      window.dispatchEvent(new CustomEvent('gv-print-cleanup'));
    } catch {
      /* ignore */
    }
  }
}
