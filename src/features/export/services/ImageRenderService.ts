import { toBlob } from 'html-to-image';

const TRANSPARENT_IMAGE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const DEFAULT_OFFSCREEN_LEFT = '-100000px';
const DEFAULT_SANITIZE_SELECTOR = 'img, video, iframe, canvas, svg image';
const DEFAULT_RENDER_WIDTH = 720;

export type RenderElementToImageBlobOptions = {
  maxAttempts?: number;
  retryDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  enableSanitizedFallback?: boolean;
  sanitizeSelector?: string;
  shouldFallback?: (error: unknown) => boolean;
};

export function isImageResourceRenderError(error: unknown): boolean {
  if (error instanceof Event) return true;
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('image') ||
    message.includes('fetch') ||
    message.includes('decode') ||
    message.includes('resource') ||
    message.includes('taint') ||
    message.includes('canvas')
  );
}

async function renderTargetToBlob(target: HTMLElement): Promise<Blob> {
  const blob = await toBlob(target, {
    cacheBust: true,
    pixelRatio: 1.2,
    backgroundColor: '#ffffff',
    skipFonts: true,
    imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
    onImageErrorHandler: () => undefined,
  });

  if (!blob) {
    const rect = target.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    throw new Error(`Image render failed (${width}x${height})`);
  }

  return blob;
}

function sanitizeClone(target: HTMLElement, selector: string): HTMLElement {
  const clone = target.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(selector).forEach((element) => element.remove());
  return clone;
}

function resolveRenderableWidth(target: HTMLElement): number {
  let current: HTMLElement | null = target;
  let depth = 0;
  while (current && depth < 12) {
    const width = Math.round(current.getBoundingClientRect().width);
    if (Number.isFinite(width) && width > 24) {
      return width;
    }
    current = current.parentElement;
    depth += 1;
  }

  const viewportWidth = Math.round(globalThis.innerWidth || 0);
  if (viewportWidth > 24) {
    const preferred = Math.round(viewportWidth * 0.8);
    return Math.max(360, Math.min(preferred, 1200));
  }

  return DEFAULT_RENDER_WIDTH;
}

async function renderUsingSanitizedClone(target: HTMLElement, selector: string): Promise<Blob> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = DEFAULT_OFFSCREEN_LEFT;
  container.style.top = '0';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';

  const renderRoot = document.createElement('div');
  renderRoot.style.display = 'block';
  renderRoot.style.width = `${resolveRenderableWidth(target)}px`;
  renderRoot.style.background = '#ffffff';

  const clone = sanitizeClone(target, selector);
  renderRoot.appendChild(clone);
  container.appendChild(renderRoot);
  document.body.appendChild(container);

  try {
    return await renderTargetToBlob(renderRoot);
  } finally {
    container.remove();
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function renderElementToImageBlob(
  target: HTMLElement,
  options: RenderElementToImageBlobOptions = {},
): Promise<Blob> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 0);
  const shouldRetry = options.shouldRetry ?? (() => false);

  let primaryError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await renderTargetToBlob(target);
    } catch (error) {
      primaryError = error;
      const canRetry = attempt < maxAttempts && shouldRetry(error);
      if (!canRetry) break;
      if (retryDelayMs > 0) {
        await delay(retryDelayMs * attempt);
      }
    }
  }

  if (!options.enableSanitizedFallback) {
    throw primaryError;
  }

  const shouldFallback = options.shouldFallback ?? isImageResourceRenderError;
  if (!shouldFallback(primaryError)) {
    throw primaryError;
  }

  return await renderUsingSanitizedClone(
    target,
    options.sanitizeSelector ?? DEFAULT_SANITIZE_SELECTOR,
  );
}
