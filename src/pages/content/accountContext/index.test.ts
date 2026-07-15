import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startAccountContextBridge } from './index';

describe('account context bridge', () => {
  const addListener = vi.fn();
  const removeListener = vi.fn();

  beforeEach(() => {
    addListener.mockReset();
    removeListener.mockReset();
    (globalThis as { chrome: unknown }).chrome = {
      runtime: { onMessage: { addListener, removeListener } },
    };
    window.history.replaceState(null, '', '/app/conversation-without-u-route');
    document.body.innerHTML = `
      <button aria-label="Google Account: Jesse Zhang (j3ssezhang102@gmail.com)"></button>
    `;
  });

  it('returns the page email even when Folder Manager is not running', () => {
    const cleanup = startAccountContextBridge();
    const listener = addListener.mock.calls[0]?.[0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => void;
    const sendResponse = vi.fn();

    listener({ type: 'gv.account.getContext' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      context: { routeUserId: null, email: 'j3ssezhang102@gmail.com' },
    });
    cleanup();
    expect(removeListener).toHaveBeenCalledWith(listener);
  });
});
