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
    expect(toBlob).toHaveBeenCalledWith(target, expect.objectContaining({ skipFonts: true }));
  });

  it('embeds fonts for math content so KaTeX radicals render correctly', async () => {
    const target = document.createElement('div');
    target.innerHTML = '<span class="math-inline" data-math="\\sqrt{x}">sqrt</span>';
    const blob = new Blob(['ok'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(blob);

    await renderElementToImageBlob(target);

    expect(toBlob).toHaveBeenCalledWith(target, expect.objectContaining({ skipFonts: false }));
  });

  it('inlines KaTeX radical SVG layout before rendering', async () => {
    const target = document.createElement('div');
    target.innerHTML = `
      <span class="katex">
        <span class="sqrt">
          <span class="svg-align">
            <span class="hide-tail">
              <svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"></path></svg>
              <img class="katex-svg" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" />
            </span>
          </span>
        </span>
      </span>
    `;
    const blob = new Blob(['ok'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(blob);

    await renderElementToImageBlob(target);

    const wrapper = target.querySelector('.hide-tail') as HTMLElement | null;
    const aligner = target.querySelector('.svg-align') as HTMLElement | null;
    const svg = target.querySelector('svg') as SVGSVGElement | null;
    const img = target.querySelector('img.katex-svg') as HTMLImageElement | null;
    const path = target.querySelector('path') as SVGPathElement | null;

    expect(wrapper?.style.getPropertyValue('display')).toBe('block');
    expect(wrapper?.style.getPropertyPriority('display')).toBe('important');
    expect(wrapper?.style.getPropertyValue('overflow')).toBe('hidden');
    expect(wrapper?.style.getPropertyValue('position')).toBe('relative');
    expect(wrapper?.style.getPropertyValue('width')).toBe('100%');
    expect(aligner?.style.getPropertyValue('text-align')).toBe('left');
    expect(svg?.style.getPropertyValue('display')).toBe('block');
    expect(svg?.style.getPropertyValue('fill')).toBe('currentColor');
    expect(svg?.style.getPropertyValue('height')).toBe('inherit');
    expect(svg?.style.getPropertyValue('position')).toBe('absolute');
    expect(svg?.style.getPropertyValue('stroke')).toBe('currentColor');
    expect(svg?.style.getPropertyValue('width')).toBe('100%');
    expect(img?.style.getPropertyValue('display')).toBe('block');
    expect(img?.style.getPropertyValue('height')).toBe('inherit');
    expect(img?.style.getPropertyValue('margin')).toBe('0px');
    expect(img?.style.getPropertyValue('max-width')).toBe('none');
    expect(img?.style.getPropertyValue('object-fit')).toBe('fill');
    expect(img?.style.getPropertyValue('position')).toBe('absolute');
    expect(img?.style.getPropertyValue('width')).toBe('100%');
    expect(path?.style.getPropertyValue('stroke')).toBe('none');
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

  it('strips XML-illegal control characters before rendering', async () => {
    const target = document.createElement('div');
    target.textContent = 'hello\x01world\x08test';
    const blob = new Blob(['ok'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(blob);

    const result = await renderElementToImageBlob(target);

    expect(result).toBe(blob);
    expect(target.textContent).toBe('helloworldtest');
  });

  it('preserves valid whitespace characters (tab, LF, CR) during rendering', async () => {
    const target = document.createElement('div');
    target.textContent = 'line1\tindented\nline2\rline3';
    const blob = new Blob(['ok'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(blob);

    await renderElementToImageBlob(target);

    expect(target.textContent).toBe('line1\tindented\nline2\rline3');
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
