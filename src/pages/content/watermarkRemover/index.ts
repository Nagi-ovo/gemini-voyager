/**
 * Watermark Remover - Content Script Integration
 *
 * This module is based on gemini-watermark-remover by journey-ad (Jad),
 * itself based on GeminiWatermarkTool by AllenK (Kwyshell).
 * Original: https://github.com/journey-ad/gemini-watermark-remover/blob/main/src/userscript/index.js
 * License: MIT - Copyright (c) 2025 Jad; Copyright (c) 2024 AllenK (Kwyshell)
 * Full retained notice: see /THIRD_PARTY_NOTICES.md
 *
 * Automatically detects and removes watermarks from Gemini-generated images on the page.
 *
 * The fetch interceptor (running in MAIN world) handles download requests:
 * - Intercepts download requests and modifies URL to get original size
 * - Sends image data to this content script for watermark removal
 * - Returns processed image to complete the download
 */
import { logger } from '@/core/services/LoggerService';
import { createToaster } from '@/core/ui/toast/toaster';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { fetchImageViaExtensionRuntime } from '@/core/utils/runtimeImageFetch';
import { WATERMARK_STORAGE_KEYS, resolveWatermarkSettings } from '@/core/utils/watermarkSettings';

import { recordWatermarkPresence } from '../watermarkNativeNotice/cleanStreak';
import { createDownloadFeedback } from './downloadFeedback';
import { createImageHealthMonitor } from './imageHealth';
import { createWatermarkPreviews } from './previewRuntime';
import { WatermarkEngine } from './watermarkEngine';

let engine: WatermarkEngine | null = null;
let enginePromise: Promise<WatermarkEngine> | null = null;
let lifecycleGeneration = 0;
let downloadRemovalEnabled = false;
let previewRemovalEnabled = false;

let bridgeObserver: MutationObserver | null = null;

/**
 * Fetch image via background script to bypass CORS
 * The background script has host_permissions that allow cross-origin requests
 */
const fetchImageViaBackground = async (url: string): Promise<HTMLImageElement> => {
  const response = await fetchImageViaExtensionRuntime(url);
  if (!response) throw new Error('Failed to fetch image');

  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    // Set crossOrigin before src to prevent canvas tainting in Firefox.
    img.crossOrigin = 'anonymous';
    img.src = `data:${response.contentType};base64,${response.base64}`;
  });
};

const health = createImageHealthMonitor(fetchImageViaBackground);
const feedback = createDownloadFeedback({
  getBridge: getBridgeElement,
  capturePreview: health.capturePreview,
  toaster: createToaster(),
  isRemovalEnabled: () => downloadRemovalEnabled,
});
const previews = createWatermarkPreviews({
  getState: () => ({
    engine,
    generation: lifecycleGeneration,
    previewEnabled: previewRemovalEnabled,
    downloadEnabled: downloadRemovalEnabled,
  }),
  fetchImage: fetchImageViaBackground,
  health,
});

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
  if (bridgeObserver) return;
  const bridge = getBridgeElement();

  // Watch for requests from MAIN world via MutationObserver
  bridgeObserver = new MutationObserver(async () => {
    const requestData = bridge.dataset.request;
    if (requestData) {
      bridge.removeAttribute('data-request');
      try {
        const { requestId, base64, mode, intentToken } = JSON.parse(requestData);
        if (mode === 'inspect') {
          await inspectImageRequest(intentToken, base64, bridge);
        } else {
          await processImageRequest(requestId, base64, bridge, intentToken);
        }
      } catch (e) {
        console.error('[Gemini Voyager] Failed to parse request:', e);
      }
    }
  });

  bridgeObserver.observe(bridge, { attributes: true, attributeFilter: ['data-request'] });
  logger.debug('[Gemini Voyager] Fetch interceptor bridge ready');
}

const loadBridgeImage = async (base64: string): Promise<HTMLImageElement> => {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.crossOrigin = 'anonymous';
    img.src = base64;
  });
  return img;
};

async function inspectImageRequest(
  intentToken: string | undefined,
  base64: string,
  bridge: HTMLElement,
): Promise<void> {
  if (!intentToken) return;
  const previewFingerprintPromise = feedback.takePreview(intentToken);
  if (!previewFingerprintPromise) return;

  try {
    const previewFingerprint = await previewFingerprintPromise;
    if (!previewFingerprint) return;
    const image = await loadBridgeImage(base64);
    const result = health.compare(previewFingerprint, image);
    if (result?.corrupted) {
      bridge.dataset.status = JSON.stringify({
        type: 'GOOGLE_IMAGE_CORRUPTED',
        timestamp: Date.now(),
        intentToken,
        reason: result.reason,
      });
    }
  } catch (error) {
    console.warn('[Gemini Voyager] Failed to inspect downloaded image:', error);
  }
}

/**
 * Process an image request from the fetch interceptor
 */
