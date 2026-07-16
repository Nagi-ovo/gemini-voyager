import browser from 'webextension-polyfill';

export type RuntimeImageFetchMessageType = 'gv.fetchImage' | 'gv.fetchImageViaPage';

export interface RuntimeImageData {
  base64: string;
  contentType: string;
}

interface RuntimeImageResponse {
  ok?: boolean;
  base64?: unknown;
  contentType?: unknown;
}

async function sendRuntimeImageRequest(
  type: RuntimeImageFetchMessageType,
  url: string,
): Promise<RuntimeImageData | null> {
  try {
    const response = (await browser.runtime.sendMessage({ type, url })) as RuntimeImageResponse;
    if (response?.ok !== true || typeof response.base64 !== 'string') return null;
    return {
      base64: response.base64,
      contentType:
        typeof response.contentType === 'string' && response.contentType
          ? response.contentType
          : 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

/**
 * Fetch authenticated page images through the extension. The background fetch
 * is fastest when host permissions are sufficient; MAIN-world fetch is the
 * Safari/Firefox fallback because it shares the page's Google session.
 */
export async function fetchImageViaExtensionRuntime(url: string): Promise<RuntimeImageData | null> {
  const backgroundResult = await sendRuntimeImageRequest('gv.fetchImage', url);
  if (backgroundResult) return backgroundResult;
  if (url.startsWith('blob:')) return null;
  return await sendRuntimeImageRequest('gv.fetchImageViaPage', url);
}
