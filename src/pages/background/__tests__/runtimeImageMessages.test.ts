import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_RUNTIME_IMAGE_BYTES } from '@/core/utils/runtimeImageFetch';

import { handleRuntimeImageMessage } from '../runtimeImageMessages';

const url = 'https://lh3.googleusercontent.com/private/image.png';
const sender = {
  id: 'test-extension-id',
  tab: { id: 7, url: 'https://gemini.google.com/u/1/app/abc' },
};
const fetchImage = vi.fn<typeof fetch>();

function response(body: BodyInit | null, type = 'image/png', finalUrl = url): Response {
  const result = new Response(body, { headers: { 'Content-Type': type } });
  Object.defineProperty(result, 'url', { value: finalUrl });
  return result;
}

beforeEach(() => {
  fetchImage.mockReset();
  vi.stubGlobal('fetch', fetchImage);
});
afterEach(() => vi.unstubAllGlobals());

describe('privileged runtime image relay', () => {
  it.each([
    { ...sender, id: 'another-extension' },
    { id: sender.id },
    { id: sender.id, tab: { id: 7 } },
  ])('does not fetch on behalf of an untrusted or unidentified page %#', async (untrusted) => {
    expect(await handleRuntimeImageMessage({ type: 'gv.fetchImage', url }, untrusted)).toEqual({
      ok: false,
      error: 'untrusted_sender',
    });
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it.each([
    'https://accounts.google.com/private',
    'https://evil-googleusercontent.com/private',
    'http://lh3.googleusercontent.com/image.png',
    'https://user:password@lh3.googleusercontent.com/image.png',
  ])('rejects disallowed targets before any fetch: %s', async (target) => {
    expect(await handleRuntimeImageMessage({ type: 'gv.fetchImage', url: target }, sender)).toEqual(
      {
        ok: false,
        error: 'url_not_allowed',
      },
    );
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('returns a bounded streamed image and normalizes its media type', async () => {
    fetchImage.mockResolvedValue(response(new Uint8Array([1, 2, 3]), 'Image/PNG; charset=binary'));
    expect(await handleRuntimeImageMessage({ type: 'gv.fetchImage', url }, sender)).toEqual({
      ok: true,
      contentType: 'image/png',
      base64: 'AQID',
      data: 'data:image/png;base64,AQID',
    });
  });

  it('preserves authenticated fetch fallback for same-origin images', async () => {
    const local = 'https://gemini.google.com/image.png';
    fetchImage
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(response(new Uint8Array([1]), 'image/png', local));
    expect(
      await handleRuntimeImageMessage({ type: 'gv.fetchImage', url: local }, sender),
    ).toMatchObject({
      ok: true,
    });
    expect(fetchImage.mock.calls.map(([, options]) => options?.credentials)).toEqual([
      'include',
      'omit',
    ]);
  });

  it.each([
    ['redirect to another host', 'image/png', 'https://accounts.google.com/private'],
    ['HTML returned by a media host', 'text/html', url],
  ])('rejects %s', async (_label, mediaType, finalUrl) => {
    fetchImage.mockResolvedValue(response(new Uint8Array([1]), mediaType, finalUrl));
    expect(await handleRuntimeImageMessage({ type: 'gv.fetchImage', url }, sender)).toEqual({
      ok: false,
      error: 'unexpected_content',
    });
  });

  it('rejects an excessive declared length without reading its body', async () => {
    const result = response(new Uint8Array([1]));
    result.headers.set('Content-Length', String(MAX_RUNTIME_IMAGE_BYTES + 1));
    fetchImage.mockResolvedValue(result);
    expect(await handleRuntimeImageMessage({ type: 'gv.fetchImage', url }, sender)).toEqual({
      ok: false,
      error: 'unexpected_content',
    });
    expect(result.bodyUsed).toBe(false);
  });

  it('cancels an oversized stream even when its declared length is misleading', async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_RUNTIME_IMAGE_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel: cancelled,
    });
    const result = response(stream);
    result.headers.set('Content-Length', '1');
    fetchImage.mockResolvedValue(result);
    expect(await handleRuntimeImageMessage({ type: 'gv.fetchImage', url }, sender)).toEqual({
      ok: false,
      error: 'unexpected_content',
    });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('rejects an empty image body', async () => {
    fetchImage.mockResolvedValue(response(new Uint8Array()));
    expect(await handleRuntimeImageMessage({ type: 'gv.fetchImage', url }, sender)).toEqual({
      ok: false,
      error: 'unexpected_content',
    });
  });

  it.each([
    { contentType: 'text/html', base64: 'AQID', finalUrl: url },
    { contentType: 'image/png', base64: 'AQID', finalUrl: 'https://accounts.google.com/private' },
    {
      contentType: 'image/png',
      base64: 'A'.repeat(Math.ceil(((MAX_RUNTIME_IMAGE_BYTES + 1) * 4) / 3)),
      finalUrl: url,
    },
  ])('validates image results returned from the page realm %#', async (result) => {
    vi.stubGlobal('chrome', {
      ...chrome,
      scripting: { executeScript: vi.fn().mockResolvedValue([{ result }]) },
    });
    expect(await handleRuntimeImageMessage({ type: 'gv.fetchImageViaPage', url }, sender)).toEqual({
      ok: false,
      error: 'page_fetch_failed',
    });
  });
});
