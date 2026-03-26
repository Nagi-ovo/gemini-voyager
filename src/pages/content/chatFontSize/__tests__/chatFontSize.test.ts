import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STYLE_ID = 'gemini-voyager-chat-font-size';
const VALUE_KEY = 'gvChatFontSize';
const ENABLED_KEY = 'gvChatFontSizeEnabled';

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

function getInjectedStyle(): HTMLStyleElement | null {
  return document.getElementById(STYLE_ID) as HTMLStyleElement | null;
}

describe('chatFontSize', () => {
  let storageChangeListeners: StorageChangeListener[];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    document.head.innerHTML = '';
    document.body.innerHTML = '<main></main>';

    storageChangeListeners = [];

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (value: Record<string, unknown>) => void) => {
        callback({ [VALUE_KEY]: 120, [ENABLED_KEY]: true });
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

  it('applies font-size styles when enabled', async () => {
    const { startChatFontSizeAdjuster } = await import('../index');
    startChatFontSizeAdjuster();

    const style = getInjectedStyle();
    expect(style).not.toBeNull();
    const text = style!.textContent ?? '';
    expect(text).toContain('font-size: 120% !important');
  });

  it('does not inject styles when disabled', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (value: Record<string, unknown>) => void) => {
        callback({ [VALUE_KEY]: 120, [ENABLED_KEY]: false });
      },
    );

    const { startChatFontSizeAdjuster } = await import('../index');
    startChatFontSizeAdjuster();

    const style = getInjectedStyle();
    expect(style).toBeNull();
  });

  it('updates font size when storage value changes', async () => {
    const { startChatFontSizeAdjuster } = await import('../index');
    startChatFontSizeAdjuster();

    expect(storageChangeListeners.length).toBeGreaterThan(0);

    storageChangeListeners[0]({ [VALUE_KEY]: { oldValue: 120, newValue: 140 } }, 'sync');

    const style = getInjectedStyle();
    expect(style).not.toBeNull();
    const text = style!.textContent ?? '';
    expect(text).toContain('font-size: 140% !important');
  });

  it('removes styles when toggled off via storage change', async () => {
    const { startChatFontSizeAdjuster } = await import('../index');
    startChatFontSizeAdjuster();

    expect(getInjectedStyle()).not.toBeNull();

    storageChangeListeners[0]({ [ENABLED_KEY]: { oldValue: true, newValue: false } }, 'sync');

    expect(getInjectedStyle()).toBeNull();
  });

  it('clamps values to min/max range', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (value: Record<string, unknown>) => void) => {
        callback({ [VALUE_KEY]: 200, [ENABLED_KEY]: true });
      },
    );

    const { startChatFontSizeAdjuster } = await import('../index');
    startChatFontSizeAdjuster();

    const style = getInjectedStyle();
    expect(style).not.toBeNull();
    const text = style!.textContent ?? '';
    // 200 should be clamped to max 150
    expect(text).toContain('font-size: 150% !important');
  });

  it('targets inner text elements for user and model responses', async () => {
    const { startChatFontSizeAdjuster } = await import('../index');
    startChatFontSizeAdjuster();

    const text = getInjectedStyle()!.textContent ?? '';
    // User message inner selectors
    expect(text).toContain('.query-text');
    expect(text).toContain('.query-text-line');
    expect(text).toContain('.gds-body-l');
    // Model response inner selectors
    expect(text).toContain('message-content');
    expect(text).toContain('model-response .markdown');
    expect(text).toContain('.markdown-main-panel');
    // Block elements
    expect(text).toContain('model-response p');
    expect(text).toContain('message-content li');
  });
});
