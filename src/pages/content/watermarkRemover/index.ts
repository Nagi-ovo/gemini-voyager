/**
 * Watermark Remover - Content Script Integration
 *
 * This module is based on gemini-watermark-remover by journey-ad (Jad).
 * Original: https://github.com/journey-ad/gemini-watermark-remover/blob/main/src/userscript/index.js
 * License: MIT - Copyright (c) 2025 Jad
 *
 * Automatically detects and removes watermarks from Gemini-generated images on the page.
 *
 * The fetch interceptor (running in MAIN world) handles download requests:
 * - Intercepts download requests and modifies URL to get original size
 * - Sends image data to this content script for watermark removal
 * - Returns processed image to complete the download
 */
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { getTranslationSync } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import { DOWNLOAD_ICON_SELECTOR, findNativeDownloadButton } from './downloadButton';
import { type StatusToastManager, createStatusToastManager } from './statusToast';
import { WatermarkEngine } from './watermarkEngine';

let engine: WatermarkEngine | null = null;
const processingQueue = new Set<HTMLImageElement>();

/**
 * Debounce function to limit execution frequency
 */
const debounce = <T extends (...args: unknown[]) => void>(func: T, wait: number): T => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
};

/**
 * Fetch image via background script to bypass CORS
 * The background script has host_permissions that allow cross-origin requests
 */
const fetchImageViaBackground = async (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'gv.fetchImage', url }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || !response.ok) {
        reject(new Error(response?.error || 'Failed to fetch image'));
        return;
      }

      // Create image from base64 data
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image'));
      // Set crossOrigin before src to prevent canvas tainting in Firefox
      img.crossOrigin = 'anonymous';
      img.src = `data:${response.contentType};base64,${response.base64}`;
    });
  });
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

/**
 * Convert canvas to base64 data URL
 */
const canvasToDataURL = (canvas: HTMLCanvasElement, type = 'image/png'): string =>
  canvas.toDataURL(type);

/**
 * Check if an image element is a valid Gemini-generated image
 */
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
 * Replace image URL size parameter to get full resolution
 */
const replaceWithNormalSize = (src: string): string => {
  // Use normal size image to fit watermark
  return src.replace(/=s\d+[^?#]*/, '=s0');
};

/**
 * Add a visual indicator (🍌) to the native download button
 * The click goes through to the native button, which triggers the fetch interceptor
 */
function addDownloadIndicator(imgElement: HTMLImageElement): void {
  const container = imgElement.closest('generated-image,.generated-image-container');
  if (!container) return;

  // Try to find Gemini's native download button area
  const nativeDownloadIcon = container.querySelector(DOWNLOAD_ICON_SELECTOR);
  const nativeButton = nativeDownloadIcon?.closest('button');

  if (!nativeButton) return;

  // Check if indicator already exists
  if (container.querySelector('.nanobanana-indicator')) return;

  // Create the banana indicator badge
  const indicator = document.createElement('span');
  indicator.className = 'nanobanana-indicator';
  indicator.textContent = '🍌';
  indicator.title =
    chrome.i18n.getMessage('nanobananaDownloadTooltip') ||
    'NanoBanana: Downloads will have watermark removed';

  // Style it as a small badge on the button
  Object.assign(indicator.style, {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    fontSize: '12px',
    pointerEvents: 'none', // Let clicks pass through to the native button
    zIndex: '10',
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
  });

  // Make the button container relative for absolute positioning
  const buttonContainer = nativeButton.parentElement;
  if (buttonContainer) {
    const currentPosition = getComputedStyle(buttonContainer).position;
    if (currentPosition === 'static') {
      (buttonContainer as HTMLElement).style.position = 'relative';
    }
    buttonContainer.appendChild(indicator);
  }
}

/**
 * Process a single image to remove watermark (for preview images)
 */
async function processImage(imgElement: HTMLImageElement): Promise<void> {
  if (!engine || processingQueue.has(imgElement)) return;

  processingQueue.add(imgElement);
  imgElement.dataset.watermarkProcessed = 'processing';

  const originalSrc = imgElement.src;
  try {
    // Fetch full resolution image via background script (bypasses CORS)
    const normalSizeSrc = replaceWithNormalSize(originalSrc);
    const normalSizeImg = await fetchImageViaBackground(normalSizeSrc);

    // Process image to remove watermark
    const processedCanvas = await engine.removeWatermarkFromImage(normalSizeImg);
    const processedBlob = await canvasToBlob(processedCanvas);

    // Replace image source with processed blob URL
    const processedUrl = URL.createObjectURL(processedBlob);
    imgElement.src = processedUrl;
    imgElement.dataset.watermarkProcessed = 'true';
    imgElement.dataset.processedUrl = processedUrl; // Store for reference

    console.log('[Gemini Voyager] Watermark removed from preview image');

    // Add indicator to download button
    addDownloadIndicator(imgElement);
  } catch (error) {
    console.warn('[Gemini Voyager] Failed to process image for watermark removal:', error);
    imgElement.dataset.watermarkProcessed = 'failed';
  } finally {
    processingQueue.delete(imgElement);
  }
}

/**
 * Process all Gemini-generated images on the page
 */
const processAllImages = (): void => {
  const images = findGeminiImages();
  images.forEach(processImage);

  // Also check existing processed images to see if they need an indicator
  // (e.g. if the native buttons loaded after the image was processed)
  const processedImages = document.querySelectorAll<HTMLImageElement>(
    'img[data-watermark-processed="true"]',
  );
  processedImages.forEach((img) => {
    addDownloadIndicator(img);
  });
};

/**
 * Setup MutationObserver to watch for new images
 */
const setupMutationObserver = (): void => {
  const debouncedProcess = debounce(processAllImages, 100);
  new MutationObserver(debouncedProcess).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true, // Watch for attribute changes (like native buttons appearing)
    attributeFilter: ['class', 'src'],
  });
  console.log('[Gemini Voyager] Watermark remover MutationObserver active');
};
/**
 * DOM-based communication bridge ID (must match fetchInterceptor.js)
 * CustomEvents don't cross world boundaries in Firefox, so we use a hidden DOM element
 */
