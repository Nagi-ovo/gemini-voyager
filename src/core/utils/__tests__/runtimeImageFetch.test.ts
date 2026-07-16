import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchImageViaExtensionRuntime } from '../runtimeImageFetch';

const sendMessage = vi.hoisted(() => vi.fn());

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendMessage } },
}));

afterEach(() => {
  vi.restoreAllMocks();
  sendMessage.mockReset();
});

describe('fetchImageViaExtensionRuntime', () => {
  it('uses the fast background result when available', async () => {
    sendMessage.mockResolvedValue({ ok: true, base64: 'YWJj', contentType: 'image/png' });

    await expect(fetchImageViaExtensionRuntime('https://example.com/a.png')).resolves.toEqual({
      base64: 'YWJj',
      contentType: 'image/png',
    });
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage.mock.calls[0][0]).toMatchObject({ type: 'gv.fetchImage' });
  });

  it('falls back to the authenticated page-world fetch', async () => {
    sendMessage.mockImplementation(async (message: unknown) =>
      (message as { type?: string }).type === 'gv.fetchImageViaPage'
        ? { ok: true, base64: 'ZGVm', contentType: 'image/webp' }
        : { ok: false },
    );

    await expect(fetchImageViaExtensionRuntime('https://example.com/b.webp')).resolves.toEqual({
      base64: 'ZGVm',
      contentType: 'image/webp',
    });
    expect(sendMessage.mock.calls.map(([message]) => (message as { type?: string }).type)).toEqual([
      'gv.fetchImage',
      'gv.fetchImageViaPage',
    ]);
  });
});
