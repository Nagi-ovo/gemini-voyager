import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

function setConversationPage(id = 'conv123'): void {
  window.history.replaceState({}, '', `/app/${id}`);
}

function renderConversationTitle(title: string): HTMLElement {
  document.body.innerHTML = `
    <div class="conversation-title-container">
      <span data-test-id="conversation-title">${title}</span>
    </div>
  `;
  return document.querySelector('[data-test-id="conversation-title"]') as HTMLElement;
}

describe('titleUpdater', () => {
  let storageListeners: StorageChangeListener[];
  let cleanup: (() => void) | null;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    storageListeners = [];
    cleanup = null;
    document.title = 'Google Gemini';
    document.body.innerHTML = '';
    setConversationPage();

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: StorageChangeListener) => {
      storageListeners.push(listener);
    });

    (
      chrome.storage.onChanged.removeListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: StorageChangeListener) => {
      storageListeners = storageListeners.filter((item) => item !== listener);
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.history.replaceState({}, '', '/');
    document.body.innerHTML = '';
    document.title = 'Google Gemini';
  });

  it('stops syncing immediately when the setting is turned off', async () => {
    const titleEl = renderConversationTitle('First title');
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      [StorageKeys.TAB_TITLE_UPDATE_ENABLED]: true,
    });

    const { startTitleUpdater } = await import('../index');
    cleanup = await startTitleUpdater();

    expect(document.title).toBe('First title - Gemini');

    storageListeners[0](
      {
        [StorageKeys.TAB_TITLE_UPDATE_ENABLED]: {
          oldValue: true,
          newValue: false,
        },
      },
      'sync',
    );

    expect(document.title).toBe('Google Gemini');

    titleEl.textContent = 'Second title';
    window.history.pushState({}, '', '/app/conv456');

    expect(document.title).toBe('Google Gemini');
  });

  it('starts syncing without a refresh when the setting is turned on', async () => {
    renderConversationTitle('Lazy title');
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      [StorageKeys.TAB_TITLE_UPDATE_ENABLED]: false,
    });

    const { startTitleUpdater } = await import('../index');
    cleanup = await startTitleUpdater();

    expect(document.title).toBe('Google Gemini');

    storageListeners[0](
      {
        [StorageKeys.TAB_TITLE_UPDATE_ENABLED]: {
          oldValue: false,
          newValue: true,
        },
      },
      'sync',
    );

    expect(document.title).toBe('Lazy title - Gemini');
  });
});