const GV_BRIDGE_ID = 'gv-watermark-bridge';

function getBridgeElement(): HTMLElement {
  let bridge = document.getElementById(GV_BRIDGE_ID);
  if (!bridge) {
    bridge = document.createElement('div');
    bridge.id = GV_BRIDGE_ID;
    bridge.style.display = 'none';
    document.documentElement.appendChild(bridge);
  }
  return bridge;
}

/**
 * Notify the MAIN world fetch interceptor about watermark remover state
 * Uses DOM element to communicate across worlds (works in Firefox)
 */
function notifyFetchInterceptor(enabled: boolean): void {
  const bridge = getBridgeElement();
  bridge.dataset.enabled = String(enabled);
}

/**
 * Setup DOM-based bridge to handle image processing requests from MAIN world
 * Uses MutationObserver to watch for requests in the bridge element
 */
function setupFetchInterceptorBridge(): void {
  const bridge = getBridgeElement();

  // Watch for requests from MAIN world via MutationObserver
  const observer = new MutationObserver(async () => {
    const requestData = bridge.dataset.request;
    if (requestData) {
      bridge.removeAttribute('data-request');
      try {
        const { requestId, base64 } = JSON.parse(requestData);
        await processImageRequest(requestId, base64, bridge);
      } catch (e) {
        console.error('[Gemini Voyager] Failed to parse request:', e);
      }
    }
  });

  observer.observe(bridge, { attributes: true, attributeFilter: ['data-request'] });
  console.log('[Gemini Voyager] Fetch interceptor bridge ready');
}

/**
 * Process an image request from the fetch interceptor
 */
async function processImageRequest(
  requestId: string,
  base64: string,
  bridge: HTMLElement,
): Promise<void> {
  if (!engine) {
    bridge.dataset.response = JSON.stringify({
      requestId,
      error: 'Watermark engine not initialized',
    });
    return;
  }

  try {
    // Convert base64 to image element
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.crossOrigin = 'anonymous';
      img.src = base64;
    });

    // Process image to remove watermark
    const processedCanvas = await engine.removeWatermarkFromImage(img);
    const processedDataUrl = canvasToDataURL(processedCanvas);

    // Send response via bridge element
    bridge.dataset.response = JSON.stringify({ requestId, base64: processedDataUrl });
  } catch (error) {
    console.error('[Gemini Voyager] Failed to process image:', error);
    bridge.dataset.response = JSON.stringify({ requestId, error: String(error) });
  }
}

