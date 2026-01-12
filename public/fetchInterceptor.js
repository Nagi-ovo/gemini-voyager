/**
 * Fetch Interceptor - Injected into MAIN world
 * 
 * This script runs in the page context (MAIN world) to intercept native fetch calls.
 * It catches Gemini download requests and modifies them to fetch the original resolution image
 * without watermark parameters.
 * 
 * The script respects the user's watermark remover setting and communicates with the
 * content script via CustomEvents for watermark removal processing.
 */

(function () {
    'use strict';

    // Prevent double injection
    if (window.__gvFetchInterceptorInstalled) {
        console.log('[Gemini Voyager] Fetch interceptor already installed, skipping');
        return;
    }
    window.__gvFetchInterceptorInstalled = true;

    console.log('[Gemini Voyager] Fetch interceptor loading (MAIN world)...');

    /**
     * Pattern to match Gemini download URLs
     * Matches both rd-gg and rd-gg-dl paths
     * Reference: /^https:\/\/lh3\.googleusercontent\.com\/rd-gg(?:-dl)?\/.+=s(?!0-d\?).* /
     * We use a slightly broader pattern to ensure we catch all download attempts
     */
    const GEMINI_DOWNLOAD_PATTERN = /^https:\/\/lh3\.googleusercontent\.com\/rd-gg(?:-dl)?\//;

    /**
     * Replace size parameter with =s0 for original size
     * Gemini uses =sNNN format for resized images, =s0 means original
     */
    const replaceWithOriginalSize = (src) => {
        // Match =sNNN and replace with =s0 (but keep the rest of the URL)
        return src.replace(/=s\d+(?=[-?#]|$)/, '=s0');
    };

    /**
     * Watermark remover state - updated via CustomEvent from content script
     * Using events instead of inline script to avoid CSP violations
     */
    let watermarkRemoverEnabled = false;

    // Listen for state updates from content script
    window.addEventListener('gv-watermark-state', (event) => {
        watermarkRemoverEnabled = event.detail?.enabled === true;
        console.log('[Gemini Voyager] Watermark remover state:', watermarkRemoverEnabled ? 'enabled' : 'disabled');
    });

    // Listen for state query responses (for initial sync)
    window.addEventListener('gv-watermark-state-response', (event) => {
        watermarkRemoverEnabled = event.detail?.enabled === true;
        console.log('[Gemini Voyager] Watermark remover state (from query):', watermarkRemoverEnabled ? 'enabled' : 'disabled');
    });

    // Request current state from content script (it may already be loaded)
    window.dispatchEvent(new CustomEvent('gv-watermark-state-query'));

    /**
     * Check if watermark remover is enabled
     */
    const isWatermarkRemoverEnabled = () => watermarkRemoverEnabled;

    // Store original fetch
    const originalFetch = window.fetch;

    // Intercept fetch
    window.fetch = async function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

        // Check if this is a Gemini download request (specifically rd-gg-dl for downloads)
        if (url && typeof url === 'string' && GEMINI_DOWNLOAD_PATTERN.test(url)) {
            console.log('[Gemini Voyager] Intercepting download request:', url);

            // Replace with original size URL
            const origSizeUrl = replaceWithOriginalSize(url);
            console.log('[Gemini Voyager] Using original size URL:', origSizeUrl);

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

            // Only process watermark removal if enabled
            if (isWatermarkRemoverEnabled()) {
                try {
                    // Fetch the original size image
                    const response = await originalFetch.apply(this, args);

                    if (!response.ok) {
                        return response;
                    }

                    // Clone response to read blob
                    const blob = await response.blob();

                    // Send blob to content script for watermark removal via custom event
                    const processedBlob = await new Promise((resolve, reject) => {
                        const requestId = 'gv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

                        // Listen for response from content script
                        const handler = (event) => {
                            if (event.detail?.requestId === requestId) {
                                window.removeEventListener('gv-processed-image', handler);
                                if (event.detail.error) {
                                    reject(new Error(event.detail.error));
                                } else {
                                    // Convert base64 back to blob
                                    fetch(event.detail.base64)
                                        .then(res => res.blob())
                                        .then(resolve)
                                        .catch(reject);
                                }
                            }
                        };
                        window.addEventListener('gv-processed-image', handler);

                        // Send request to content script (convert blob to base64 for transfer)
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            window.dispatchEvent(new CustomEvent('gv-process-image', {
                                detail: { requestId, base64: reader.result }
                            }));
                        };
                        reader.onerror = () => reject(new Error('Failed to read blob'));
                        reader.readAsDataURL(blob);

                        // Timeout after 30 seconds
                        setTimeout(() => {
                            window.removeEventListener('gv-processed-image', handler);
                            reject(new Error('Processing timeout'));
                        }, 30000);
                    });

                    console.log('[Gemini Voyager] Download processed successfully with watermark removal');

                    // Return processed response
                    return new Response(processedBlob, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                } catch (error) {
                    console.warn('[Gemini Voyager] Watermark processing failed, using original:', error);
                    // Fall through to return original fetch with modified URL
                }
            } else {
                console.log('[Gemini Voyager] Watermark remover disabled, downloading original size without processing');
            }
        }

        // Pass through (either non-matching requests or after URL modification)
        return originalFetch.apply(this, args);
    };

    console.log('[Gemini Voyager] Fetch interceptor installed (MAIN world)');
})();
