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
import { fetchImageViaExtensionRuntime } from '@/core/utils/runtimeImageFetch';

import { recordWatermarkPresence } from '../watermarkNativeNotice/cleanStreak';
import { createDownloadFeedback } from './downloadFeedback';
import { createImageHealthMonitor } from './imageHealth';
import { createWatermarkPreviews } from './previewRuntime';
import { WatermarkEngine } from './watermarkEngine';

let engine: WatermarkEngine | null = null;
let enginePromise: Promise<WatermarkEngine> | null = null;
let lifecycleGeneration = 0;
let healthGeneration = 0;
let downloadRemovalEnabled = false;
let previewRemovalEnabled = false;

let bridgeObserver: MutationObserver | null = null;
const healthOwners = new Set<symbol>();
const controlOwners = { download: new Set<symbol>(), preview: new Set<symbol>() };

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
  const generation = healthGeneration;
  const previewFingerprintPromise = feedback.takePreview(intentToken);
  if (!previewFingerprintPromise) return;

  try {
    const previewFingerprint = await previewFingerprintPromise;
    if (!previewFingerprint) return;
    const image = await loadBridgeImage(base64);
    if (generation !== healthGeneration) return;
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
  const generation = healthGeneration;
  // A content-script handoff must still answer accepted downloads; only health side effects retire.
  let downloadEngine: WatermarkEngine;
  try {
    const acceptedEngine = engine ?? (await enginePromise);
    if (!acceptedEngine) throw new Error('Watermark engine not initialized');
    downloadEngine = acceptedEngine;
  } catch (error) {
    bridge.dataset.response = JSON.stringify({ requestId, error: String(error) });
    return;
  }

  try {
    const img = await loadBridgeImage(base64);
    const previewFingerprintPromise =
      generation === healthGeneration && intentToken
        ? feedback.takePreview(intentToken)
        : undefined;
    const previewFingerprint = previewFingerprintPromise ? await previewFingerprintPromise : null;
    const healthResult =
      generation === healthGeneration && previewFingerprint
        ? health.compare(previewFingerprint, img)
        : null;

    // Process image to remove watermark
    const processedCanvas = await downloadEngine.removeWatermarkFromImage(img, (presence) => {
      if (generation === healthGeneration) void recordWatermarkPresence(presence);
    });
    const processedDataUrl = processedCanvas.toDataURL('image/png');

    // Send response via bridge element
    bridge.dataset.response = JSON.stringify({
      requestId,
      base64: processedDataUrl,
      corrupted: generation === healthGeneration && healthResult?.corrupted === true,
    });
  } catch (error) {
    console.error('[Gemini Voyager] Failed to process image:', error);
    bridge.dataset.response = JSON.stringify({ requestId, error: String(error) });
  }
}

/** The engine is mode-independent; retiring a control never cancels its load. */
function ensureEngine(): Promise<WatermarkEngine> {
  if (engine) return Promise.resolve(engine);
  if (!enginePromise) {
    enginePromise = WatermarkEngine.create().then(
      (loaded) => {
        engine = loaded;
        return loaded;
      },
      (error: unknown) => {
        enginePromise = null;
        throw error;
      },
    );
  }
  return enginePromise;
}

/**
 * Core image-health inspection owns the bridge independently of both plugins.
 * Keep it mounted at the native start point so accepted downloads can finish
 * after download removal is disabled, without duplicating the native request.
 */
export function startWatermarkImageHealth(): () => void {
  const owner = Symbol('watermark-image-health');
  if (healthOwners.size === 0) healthGeneration += 1;
  healthOwners.add(owner);
  notifyFetchInterceptor(downloadRemovalEnabled);
  feedback.start();
  setupFetchInterceptorBridge();
  return () => {
    if (!healthOwners.delete(owner) || healthOwners.size > 0) return;
    healthGeneration += 1;
    bridgeObserver?.disconnect();
    bridgeObserver = null;
    feedback.stop();
    const bridge = document.getElementById(GV_BRIDGE_ID);
    if (bridge) {
      bridge.dataset.enabled = 'false';
      bridge.removeAttribute('data-download-intent-expires-at');
      bridge.removeAttribute('data-download-intent-token');
    }
  };
}

/**
 * Acquire one independent plugin control. Scope cleanup changes admission for
 * future work synchronously; it does not cancel a download already accepted by
 * MAIN. That pipeline is a one-shot sequential promise, not an interruptible
 * state machine: tying its phases to the plugin scope would discard its response.
 */
export function acquireWatermarkControl(mode: 'download' | 'preview'): () => void {
  const owners = controlOwners[mode];
  const owner = Symbol(`watermark-${mode}`);
  owners.add(owner);
  if (owners.size === 1) {
    if (mode === 'download') {
      downloadRemovalEnabled = true;
      notifyFetchInterceptor(true);
      previews.watchIndicators();
    } else {
      previewRemovalEnabled = true;
      lifecycleGeneration += 1;
    }
    const generation = lifecycleGeneration;
    void ensureEngine().then(
      () => {
        if (mode === 'preview' && previewRemovalEnabled && generation === lifecycleGeneration) {
          previews.start();
        }
      },
      (error: unknown) => {
        logger.error('[Gemini Voyager] Watermark engine initialization failed', { error });
      },
    );
  }
  return () => {
    if (!owners.delete(owner) || owners.size > 0) return;
    if (mode === 'download') {
      // MAIN wrappers cannot be removed. Every new request consults this flag.
      downloadRemovalEnabled = false;
      notifyFetchInterceptor(false);
      previews.stopIndicators();
    } else {
      previewRemovalEnabled = false;
      lifecycleGeneration += 1;
      previews.stopPreviews();
    }
  };
}