/**
 * Start the watermark remover
 */
export async function startWatermarkRemover(): Promise<void> {
  try {
    // Initialize bridge element first (so it exists when fetch interceptor loads)
    getBridgeElement();

    // Check if feature is enabled
    const result = await chrome.storage?.sync?.get({ geminiWatermarkRemoverEnabled: true });
    const isEnabled = result?.geminiWatermarkRemoverEnabled !== false;

    // Notify MAIN world fetch interceptor about state
    notifyFetchInterceptor(isEnabled);

    if (!isEnabled) {
      console.log('[Gemini Voyager] Watermark remover is disabled');
      return;
    }

    // Setup status listener for UI feedback ASAP (avoid missing early signals)
    setupStatusListener();
    setupDownloadButtonTracking();

    console.log('[Gemini Voyager] Initializing watermark remover...');
    engine = await WatermarkEngine.create();

    // Setup bridge to handle requests from fetch interceptor
    setupFetchInterceptorBridge();

    // Process preview images
    processAllImages();
    setupMutationObserver();

    console.log('[Gemini Voyager] Watermark remover ready');
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.error('[Gemini Voyager] Watermark remover initialization failed:', error);
  }
}

let statusToastManager: StatusToastManager | null = null;
let downloadTrackingReady = false;
let lastImmediateToastAt = 0;
let sequenceCounter = 0;

const LARGE_WARNING_AUTO_DISMISS_MS = 8000;
const PROCESSING_FALLBACK_AUTO_DISMISS_MS = 35000;

type DownloadToastSequence = {
  id: number;
  downloadToastId: string | null;
  warningToastId: string | null;
  processingToastId: string | null;
  processingTimer: ReturnType<typeof setTimeout> | null;
};

let activeSequence: DownloadToastSequence | null = null;

const getStatusToastManager = (): StatusToastManager => {
  if (!statusToastManager) {
    statusToastManager = createStatusToastManager({ maxToasts: 4, anchorTtlMs: 30000 });
  }
  return statusToastManager;
};

const t = (key: TranslationKey, fallback: string): string => {
  const value = getTranslationSync(key);
  return value === key ? fallback : value;
};

function showImmediateDownloadToast(button: HTMLButtonElement): void {
  const now = Date.now();
  if (now - lastImmediateToastAt < 300) return;
  lastImmediateToastAt = now;

  const manager = getStatusToastManager();
  manager.setAnchorElement(button);

  const downloadMessage = t('downloadingOriginal', '正在下载原始图片');
  const processingMessage = t('downloadProcessing', '正在处理水印中');

  if (activeSequence?.processingTimer) {
    clearTimeout(activeSequence.processingTimer);
  }

  const sequenceId = ++sequenceCounter;
  const downloadToastId = manager.addToast(downloadMessage, 'info', { autoDismissMs: 3000 });

  const processingTimer = setTimeout(() => {
    if (!activeSequence || activeSequence.id !== sequenceId) return;
    if (activeSequence.downloadToastId) {
      manager.removeToast(activeSequence.downloadToastId);
      activeSequence.downloadToastId = null;
    }
    if (!activeSequence.processingToastId) {
      activeSequence.processingToastId = manager.addToast(processingMessage, 'info', {
        pending: true,
        autoDismissMs: PROCESSING_FALLBACK_AUTO_DISMISS_MS,
      });
    }
  }, 3000);

  activeSequence = {
    id: sequenceId,
    downloadToastId,
    warningToastId: null,
    processingToastId: null,
    processingTimer,
  };
}

function setupDownloadButtonTracking(): void {
  if (downloadTrackingReady) return;
  downloadTrackingReady = true;

  const captureAnchor = (event: Event): void => {
    const button = findNativeDownloadButton(event.target);
    if (!button) return;
    showImmediateDownloadToast(button);
  };

  document.addEventListener('pointerdown', captureAnchor, true);
  document.addEventListener('click', captureAnchor, true);
}

/**
 * Setup listener for status events from fetchInterceptor
 */
