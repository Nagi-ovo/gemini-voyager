// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashValue } from '@/core/utils/canonicalHash';
import { CHATGPT_JUMP_ACCOUNT_MESSAGE } from '@/features/savedLibrary/chatGptJumpMessages';

import { startChatGptJumpAccountListener } from './account';

type Listener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];
const sender = {
  id: 'test-extension-id',
  url: 'chrome-extension://test-extension-id/src/pages/library/index.html',
  tab: { id: 7 },
} as chrome.runtime.MessageSender;

let stop: (() => void) | undefined;
let listener: Listener;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  stop = startChatGptJumpAccountListener();
  listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0];
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function request(from = sender): Promise<unknown> {
  return new Promise((resolve) => listener({ type: CHATGPT_JUMP_ACCOUNT_MESSAGE }, from, resolve));
}

function session(user: string, account: string): Response {
  return new Response(
    JSON.stringify({ user: { id: user }, account: { id: account }, accessToken: 'secret-token' }),
  );
}

describe('ChatGPT jump account bridge', () => {
  it('the session token never leaves the content script', async () => {
    fetchMock.mockResolvedValueOnce(session('user-one', 'account-one'));
    const response = await request();
    expect(response).toEqual({
      ok: true,
      account: `chatgpt:${await hashValue(['user-one', 'account-one'])}`,
    });
    expect(JSON.stringify(response)).not.toMatch(/secret-token|user-one|account-one/);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
  });

  it('a stale page reads the current session again before the next jump', async () => {
    fetchMock.mockResolvedValueOnce(session('user-one', 'account-one'));
    fetchMock.mockResolvedValueOnce(session('user-two', 'account-two'));
    expect(await request()).not.toEqual(await request());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('an unreadable or unsigned-in account answers unavailable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network failed'));
    expect(await request()).toEqual({ ok: false });
    fetchMock.mockResolvedValueOnce(new Response('{}'));
    expect(await request()).toEqual({ ok: false });
  });

  it('a stalled session read answers unavailable without blocking navigation', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const response = request();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await response).toEqual({ ok: false });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('a page sender cannot request the account even with our extension id', () => {
    const reply = vi.fn();
    expect(
      listener(
        { type: CHATGPT_JUMP_ACCOUNT_MESSAGE },
        { ...sender, url: 'https://chatgpt.com/' },
        reply,
      ),
    ).toBeUndefined();
    expect(
      listener(
        { type: CHATGPT_JUMP_ACCOUNT_MESSAGE },
        { ...sender, id: 'another-extension' },
        reply,
      ),
    ).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it('teardown cancels pending reads and never replies from the previous document', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const reply = vi.fn();
    listener({ type: CHATGPT_JUMP_ACCOUNT_MESSAGE }, sender, reply);
    stop?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(reply).not.toHaveBeenCalled();
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);
  });
});
