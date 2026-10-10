import {
  MAX_RUNTIME_IMAGE_BYTES,
  RUNTIME_IMAGE_ALLOWED_HOSTS,
  RUNTIME_IMAGE_HOST_SUFFIXES,
  isAllowedRuntimeImageBody,
  parseAllowedRuntimeImageUrl,
} from '@/core/utils/runtimeImageFetch';

type RuntimeImageMessage = {
  type: 'gv.fetchImage' | 'gv.fetchImageViaPage';
  url?: unknown;
};

type RuntimeImageSender = {
  id?: string;
  tab?: { id?: number; url?: string };
};

export function isRuntimeImageMessage(message: unknown): message is RuntimeImageMessage {
  if (!message || typeof message !== 'object') return false;
  const type = (message as { type?: unknown }).type;
  return type === 'gv.fetchImage' || type === 'gv.fetchImageViaPage';
}

function normalizeRuntimeImageContentType(value: string | null | undefined): string {
  return value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

async function readBoundedRuntimeImageResponse(
  response: Response,
  requestedUrl: string,
  senderPageUrl: string,
): Promise<{ contentType: string; base64: string } | null> {
  const finalUrl = response.url || requestedUrl;
  if (!parseAllowedRuntimeImageUrl(finalUrl, senderPageUrl)) return null;

  const contentType = normalizeRuntimeImageContentType(response.headers.get('Content-Type'));
  if (!contentType.startsWith('image/')) return null;

  const declaredLength = Number(response.headers.get('Content-Length') || '0');
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > 0 &&
    !isAllowedRuntimeImageBody(contentType, declaredLength)
  ) {
    return null;
  }

  if (!response.body) {
    const blob = await response.blob();
    if (!isAllowedRuntimeImageBody(contentType, blob.size)) return null;
    return { contentType, base64: arrayBufferToBase64(await blob.arrayBuffer()) };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RUNTIME_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (!isAllowedRuntimeImageBody(contentType, totalBytes)) return null;

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { contentType, base64: arrayBufferToBase64(bytes.buffer) };
}

export async function handleRuntimeImageMessage(
  message: RuntimeImageMessage,
  sender: RuntimeImageSender,
): Promise<Record<string, unknown>> {
  const tabId = sender.tab?.id;
  const senderPageUrl = sender.tab?.url;
  if (sender.id !== chrome.runtime.id || !tabId || !senderPageUrl) {
    return { ok: false, error: 'untrusted_sender' };
  }

  const parsedUrl = parseAllowedRuntimeImageUrl(String(message.url || ''), senderPageUrl);
  if (!parsedUrl) return { ok: false, error: 'url_not_allowed' };
  const url = parsedUrl.href;

  if (message.type === 'gv.fetchImageViaPage') {
    if (!chrome.scripting?.executeScript) {
      return { ok: false, error: 'scripting_api_unavailable' };
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN' as chrome.scripting.ExecutionWorld,
        func: async (
          imageUrl: string,
          senderOrigin: string,
          allowedHosts: readonly string[],
          allowedHostSuffixes: readonly string[],
          maxBytes: number,
        ) => {
          const isAllowedFinalUrl = (rawUrl: string): boolean => {
            try {
              const parsed = new URL(rawUrl);
              if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
              const hostname = parsed.hostname.toLowerCase();
              return (
                parsed.origin === senderOrigin ||
                allowedHosts.includes(hostname) ||
                allowedHostSuffixes.some((suffix) => hostname.endsWith(suffix))
              );
            } catch {
              return false;
            }
          };

          const safeFetch = async (credentials: RequestCredentials) => {
            try {
              const response = await fetch(imageUrl, { credentials });
              return response.ok ? response : null;
            } catch {
              return null;
            }
          };

          const response = (await safeFetch('include')) || (await safeFetch('omit'));
          if (!response || !isAllowedFinalUrl(response.url || imageUrl)) return null;

          const contentType =
            response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
          if (!contentType.startsWith('image/')) return null;
          const declaredLength = Number(response.headers.get('Content-Length') || '0');
          if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;

          let blob: Blob;
          if (!response.body) {
            blob = await response.blob();
            if (blob.size <= 0 || blob.size > maxBytes) return null;
          } else {
            const streamReader = response.body.getReader();
            const chunks: ArrayBuffer[] = [];
            let totalBytes = 0;
            while (true) {
              const { done, value } = await streamReader.read();
              if (done) break;
              if (!value) continue;
              totalBytes += value.byteLength;
              if (totalBytes > maxBytes) {
                await streamReader.cancel();
                return null;
              }
              const chunk = new Uint8Array(value.byteLength);
              chunk.set(value);
              chunks.push(chunk.buffer);
            }
            if (totalBytes <= 0) return null;
            blob = new Blob(chunks, { type: contentType });
          }

          return await new Promise<{
            contentType: string;
            base64: string;
            finalUrl: string;
          } | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = String(reader.result || '');
              const commaIndex = dataUrl.indexOf(',');
              resolve(
                commaIndex < 0
                  ? null
                  : {
                      contentType,
                      base64: dataUrl.substring(commaIndex + 1),
                      finalUrl: response.url || imageUrl,
                    },
              );
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        },
        args: [
          url,
          new URL(senderPageUrl).origin,
          RUNTIME_IMAGE_ALLOWED_HOSTS,
          RUNTIME_IMAGE_HOST_SUFFIXES,
          MAX_RUNTIME_IMAGE_BYTES,
        ],
      });
      const result = results?.[0]?.result as {
        contentType: string;
        base64: string;
        finalUrl: string;
      } | null;
      const estimatedBytes = result?.base64 ? Math.floor((result.base64.length * 3) / 4) : 0;
      if (
        !result?.base64 ||
        !parseAllowedRuntimeImageUrl(result.finalUrl, senderPageUrl) ||
        !isAllowedRuntimeImageBody(result.contentType, estimatedBytes)
      ) {
        return { ok: false, error: 'page_fetch_failed' };
      }
      return {
        ok: true,
        contentType: result.contentType,
        base64: result.base64,
        data: `data:${result.contentType};base64,${result.base64}`,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const fetchWithFallback = async (credentials: RequestCredentials) => {
    try {
      return await fetch(url, { credentials, redirect: 'follow' });
    } catch {
      return null;
    }
  };
  let response = await fetchWithFallback('include');
  if (!response?.ok) response = await fetchWithFallback('omit');
  if (!response?.ok) {
    return { ok: false, error: response ? `HTTP ${response.status}` : 'fetch_failed' };
  }
  const result = await readBoundedRuntimeImageResponse(response, url, senderPageUrl);
  if (!result) return { ok: false, error: 'unexpected_content' };
  return {
    ok: true,
    data: `data:${result.contentType};base64,${result.base64}`,
    contentType: result.contentType,
    base64: result.base64,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa on service worker context is available
  return btoa(binary);
}
