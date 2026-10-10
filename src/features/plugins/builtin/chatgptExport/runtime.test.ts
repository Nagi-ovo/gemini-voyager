import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountPersistentExportToolbar } from '@/pages/content/export/persistentExportToolbar';

import { CHATGPT_EXPORT_OPEN_MESSAGE } from './openMessage';
import { startChatGptExportPlugin, stopChatGptExportPlugin } from './runtime';

type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => void;

const messageListeners = new Set<MessageListener>();

/** Deliver a runtime message the way Chrome does and collect the responses. */
function sendRuntimeMessage(message: unknown): unknown[] {
  const responses: unknown[] = [];
  for (const listener of messageListeners) {
    listener(message, {}, (response) => responses.push(response));
  }
  return responses;
}

const mocks = vi.hoisted(() => ({
  startExportButton: vi.fn(),
}));

vi.mock('@/pages/content/export', () => ({
  startExportButton: mocks.startExportButton,
}));

describe('ChatGPT export builtin plugin lifecycle', () => {
  beforeEach(() => {
    stopChatGptExportPlugin();
    vi.clearAllMocks();
    messageListeners.clear();
    (chrome.runtime.onMessage.addListener as unknown as Mock).mockImplementation(
      (listener: MessageListener) => messageListeners.add(listener),
    );
    (chrome.runtime.onMessage.removeListener as unknown as Mock).mockImplementation(
      (listener: MessageListener) => messageListeners.delete(listener),
    );
  });

  afterEach(() => {
    stopChatGptExportPlugin();
    document.querySelectorAll('.gv-persistent-export-toolbar').forEach((node) => node.remove());
  });

  it('retains the export entry cleanup while the plugin is mounted', async () => {
    const cleanup = vi.fn();
    mocks.startExportButton.mockResolvedValue(cleanup);

    startChatGptExportPlugin();

    await vi.waitFor(() => expect(mocks.startExportButton).toHaveBeenCalledOnce());
    const signal = mocks.startExportButton.mock.calls[0][0].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await vi.waitFor(() => expect(mocks.startExportButton).toHaveResolved());

    stopChatGptExportPlugin();
    expect(signal.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('aborts the stale lifecycle before starting a replacement', async () => {
    mocks.startExportButton.mockResolvedValue(vi.fn());

    startChatGptExportPlugin();
    await vi.waitFor(() => expect(mocks.startExportButton).toHaveBeenCalledTimes(1));
    const firstSignal = mocks.startExportButton.mock.calls[0][0].signal as AbortSignal;
    stopChatGptExportPlugin();
    startChatGptExportPlugin();
    await vi.waitFor(() => expect(mocks.startExportButton).toHaveBeenCalledTimes(2));

    expect(firstSignal.aborted).toBe(true);
    expect((mocks.startExportButton.mock.calls[1][0].signal as AbortSignal).aborted).toBe(false);
  });

  it('cleans up a late export mount when the plugin was already disabled', async () => {
    let resolveStart: (cleanup: () => void) => void = () => {
      throw new Error('Expected deferred export start resolver.');
    };
    const cleanup = vi.fn();
    mocks.startExportButton.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveStart = resolve;
      }),
    );

    startChatGptExportPlugin();
    stopChatGptExportPlugin();
    resolveStart(cleanup);

    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
  });

  describe('popup export request', () => {
    it('opens the mounted export toolbar and reports success', async () => {
      mocks.startExportButton.mockResolvedValue(vi.fn());
      const onClick = vi.fn();
      mountPersistentExportToolbar({ label: 'Export', tooltip: 'Export chat', onClick });

      startChatGptExportPlugin();

      expect(sendRuntimeMessage({ type: CHATGPT_EXPORT_OPEN_MESSAGE })).toEqual([{ ok: true }]);
      expect(onClick).toHaveBeenCalledOnce();
    });

    it('reports no conversation when no export entry is mounted on the page', () => {
      mocks.startExportButton.mockResolvedValue(vi.fn());

      startChatGptExportPlugin();

      expect(sendRuntimeMessage({ type: CHATGPT_EXPORT_OPEN_MESSAGE })).toEqual([
        { ok: false, reason: 'no-conversation' },
      ]);
    });

    it('ignores unrelated messages', () => {
      mocks.startExportButton.mockResolvedValue(vi.fn());

      startChatGptExportPlugin();

      expect(sendRuntimeMessage({ type: 'gv.plugins.status' })).toEqual([]);
    });

    it('stops answering once the plugin is disabled, even before the mount settles', () => {
      mocks.startExportButton.mockReturnValue(new Promise<() => void>(() => {}));

      startChatGptExportPlugin();
      expect(messageListeners.size).toBe(1);
      stopChatGptExportPlugin();

      expect(messageListeners.size).toBe(0);
      expect(sendRuntimeMessage({ type: CHATGPT_EXPORT_OPEN_MESSAGE })).toEqual([]);
    });

    it('keeps a single listener across a disable and re-enable', async () => {
      mocks.startExportButton.mockResolvedValue(vi.fn());

      startChatGptExportPlugin();
      stopChatGptExportPlugin();
      startChatGptExportPlugin();

      expect(messageListeners.size).toBe(1);
    });

    it('drops the listener when the export mount fails', async () => {
      mocks.startExportButton.mockRejectedValue(new Error('mount failed'));

      startChatGptExportPlugin();

      await vi.waitFor(() => expect(messageListeners.size).toBe(0));
    });
  });
});
