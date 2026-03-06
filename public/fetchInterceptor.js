/**
 * Fetch Interceptor - Injected into MAIN world
 *
 * This script runs in the page context (MAIN world) to intercept native fetch calls.
 * It catches Gemini download requests and modifies them to fetch the original resolution image
 * without watermark parameters.
 *
 * The script respects the user's watermark remover setting and communicates with the
 * content script via DOM-based bridge for watermark removal processing.
 * (CustomEvents don't cross world boundaries in Firefox, so we use a hidden DOM element)
 */

(function () {
  'use strict';

  /** Timeout for watermark processing in milliseconds */
  const WATERMARK_PROCESSING_TIMEOUT_MS = 30000;

  // Prevent double injection
  if (window.__gvFetchInterceptorInstalled) {
    console.log('[Gemini Voyager] Fetch interceptor already installed, skipping');
    return;
  }
  window.__gvFetchInterceptorInstalled = true;

  console.log('[Gemini Voyager] Fetch interceptor loading (MAIN world)...');

  /**
   * Pattern to match Gemini download URLs
   * Only matches rd-gg-dl paths (dl = download) to avoid intercepting normal image display
   * Matches both googleusercontent.com and ggpht.com domains
   */
  const GEMINI_DOWNLOAD_PATTERN =
    /https:\/\/[^/]+(\.googleusercontent\.com|\.ggpht\.com)\/rd-gg-dl\//;
  const CSP_BLOCKED_TELEMETRY_PATTERNS = [/^https:\/\/www\.googletagmanager\.com\/td\?/i];
  const GOOGLE_SIZE_PATTERN = /=[swh]\d+[^?#]*/;

  /**
   * Replace size parameter with =s0 for original size
   * Gemini uses =sNNN format for resized images, =s0 means original
   */
  const replaceWithOriginalSize = (src) => {
    // Match common Google size patterns and replace with =s0 (but keep the rest of the URL)
    if (GOOGLE_SIZE_PATTERN.test(src)) {
      return src.replace(GOOGLE_SIZE_PATTERN, '=s0');
    }
    // Fallback: if no size param but it's a google image, append =s0
    return src.includes('=') ? src + '-s0' : src + '=s0';
  };

  const isKnownCspBlockedTelemetryRequest = (requestUrl) =>
    CSP_BLOCKED_TELEMETRY_PATTERNS.some((pattern) => pattern.test(requestUrl));

  /**
   * DOM-based communication bridge
   * CustomEvents don't cross world boundaries in Firefox, so we use a hidden DOM element
   */
  const GV_BRIDGE_ID = 'gv-watermark-bridge';

  const getBridgeElement = () => {
    let bridge = document.getElementById(GV_BRIDGE_ID);
    if (!bridge) {
      bridge = document.createElement('div');
      bridge.id = GV_BRIDGE_ID;
      bridge.style.display = 'none';
      document.documentElement.appendChild(bridge);
    }
    return bridge;
  };

  /**
   * Update status on the bridge for the content script to pick up (and show Toasts)
   */
  const updateStatus = (status, details = {}) => {
    const bridge = getBridgeElement();
    if (bridge) {
      bridge.dataset.status = JSON.stringify({
        type: status, // 'START', 'PROGRESS', 'SUCCESS', 'ERROR', 'WARNING'
        timestamp: Date.now(),
        ...details,
      });
    }
  };

  /**
   * Check if watermark remover is enabled by reading from bridge element
   */
  const isWatermarkRemoverEnabled = () => {
    const bridge = getBridgeElement();
    return bridge.dataset.enabled === 'true';
  };

  // Store original fetch
  const originalFetch = window.fetch;

  // Intercept fetch
  // IMPORTANT: This must be a regular function (NOT async) to preserve the original Promise
  // chain for passthrough requests. An async function always wraps the return value in a new
  // Promise, which breaks Angular's zone.js change detection and causes link-block elements
  // to render with empty href attributes.
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

    // Gemini page regularly triggers GTM telemetry requests that are blocked by page CSP.
    // Since this interceptor wraps window.fetch in MAIN world, those blocked requests get
    // attributed to this extension in chrome://extensions. Short-circuit known blocked
    // telemetry endpoints to avoid noisy extension error reports.
    if (url && typeof url === 'string' && isKnownCspBlockedTelemetryRequest(url)) {
      return Promise.resolve(new Response(null, { status: 204, statusText: 'No Content' }));
    }

    // Check if this is a Gemini download request (specifically rd-gg-dl for downloads)
    if (url && typeof url === 'string' && GEMINI_DOWNLOAD_PATTERN.test(url)) {
      // Replace with original size URL
      const origSizeUrl = replaceWithOriginalSize(url);

      // Modify the request to use original size
      if (typeof args[0] === 'string') {
        args[0] = origSizeUrl;
      } else if (args[0]?.url) {
        // For Request objects, we need to create a new one with the modified URL
        const init = args[1] || {};
        args[0] = new Request(origSizeUrl, {
          ...init,
          method: args[0].method,
          headers: args[0].headers,
          body: args[0].body,
          mode: args[0].mode,
          credentials: args[0].credentials,
          cache: args[0].cache,
          redirect: args[0].redirect,
          referrer: args[0].referrer,
          integrity: args[0].integrity,
        });
      }

      // Only process watermark removal if enabled — use async IIFE only for this path
      if (isWatermarkRemoverEnabled()) {
        return (async () => {
          console.log('[Gemini Voyager] Intercepting download for watermark removal');

          // Declare response and blob outside try block so they're accessible in catch
          let response, blob;

          try {
            // Check content length first (via HEAD request) to show appropriate message
            // But we'll just show "downloading" first and update if large
            updateStatus('DOWNLOADING');

            // Fetch the original size image
            response = await originalFetch.apply(this, args);

            if (!response.ok) {
              updateStatus('ERROR', { message: `HTTP Error: ${response.status}` });
              return response;
            }

            // Check content length for large files (5MB) - update status
            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
              updateStatus('DOWNLOADING_LARGE');
            }

            // Clone response to read blob
            blob = await response.blob();

            // Step 2: Processing
            updateStatus('PROCESSING');

            // Send blob to content script for watermark removal via DOM bridge
            const processedBlob = await new Promise((resolve, reject) => {
              const requestId = 'gv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              const bridge = getBridgeElement();

              // Watch for response via MutationObserver (works across worlds in Firefox)
              const observer = new MutationObserver(() => {
                const response = bridge.dataset.response;
                if (response) {
                  try {
                    const data = JSON.parse(response);
                    if (data.requestId === requestId) {
                      observer.disconnect();
                      bridge.removeAttribute('data-response');

                      if (data.error) reject(new Error(data.error));
                      else
                        fetch(data.base64)
                          .then((r) => r.blob())
                          .then(resolve)
                          .catch(reject);
                    }
                  } catch (e) {
                    console.warn('[Gemini Voyager] Failed to parse bridge response:', e);
                  }
                }
              });
              observer.observe(bridge, { attributes: true, attributeFilter: ['data-response'] });

              // Send request via DOM bridge
              const reader = new FileReader();
              reader.onloadend = () => {
                bridge.dataset.request = JSON.stringify({ requestId, base64: reader.result });
              };
              reader.onerror = () => reject(new Error('Failed to read blob'));
              reader.readAsDataURL(blob);

              // Timeout for watermark processing
              setTimeout(() => {
                observer.disconnect();
                reject(new Error('Processing timeout'));
              }, WATERMARK_PROCESSING_TIMEOUT_MS);
            });

            updateStatus('SUCCESS');

            // Return processed response
            return new Response(processedBlob, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          } catch (error) {
            console.warn('[Gemini Voyager] Watermark processing failed, using original:', error);
            updateStatus('ERROR', { message: error.message || 'Unknown error' });
            // Return the original blob if available, otherwise fall through to originalFetch
            if (blob && response) {
              return new Response(blob, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              });
            }
            // If blob/response not available (error before fetch completed), fall through
            return originalFetch.apply(this, args);
          }
        })();
      }
    }

    // Pass through: return the ORIGINAL Promise directly (no async wrapping)
    return originalFetch.apply(this, args);
  };

  console.log('[Gemini Voyager] Fetch interceptor active');
})();
