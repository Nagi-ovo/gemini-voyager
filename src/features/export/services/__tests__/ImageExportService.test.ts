import { toBlob } from 'html-to-image';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatTurn, ConversationMetadata } from '../../types/export';
import { ImageExportService } from '../ImageExportService';

vi.mock('html-to-image', () => {
  return {
    toBlob: vi.fn(),
  };
});

function setUserAgentVendor(userAgent: string, vendor: string): void {
  Object.defineProperty(global.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(global.navigator, 'vendor', {
    value: vendor,
    configurable: true,
  });
}

describe('ImageExportService', () => {
  const mockMetadata: ConversationMetadata = {
    url: 'https://gemini.google.com/app/test',
    exportedAt: '2026-01-01T00:00:00.000Z',
    count: 1,
    title: 'Test',
  };

  const mockTurns: ChatTurn[] = [
    {
      user: 'Hello',
      assistant: 'World',
      starred: false,
    },
  ];

  beforeEach(() => {
    setUserAgentVendor(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Google Inc.',
    );
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        el.click = vi.fn();
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders via html-to-image and downloads a png', async () => {
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['x'], { type: 'image/png' }),
    );

    await ImageExportService.export(mockTurns, mockMetadata, { filename: 'chat.png' });

    expect(toBlob).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        pixelRatio: 1.2,
      }),
    );
    expect(global.URL.createObjectURL).toHaveBeenCalledOnce();
    const anchors = document.querySelectorAll('a');
    expect(anchors.length).toBeGreaterThan(0);
    expect((anchors[0] as HTMLAnchorElement).download).toBe('chat.png');
  });

  it('renders conversation to blob without downloading', async () => {
    const blob = new Blob(['blob'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(blob);

    const result = await ImageExportService.renderConversationBlob(mockTurns, mockMetadata, {});

    expect(result).toBe(blob);
    expect(toBlob).toHaveBeenCalled();
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('retries transient image render failures on Chrome and succeeds', async () => {
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockReset();
    (toBlob as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Event('error'))
      .mockResolvedValueOnce(new Blob(['ok'], { type: 'image/png' }));

    await ImageExportService.export(mockTurns, mockMetadata, { filename: 'retry.png' });

    expect(toBlob).toHaveBeenCalledTimes(2);
    expect(global.URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('does not retry non-retryable render failures on Chrome', async () => {
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockReset();
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('canvas too large'),
    );

    await expect(
      ImageExportService.export(mockTurns, mockMetadata, { filename: 'fail.png' }),
    ).rejects.toThrow('canvas too large');

    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('uses larger typography and media sizing for mobile readability', async () => {
    let capturedStyle = '';
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (node: HTMLElement) => {
        capturedStyle =
          (node.parentElement?.querySelector('style') as HTMLStyleElement | null)?.textContent ??
          '';
        return new Blob(['x'], { type: 'image/png' });
      },
    );

    await ImageExportService.export(mockTurns, mockMetadata, { filename: 'readable.png' });

    expect(capturedStyle).toContain('font-size: 20px;');
    expect(capturedStyle).toContain('line-height: 1.9;');
    expect(capturedStyle).toContain('font-size: 50px;');
    expect(capturedStyle).toContain('max-width: 100%;');
  });

  it('retries image render without img elements on Safari when primary render fails', async () => {
    setUserAgentVendor(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'Apple Computer, Inc.',
    );

    const assistantElement = document.createElement('div');
    assistantElement.innerHTML =
      '<p>Body</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAgMBgA9N4FoAAAAASUVORK5CYII=" alt="img" />';

    const turnsWithImage: ChatTurn[] = [
      {
        user: '',
        assistant: 'fallback',
        starred: false,
        assistantElement,
      },
    ];

    (toBlob as unknown as ReturnType<typeof vi.fn>).mockReset();
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (node: HTMLElement) => {
        if (node.querySelector('img')) {
          throw new Error('image blocked');
        }
        return new Blob(['ok'], { type: 'image/png' });
      },
    );

    await ImageExportService.export(turnsWithImage, mockMetadata, { filename: 'safari.png' });

    expect(toBlob).toHaveBeenCalledTimes(2);
    expect(global.URL.createObjectURL).toHaveBeenCalledOnce();

    const firstTarget = (toBlob as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as HTMLElement;
    const secondTarget = (toBlob as unknown as ReturnType<typeof vi.fn>).mock
      .calls[1][0] as HTMLElement;
    expect(firstTarget.querySelector('img')).not.toBeNull();
    expect(secondTarget.querySelector('img')).toBeNull();
  });
});