function setupStatusListener(): void {
  const bridge = getBridgeElement();
  const manager = getStatusToastManager();
  const downloadMessage = t('downloadingOriginal', '正在下载原始图片');
  const downloadLargeMessage = t('downloadingOriginalLarge', '正在下载原始图片（大文件）');
  const warningMessage = t('downloadLargeWarning', '大文件警告');
  const processingMessage = t('downloadProcessing', '正在处理水印中');
  const successMessage = t('downloadSuccess', '正在下载');
  const errorPrefix = t('downloadError', '失败');

  const finalizeSequence = (level: 'success' | 'error', message: string): void => {
    if (activeSequence?.processingTimer) {
      clearTimeout(activeSequence.processingTimer);
      activeSequence.processingTimer = null;
    }
    if (activeSequence?.warningToastId) {
      manager.removeToast(activeSequence.warningToastId);
      activeSequence.warningToastId = null;
    }
    if (activeSequence?.downloadToastId) {
      manager.removeToast(activeSequence.downloadToastId);
      activeSequence.downloadToastId = null;
    }

    if (
      activeSequence?.processingToastId &&
      manager.updateToast(activeSequence.processingToastId, message, level, {
        autoDismissMs: level === 'success' ? 2500 : 4000,
        markFinal: true,
      })
    ) {
      return;
    }

    if (
      !manager.updateLatestPending(message, level, {
        autoDismissMs: level === 'success' ? 2500 : 4000,
        markFinal: true,
      })
    ) {
      manager.addToast(message, level, {
        autoDismissMs: level === 'success' ? 2500 : 4000,
      });
    }
  };

  const handleStatus = (statusData: string): void => {
    console.log('[Gemini Voyager] Status data received:', statusData);
    if (!statusData) return;

    try {
      const { type, message } = JSON.parse(statusData);
      bridge.removeAttribute('data-status');

      switch (type) {
        case 'DOWNLOADING':
          // Step 1: Downloading original image
          if (activeSequence) {
            if (activeSequence.warningToastId) {
              manager.removeToast(activeSequence.warningToastId);
              activeSequence.warningToastId = null;
            }
            if (!activeSequence.downloadToastId) {
              activeSequence.downloadToastId = manager.addToast(downloadMessage, 'info', {
                autoDismissMs: 3000,
              });
            }
          }
          break;
        case 'DOWNLOADING_LARGE':
          // Step 1 with large file warning
          if (activeSequence) {
            if (!activeSequence.downloadToastId) {
              activeSequence.downloadToastId = manager.addToast(downloadLargeMessage, 'info', {
                autoDismissMs: 3000,
              });
            } else {
              manager.updateToast(activeSequence.downloadToastId, downloadLargeMessage, 'info');
            }
            if (!activeSequence.warningToastId) {
              activeSequence.warningToastId = manager.addToast(warningMessage, 'warning', {
                autoDismissMs: LARGE_WARNING_AUTO_DISMISS_MS,
              });
            }
          }
          break;
        case 'PROCESSING':
          // Step 2: Processing watermark
          if (activeSequence?.processingToastId) {
            manager.updateToast(activeSequence.processingToastId, processingMessage, 'info');
            break;
          }
          if (!activeSequence?.processingTimer) {
            const processingToastId = manager.addToast(processingMessage, 'info', {
              pending: true,
              autoDismissMs: PROCESSING_FALLBACK_AUTO_DISMISS_MS,
            });
            if (activeSequence) activeSequence.processingToastId = processingToastId;
          }
          break;
        case 'SUCCESS':
          // Step 3: Done, auto-dismiss after 2s
          finalizeSequence('success', successMessage);
          break;
        case 'ERROR':
          finalizeSequence('error', `${errorPrefix}: ${message}`);
          break;
      }
    } catch (e) {
      console.error('[Gemini Voyager] Failed to parse status:', e);
    }
  };

  const observer = new MutationObserver(() => {
    const statusData = bridge.dataset.status;
    if (!statusData) return;
    handleStatus(statusData);
  });

  observer.observe(bridge, { attributes: true, attributeFilter: ['data-status'] });
  if (bridge.dataset.status) {
    handleStatus(bridge.dataset.status);
  }
}
