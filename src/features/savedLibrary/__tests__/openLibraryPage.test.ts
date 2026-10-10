import { afterEach, describe, expect, it, vi } from 'vitest';

import { isHandledBackgroundRuntimeMessage } from '@/pages/background/runtimeMessageRouting';
import { registerBackgroundRuntimeMessages } from '@/pages/background/runtimeMessages';

import { LIBRARY_OPEN_MESSAGE, LIBRARY_PAGE_PATH, openLibraryPage } from '../openLibraryPage';

afterEach(() => vi.restoreAllMocks());

function connectLauncherToBackground(): void {
  registerBackgroundRuntimeMessages({
    handlePluginMessage: () => null,
    handleGeneratedUiMessage: () => null,
    handleNotificationMessage: () => null,
    handleStarredMessage: () => null,
    handleForkMessage: () => null,
    handleCloudSyncMessage: () => null,
    announcements: {
      getPendingAnnouncements: async () => [],
      acknowledgeAnnouncement: async () => {},
    },
  });
  const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)![0];
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    (async (message: { type: string }) =>
      new Promise<unknown>((resolve) => {
        listener(
          {
            ...message,
            url: 'https://untrusted.example/',
            payload: { url: 'https://elsewhere.example/' },
          },
          { tab: { id: 7, url: 'https://gemini.google.com/app' } as chrome.tabs.Tab },
          resolve,
        );
      })) as typeof chrome.runtime.sendMessage,
  );
}

describe('saved library launcher', () => {
  it('opens only the bundled page even when a content script supplies another URL', async () => {
    connectLauncherToBackground();

    await openLibraryPage();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: LIBRARY_OPEN_MESSAGE });
    expect(chrome.tabs.create).toHaveBeenCalledOnce();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: `chrome-extension://test-extension-id/${LIBRARY_PAGE_PATH}`,
    });
    expect(isHandledBackgroundRuntimeMessage({ type: LIBRARY_OPEN_MESSAGE })).toBe(true);
    expect(isHandledBackgroundRuntimeMessage({ type: `${LIBRARY_OPEN_MESSAGE}.unknown` })).toBe(
      false,
    );
  });

  it('reports failure when the browser refuses to open the Library tab', async () => {
    vi.mocked(chrome.tabs.create).mockRejectedValueOnce(new Error('Tabs unavailable'));
    connectLauncherToBackground();
    await expect(openLibraryPage()).rejects.toThrow('Failed to open saved library');
  });

  it.each([undefined, null, {}, { ok: false }, { ok: 'true' }])(
    'requires a positive acknowledgement before reporting launch success (%j)',
    async (response) => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementationOnce(
        (async () => response) as typeof chrome.runtime.sendMessage,
      );
      await expect(openLibraryPage()).rejects.toThrow();
    },
  );

  it('propagates an unavailable background without reporting success', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValueOnce(new Error('Context invalidated'));
    await expect(openLibraryPage()).rejects.toThrow('Context invalidated');
  });
});
