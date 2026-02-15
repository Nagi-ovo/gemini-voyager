import { toBlob } from 'html-to-image';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderElementToImageBlob } from '../ImageRenderService';

vi.mock('html-to-image', () => ({
  toBlob: vi.fn(),
}));

describe('ImageRenderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders element to blob directly when primary render succeeds', async () => {
    const target = document.createElement('div');
    const blob = new Blob(['ok'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(blob);

    const result = await renderElementToImageBlob(target);

    expect(result).toBe(blob);
    expect(toBlob).toHaveBeenCalledTimes(1);
  });

  it('retries when shouldRetry returns true and later succeeds', async () => {
    const target = document.createElement('div');
    const blob = new Blob(['ok'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Event('error'))
      .mockResolvedValueOnce(blob);

    const result = await renderElementToImageBlob(target, {
      maxAttempts: 2,
      retryDelayMs: 0,
      shouldRetry: (error) => error instanceof Event,
    });

    expect(result).toBe(blob);
    expect(toBlob).toHaveBeenCalledTimes(2);
  });

  it('falls back to sanitized clone when resource rendering fails', async () => {
    const target = document.createElement('div');
    const image = document.createElement('img');
    image.src = 'https://example.com/fail.png';
    target.appendChild(image);
    document.body.appendChild(target);

    const blob = new Blob(['ok'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Failed to fetch resource'))
      .mockResolvedValueOnce(blob);

    const result = await renderElementToImageBlob(target, {
      enableSanitizedFallback: true,
    });

    expect(result).toBe(blob);
    expect(toBlob).toHaveBeenCalledTimes(2);

    const secondTarget = (toBlob as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondTarget).not.toBe(target);
    expect((secondTarget as HTMLElement).querySelector('img')).toBeNull();
  });

  it('uses fallback render root with non-zero width for zero-size targets', async () => {
    const target = document.createElement('div');
    target.textContent = 'fallback';
    document.body.appendChild(target);

    let callCount = 0;
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (node: HTMLElement) => {
        callCount += 1;
        if (callCount === 1) {
          return null;
        }
        const width = Number.parseInt(node.style.width || '0', 10);
        if (width > 0) {
          return new Blob(['ok'], { type: 'image/png' });
        }
        return null;
      },
    );

    const result = await renderElementToImageBlob(target, {
      enableSanitizedFallback: true,
      shouldFallback: () => true,
    });

    expect(result).toBeInstanceOf(Blob);
    expect(toBlob).toHaveBeenCalledTimes(2);
    const secondTarget = (toBlob as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(Number.parseInt((secondTarget as HTMLElement).style.width || '0', 10)).toBeGreaterThan(
      0,
    );
  });
});