async function processImageRequest(
  requestId: string,
  base64: string,
  bridge: HTMLElement,
  intentToken?: string,
): Promise<void> {
  // Engine init is async (loads two PNG assets). The bridge observer is
  // installed BEFORE the await on engine creation, so requests can land here
  // before the engine is ready — queue on enginePromise instead of failing
  // fast (otherwise users who click download right after the content script
  // re-injects, e.g. after a /u/0/ → /u/1/ account switch, see the toast
  // stuck for ~30s while the MAIN-world interceptor times out).
  if (!engine && enginePromise) {
    try {
      await enginePromise;
    } catch {
      // engine init failed — fall through to the "not initialized" path
    }
  }
  if (!engine) {
    bridge.dataset.response = JSON.stringify({
      requestId,
      error: 'Watermark engine not initialized',
    });
    return;
  }

  try {
    const img = await loadBridgeImage(base64);
    const previewFingerprintPromise = intentToken ? feedback.takePreview(intentToken) : undefined;
    const previewFingerprint = previewFingerprintPromise ? await previewFingerprintPromise : null;
    const healthResult = previewFingerprint ? health.compare(previewFingerprint, img) : null;

    // Process image to remove watermark
    const processedCanvas = await engine.removeWatermarkFromImage(
      img,
      (presence) => void recordWatermarkPresence(presence),
    );
    const processedDataUrl = processedCanvas.toDataURL('image/png');

    // Send response via bridge element
    bridge.dataset.response = JSON.stringify({
      requestId,
      base64: processedDataUrl,
      corrupted: healthResult?.corrupted === true,
    });
  } catch (error) {
    console.error('[Gemini Voyager] Failed to process image:', error);
    bridge.dataset.response = JSON.stringify({ requestId, error: String(error) });
  }
}

/**
 * Read the latest settings and configure the watermark runtime.
 * Reconfiguration tears down preview work every time, but keeps an unchanged
 * download runtime alive so an in-flight native download cannot lose its
 * bridge request, intent, or feedback sequence.
 */
async function configureWatermarkRemover(reconfigure: boolean): Promise<void> {
  const generation = ++lifecycleGeneration;

  try {
    // Initialize bridge element first (so it exists when fetch interceptor loads)
    getBridgeElement();

    // Resolve the two split flags (with legacy fallback)
    const result = await chrome.storage?.sync?.get([...WATERMARK_STORAGE_KEYS]);
    const { download: downloadEnabled, preview: previewEnabled } = resolveWatermarkSettings(
      result ?? null,
    );
    if (generation !== lifecycleGeneration) return;

    if (reconfigure) {
      teardownWatermarkRemover(downloadRemovalEnabled && downloadEnabled);
    }

    downloadRemovalEnabled = downloadEnabled;
    previewRemovalEnabled = previewEnabled;
    notifyFetchInterceptor(downloadEnabled);

    // Download health inspection is independent of watermark removal. Keep
    // the click intent, bridge, and warning listener alive even when both
    // removal modes are off; Gemini's native response stays untouched.
    feedback.start();
    setupFetchInterceptorBridge();

    if (!downloadEnabled && !previewEnabled) {
      logger.debug('[Gemini Voyager] Watermark remover is disabled');
      return;
    }

    logger.debug(
      `[Gemini Voyager] Initializing watermark remover (download=${downloadEnabled}, preview=${previewEnabled})`,
    );

    if (downloadEnabled) {
      // The indicator is only a readiness cue; downloads already queue through
      // the bridge while the engine assets load. Show it immediately and watch
      // for buttons Gemini mounts during that loading window.
      previews.watchIndicators();
    }

    if (!enginePromise) {
      enginePromise = WatermarkEngine.create();
    }
    const initializedEngine = engine ?? (await enginePromise);
    if (generation !== lifecycleGeneration) return;
    engine = initializedEngine;

    if (previewEnabled) {
      previews.start();
    }

    logger.debug('[Gemini Voyager] Watermark remover ready');
  } catch (error) {
    if (!engine) enginePromise = null;
    if (generation !== lifecycleGeneration) return;
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.error('[Gemini Voyager] Watermark remover initialization failed:', error);
  }
}

/**
 * Start the watermark remover.
 */
export function startWatermarkRemover(): Promise<void> {
  return configureWatermarkRemover(false);
}

/**
 * Re-read storage and apply the latest watermark mode to the current page.
 * The shared generation guard makes rapid restarts
 * latest-wins even while the engine is still loading.
 */
export async function restartWatermarkRemover(): Promise<void> {
  await configureWatermarkRemover(true);
}

/**
 * Tear down preview work and, unless it is unchanged and still enabled, the
 * download runtime. Keeping download state is what makes preview-only toggles
 * safe while a native download is already in progress.
 */
function teardownWatermarkRemover(preserveDownloadRuntime: boolean): void {
  const keepDownloadRuntime = preserveDownloadRuntime && downloadRemovalEnabled;
  previewRemovalEnabled = false;

  previews.stop();

  if (keepDownloadRuntime) return;

  downloadRemovalEnabled = false;
  bridgeObserver?.disconnect();
  bridgeObserver = null;
  feedback.stop();

  // Tell the MAIN-world fetch interceptor watermark mutation is off. It may
  // still clone a user-initiated native download for the read-only health check.
  // Only if the bridge already exists — don't create one just to disable it
  // (stop runs on every page's beforeunload, including where it never started).
  const existingBridge = document.getElementById(GV_BRIDGE_ID);
  if (existingBridge) {
    existingBridge.dataset.enabled = 'false';
    existingBridge.removeAttribute('data-download-intent-expires-at');
    existingBridge.removeAttribute('data-download-intent-token');
  }

  document
    .querySelectorAll<HTMLElement>('.nanobanana-indicator')
    .forEach((indicator) => indicator.remove());
}

/**
 * Fully tear down the watermark remover. Safe to call when nothing was started.
 * Wired into the content-script beforeunload teardown so document observers,
 * the MAIN-world bridge, and global listeners cannot outlive the page.
 */
export function stopWatermarkRemover(): void {
  lifecycleGeneration += 1;
  teardownWatermarkRemover(false);
}
