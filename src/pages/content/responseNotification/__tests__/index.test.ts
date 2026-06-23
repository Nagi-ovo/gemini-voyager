import { StorageKeys } from '@/core/types/common';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PAGE_OBSERVER_SOURCE = 'gemini-voyager-response-complete-observer';

let cleanup: (() => void) | null = null;

function dispatchPageObserverMessage(type: 'request-start' | 'request-complete'): void {
  const event = new MessageEvent('message', {
    data: {
      source: PAGE_OBSERVER_SOURCE,
      type,
      payload: {
        requestId: 1,
        shouldNotify: true,
      },
    },
  });
  Object.defineProperty(event, 'source', { value: window });
  window.dispatchEvent(event);
}

beforeEach(() => {
  vi.resetModules();
  cleanup = null;
  document.body.innerHTML = `
    <article data-author="assistant">
      <p>Final answer</p>
      <button aria-label="Copy response">Copy</button>
    </article>
  `;
  (chrome.storage.sync.get as unknown as Mock).mockResolvedValue({
    [StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED]: true,
  });
  (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue({ ok: true });
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
});

afterEach(() => {
  cleanup?.();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('startResponseCompleteNotification', () => {
  it('sends background completion notifications without a captured prompt interaction', async () => {
    const { startResponseCompleteNotification } = await import('../index');

    cleanup = await startResponseCompleteNotification();
    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'gv.responseComplete.notify',
        }),
      );
    });
  });
});
