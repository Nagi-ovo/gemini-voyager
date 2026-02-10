import { toBlob } from 'html-to-image';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  copyElementAsImageToClipboard,
  copyImageBlobToClipboard,
  downloadImageBlob,
} from '../responseImageCopy';

vi.mock('html-to-image', () => ({
  toBlob: vi.fn(),
}));

class MockClipboardItem {
  data: Record<string, Blob>;

  constructor(data: Record<string, Blob>) {
    this.data = data;
  }
}

describe('responseImageCopy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes rendered png blob to clipboard', async () => {
    const target = document.createElement('div');
    const blob = new Blob(['img'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(blob);

    const clipboardWrite = vi.fn().mockResolvedValue(undefined);

    await copyElementAsImageToClipboard(target, {
      clipboard: { write: clipboardWrite },
      ClipboardItemCtor: MockClipboardItem as unknown as typeof ClipboardItem,
    });

    expect(toBlob).toHaveBeenCalledOnce();
    expect(clipboardWrite).toHaveBeenCalledOnce();

    const [items] = clipboardWrite.mock.calls[0] as [MockClipboardItem[]];
    expect(items).toHaveLength(1);
    expect(items[0].data['image/png']).toBe(blob);
  });

  it('writes provided image blob to clipboard directly', async () => {
    const blob = new Blob(['img'], { type: 'image/png' });
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);

    await copyImageBlobToClipboard(blob, {
      clipboard: { write: clipboardWrite },
      ClipboardItemCtor: MockClipboardItem as unknown as typeof ClipboardItem,
    });

    expect(clipboardWrite).toHaveBeenCalledOnce();
    const [items] = clipboardWrite.mock.calls[0] as [MockClipboardItem[]];
    expect(items[0].data['image/png']).toBe(blob);
  });

  it('throws when render returns null blob', async () => {
    const target = document.createElement('div');
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      copyElementAsImageToClipboard(target, {
        clipboard: { write: vi.fn() },
        ClipboardItemCtor: MockClipboardItem as unknown as typeof ClipboardItem,
      }),
    ).rejects.toThrow('Image render failed');
  });

  it('throws when clipboard image API is unavailable', async () => {
    const target = document.createElement('div');
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['img'], { type: 'image/png' }),
    );

    await expect(
      copyElementAsImageToClipboard(target, {
        clipboard: null,
        ClipboardItemCtor: MockClipboardItem as unknown as typeof ClipboardItem,
      }),
    ).rejects.toThrow('Clipboard image copy is not supported');
  });

  it('falls back to a sanitized clone when first render fails on external resources', async () => {
    const target = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'https://example.com/blocked.png';
    target.appendChild(img);
    document.body.appendChild(target);

    const blob = new Blob(['img'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Failed to fetch resource'))
      .mockResolvedValueOnce(blob);

    const clipboardWrite = vi.fn().mockResolvedValue(undefined);

    await copyElementAsImageToClipboard(target, {
      clipboard: { write: clipboardWrite },
      ClipboardItemCtor: MockClipboardItem as unknown as typeof ClipboardItem,
    });

    expect(toBlob).toHaveBeenCalledTimes(2);

    const secondCallTarget = (toBlob as unknown as ReturnType<typeof vi.fn>).mock.calls[1]?.[0];
    expect(secondCallTarget).not.toBe(target);
    expect((secondCallTarget as HTMLElement).querySelector('img')).toBeNull();
    expect(clipboardWrite).toHaveBeenCalledOnce();
  });

  it('falls back when primary render returns null blob', async () => {
    const target = document.createElement('div');
    target.textContent = 'content';
    document.body.appendChild(target);

    const blob = new Blob(['img'], { type: 'image/png' });
    (toBlob as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(blob);

    const clipboardWrite = vi.fn().mockResolvedValue(undefined);

    await copyElementAsImageToClipboard(target, {
      clipboard: { write: clipboardWrite },
      ClipboardItemCtor: MockClipboardItem as unknown as typeof ClipboardItem,
    });

    expect(toBlob).toHaveBeenCalledTimes(2);
    expect(clipboardWrite).toHaveBeenCalledOnce();
  });

  it('downloads image blob via object URL and revokes it', () => {
    vi.useFakeTimers();
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const clickSpy = vi.fn();
    const nativeCreateElement = document.createElement.bind(document);
    const anchor = nativeCreateElement('a');
    anchor.click = clickSpy;
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'a') return anchor;
      return nativeCreateElement(tagName);
    });

    const blob = new Blob(['img'], { type: 'image/png' });
    downloadImageBlob(blob, 'reply-image.png');

    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    expect(anchor.href).toContain('blob:test');
    expect(anchor.download).toBe('reply-image.png');
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(appendSpy).toHaveBeenCalled();

    vi.runAllTimers();
    expect(removeSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test');

    createElementSpy.mockRestore();
    vi.useRealTimers();
  });
});
