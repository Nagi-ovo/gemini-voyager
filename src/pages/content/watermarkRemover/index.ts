/**
 * Watermark Remover - Content Script Integration
 *
 * This module is based on gemini-watermark-remover by journey-ad (Jad).
 * Original: https://github.com/journey-ad/gemini-watermark-remover/blob/main/src/userscript/index.js
 * License: MIT - Copyright (c) 2025 Jad
 *
 * Automatically detects and removes watermarks from Gemini-generated images on the page.
 */

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
 * Check if an image element is a valid Gemini-generated image
 */
const isValidGeminiImage = (img: HTMLImageElement): boolean =>
    img.closest('generated-image,.generated-image-container') !== null;

/**
 * Find all Gemini-generated images on the page
 */
const findGeminiImages = (): HTMLImageElement[] =>
    [...document.querySelectorAll<HTMLImageElement>('img[src*="googleusercontent.com"]')].filter(
        (img) => isValidGeminiImage(img) && img.dataset.watermarkProcessed !== 'true'
    );

/**
 * Replace image URL size parameter to get full resolution
 */
const replaceWithNormalSize = (src: string): string => {
    // Use normal size image to fit watermark
    return src.replace(/=s\d+(?=[-?#]|$)/, '=s0');
};

/**
 * Add a direct download button for the unwatermarked image
 * Completely replaces the native download button
 */
function addDownloadButton(imgElement: HTMLImageElement, processedUrl: string): void {
    const container = imgElement.closest('generated-image,.generated-image-container');
    if (!container) return;

    // Try to find Gemini's native download button area
    const nativeDownloadIcon = container.querySelector('mat-icon[fonticon="download"], .google-symbols[data-mat-icon-name="download"]');
    const nativeButton = nativeDownloadIcon?.closest('button');

    if (!nativeButton) return;

    // Check if our button already exists
    if (container.querySelector('.nanobanana-download-btn')) return;

    // Hide native button instead of removing it (safer for Angular apps)
    (nativeButton as HTMLElement).style.display = 'none';

    // Create our banana button
    const bananaBtn = document.createElement('button');
    bananaBtn.className = 'nanobanana-download-btn';
    bananaBtn.innerHTML = '🍌';
    bananaBtn.title = chrome.i18n.getMessage('nanobananaDownloadTooltip') || 'Download unwatermarked image (NanoBanana)';

    // Style it to match Gemini's UI feel (circular, semi-transparent background)
    Object.assign(bananaBtn.style, {
        background: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        border: 'none',
        borderRadius: '50%',
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: '18px',
        transition: 'background 0.2s, transform 0.1s',
        zIndex: '10',
        padding: '0'
    });

    bananaBtn.onmouseenter = () => {
        bananaBtn.style.background = 'rgba(0, 0, 0, 0.7)';
        bananaBtn.style.transform = 'scale(1.1)';
    };
    bananaBtn.onmouseleave = () => {
        bananaBtn.style.background = 'rgba(0, 0, 0, 0.5)';
        bananaBtn.style.transform = 'scale(1.0)';
    };

    bananaBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const a = document.createElement('a');
        a.href = processedUrl;
        a.download = `gemini-voyager-nanobanana-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // Insert next to the native button (which is hidden)
    nativeButton.parentNode?.insertBefore(bananaBtn, nativeButton);
}

/**
 * Process a single image to remove watermark
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
        imgElement.dataset.processedUrl = processedUrl; // Store for the button

        console.log('[Gemini Voyager] Watermark removed from image');

        // Add download button
        addDownloadButton(imgElement, processedUrl);
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

    // Also check existing processed images to see if they need a button 
    // (e.g. if the native buttons loaded after the image was processed)
    const processedImages = document.querySelectorAll<HTMLImageElement>('img[data-watermark-processed="true"]');
    processedImages.forEach(img => {
        if (img.dataset.processedUrl) {
            addDownloadButton(img, img.dataset.processedUrl);
        }
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
        attributeFilter: ['class', 'src']
    });
    console.log('[Gemini Voyager] Watermark remover MutationObserver active');
};

/**
 * Start the watermark remover
 */
export async function startWatermarkRemover(): Promise<void> {
    try {
        // Check if feature is enabled
        const result = await chrome.storage?.sync?.get({ geminiWatermarkRemoverEnabled: true });
        if (result?.geminiWatermarkRemoverEnabled === false) {
            console.log('[Gemini Voyager] Watermark remover is disabled');
            return;
        }

        console.log('[Gemini Voyager] Initializing watermark remover...');
        engine = await WatermarkEngine.create();

        processAllImages();
        setupMutationObserver();

        console.log('[Gemini Voyager] Watermark remover ready');
    } catch (error) {
        console.error('[Gemini Voyager] Watermark remover initialization failed:', error);
    }
}
