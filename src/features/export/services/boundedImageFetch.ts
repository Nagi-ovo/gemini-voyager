import {
  fetchImageViaExtensionRuntime,
  parseAllowedRuntimeImageUrl,
} from '@/core/utils/runtimeImageFetch';

/**
 * Cap PDF/PNG refetches, never rendered content: later images keep their sources.
 * Markdown archives do not use this cap.
 */
export const MAX_EXPORT_IMAGE_COUNT = 40;
export const MAX_EXPORT_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_EXPORT_IMAGE_TOTAL_BYTES = 40 * 1024 * 1024;
/**
 * Markdown archives hold each image once, as a Blob part, so they can keep far
 * more than PDF and PNG inlining. This stays as a guard for tabs where the
 * browser keeps every Blob in memory.
 */
export const MAX_MARKDOWN_ARCHIVE_IMAGE_BYTES = 256 * 1024 * 1024;
export const EXPORT_IMAGE_FETCH_CONCURRENCY = 3;

const FETCH_TIMEOUT_MS = 10_000;
export interface ImageFetchBudget {
  remainingBytes: number;
}

export interface BoundedImage {
  readonly blob: Blob;
  readonly contentType: string;
}

function normalizeImageType(value: string | null | undefined): string | null {
  const type = value?.split(';', 1)[0]?.trim().toLowerCase() || '';
  return type.startsWith('image/') ? type : null;
}

function reserveBudget(
  blob: Blob,
  contentType: string,
  budget: ImageFetchBudget,
): BoundedImage | null {
  if (blob.size <= 0 || blob.size > MAX_EXPORT_IMAGE_BYTES || blob.size > budget.remainingBytes) {
    return null;
  }
  budget.remainingBytes -= blob.size;
  return { blob, contentType };
}

function isTrustedRuntimeUrl(url: URL): boolean {
  return parseAllowedRuntimeImageUrl(url.href, location.href) !== null;
}

function awaitWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T | null> {
  if (signal?.aborted) return Promise.reject(new DOMException('Export cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => settle(() => resolve(null)), timeoutMs);
    const abort = () => settle(() => reject(new DOMException('Export cancelled', 'AbortError')));
    const settle = (done: () => void) => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      done();
    };
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => settle(() => resolve(value)),
      () => settle(() => resolve(null)),
    );
  });
}

/**
 * Runs the request and the body read under one idle timer. Each body chunk
 * restarts it, so a large image on a slow link still arrives, while a stalled
 * body or a cancelled export aborts the read instead of waiting forever.
 */
async function fetchWithTimeout<T>(
  url: string,
  credentials: RequestCredentials,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  read: (response: Response, keepAlive: () => void) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeout = 0;
  const keepAlive = () => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  };
  const abort = () => controller.abort();
  keepAlive();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(url, {
      credentials,
      mode: 'cors',
      signal: controller.signal,
    });
    return await read(response, keepAlive);
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

async function readBoundedResponse(
  response: Response,
  budget: ImageFetchBudget,
  keepAlive: () => void,
): Promise<BoundedImage | null> {
  if (!response.ok) return null;
  const contentType = normalizeImageType(response.headers.get('Content-Type'));
  if (!contentType) return null;
  const declaredLength = Number(response.headers.get('Content-Length') || '0');
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > 0 &&
    (declaredLength > MAX_EXPORT_IMAGE_BYTES || declaredLength > budget.remainingBytes)
  ) {
    return null;
  }
  if (!response.body) {
    const blob = await response.blob();
    return reserveBudget(blob, normalizeImageType(blob.type) ?? contentType, budget);
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    keepAlive();
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_EXPORT_IMAGE_BYTES || totalBytes > budget.remainingBytes) {
      await reader.cancel();
      return null;
    }
    const chunk = new Uint8Array(value.byteLength);
    chunk.set(value);
    chunks.push(chunk.buffer);
  }

  const blob = new Blob(chunks, { type: contentType });
  return reserveBudget(blob, normalizeImageType(blob.type) ?? contentType, budget);
}

function decodeDataImage(url: string, budget: ImageFetchBudget): BoundedImage | null {
  const match = /^data:(image\/[^;,]+)((?:;[^,]*)?),(.*)$/is.exec(url);
  if (!match) return null;
  const contentType = normalizeImageType(match[1]);
  if (!contentType) return null;

  try {
    const isBase64 = /;base64(?:;|$)/i.test(match[2]);
    const raw = isBase64 ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = isBase64
      ? Uint8Array.from(raw, (character) => character.charCodeAt(0))
      : new TextEncoder().encode(raw);
    if (bytes.byteLength > MAX_EXPORT_IMAGE_BYTES || bytes.byteLength > budget.remainingBytes) {
      return null;
    }
    return reserveBudget(new Blob([bytes], { type: contentType }), contentType, budget);
  } catch {
    return null;
  }
}

export async function fetchBoundedExportImage(
  rawUrl: string,
  budget: ImageFetchBudget,
  signal?: AbortSignal,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<BoundedImage | null> {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  if (budget.remainingBytes <= 0) return null;
  if (/^data:/i.test(rawUrl)) return decodeDataImage(rawUrl, budget);

  if (/^blob:/i.test(rawUrl)) {
    try {
      return await fetchWithTimeout(
        rawUrl,
        'same-origin',
        signal,
        timeoutMs,
        (response, keepAlive) => readBoundedResponse(response, budget, keepAlive),
      );
    } catch {
      return null;
    }
  }

  let url: URL;
  try {
    url = new URL(rawUrl, location.href);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;

  try {
    const credentials: RequestCredentials = url.origin === location.origin ? 'include' : 'omit';
    const direct = await fetchWithTimeout(
      url.href,
      credentials,
      signal,
      timeoutMs,
      (response, keepAlive) => readBoundedResponse(response, budget, keepAlive),
    );
    if (direct) return direct;
  } catch {
    // Trusted extension-runtime fallback below.
  }

  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  if (!isTrustedRuntimeUrl(url)) return null;
  try {
    const runtimeImage = await awaitWithTimeout(
      fetchImageViaExtensionRuntime(url.href),
      timeoutMs,
      signal,
    );
    const contentType = normalizeImageType(runtimeImage?.contentType);
    if (!runtimeImage || !contentType) return null;
    const estimatedBytes = Math.floor((runtimeImage.base64.length * 3) / 4);
    if (estimatedBytes > MAX_EXPORT_IMAGE_BYTES || estimatedBytes > budget.remainingBytes) {
      return null;
    }
    const binary = atob(runtimeImage.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return reserveBudget(new Blob([bytes], { type: contentType }), contentType, budget);
  } catch {
    return null;
  }
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  task: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        results[index] = await task(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
