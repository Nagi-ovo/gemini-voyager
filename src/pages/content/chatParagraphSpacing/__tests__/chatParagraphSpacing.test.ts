import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

const STYLE_ID = 'gv-chat-paragraph-spacing-style';

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

function getInjectedStyle(): HTMLStyleElement | null {
  return document.getElementById(STYLE_ID) as HTMLStyleElement | null;
}

describe('chatParagraphSpacing', () => {
  let storageChangeListeners: StorageChangeListener[];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    document.head.innerHTML = '';
    document.body.innerHTML = '<main></main>';
    storageChangeListeners = [];

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (value: Record<string, unknown>) => void) => {
        callback({
          [StorageKeys.CHAT_PARAGRAPH_SPACING]: 10,
          [StorageKeys.CHAT_LINE_HEIGHT_ENABLED]: true,
        });
      },
    );

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: StorageChangeListener) => {
      storageChangeListeners.push(listener);
    });
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
  });

  it('applies spacing styles when enabled', async () => {
    const { startChatParagraphSpacingAdjuster } = await import('../index');
    startChatParagraphSpacingAdjuster();

    const text = getInjectedStyle()?.textContent ?? '';
    expect(text).toContain('margin-top: 10px !important');
    expect(text).toContain('margin-bottom: 10px !important');
  });

  it('does not inject styles when disabled', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (value: Record<string, unknown>) => void) => {
        callback({
          [StorageKeys.CHAT_PARAGRAPH_SPACING]: 10,
          [StorageKeys.CHAT_LINE_HEIGHT_ENABLED]: false,
        });
      },
    );

    const { startChatParagraphSpacingAdjuster } = await import('../index');
    startChatParagraphSpacingAdjuster();

    expect(getInjectedStyle()).toBeNull();
  });

  it('updates spacing when storage value changes', async () => {
    const { startChatParagraphSpacingAdjuster } = await import('../index');
    startChatParagraphSpacingAdjuster();

    storageChangeListeners[0](
      { [StorageKeys.CHAT_PARAGRAPH_SPACING]: { oldValue: 10, newValue: 4 } },
      'sync',
    );

    expect(getInjectedStyle()?.textContent).toContain('margin-top: 4px !important');
  });

  it('removes styles when toggled off', async () => {
    const { startChatParagraphSpacingAdjuster } = await import('../index');
    startChatParagraphSpacingAdjuster();

    storageChangeListeners[0](
      {
        [StorageKeys.CHAT_LINE_HEIGHT_ENABLED]: {
          oldValue: true,
          newValue: false,
        },
      },
      'sync',
    );

    expect(getInjectedStyle()).toBeNull();
  });

  it('clamps spacing and targets markdown blocks', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (value: Record<string, unknown>) => void) => {
        callback({
          [StorageKeys.CHAT_PARAGRAPH_SPACING]: 99,
          [StorageKeys.CHAT_LINE_HEIGHT_ENABLED]: true,
        });
      },
    );

    const { startChatParagraphSpacingAdjuster } = await import('../index');
    startChatParagraphSpacingAdjuster();

    const text = getInjectedStyle()?.textContent ?? '';
    expect(text).toContain('margin-top: 24px !important');
    expect(text).toContain('body message-content :is(p, ul, ol, pre, table, blockquote');
    expect(text).toContain('body [data-message-author-role="assistant"]');
  });
});
