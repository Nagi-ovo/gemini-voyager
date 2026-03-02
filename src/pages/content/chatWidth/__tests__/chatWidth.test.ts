import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STYLE_ID = 'gemini-voyager-chat-width';
const STORAGE_KEY = 'geminiChatWidth';

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

function getInjectedStyle(): HTMLStyleElement {
  const style = document.getElementById(STYLE_ID);
  expect(style).not.toBeNull();
  return style as HTMLStyleElement;
}

function expectTableRuleWidth(styleText: string, widthVw: number): void {
  const escapedWidth = widthVw.toString().replace('.', '\\.');
  const tableRulePattern = new RegExp(
    String.raw`\/\* Gemini table containers \*\/[\s\S]*table-block,[\s\S]*\.table-block,[\s\S]*\.table-block \.table-content[\s\S]*\{[\s\S]*max-width: ${escapedWidth}vw !important;[\s\S]*width: min\(100%, ${escapedWidth}vw\) !important;`,
  );
  expect(styleText).toMatch(tableRulePattern);
}

function expectSingleTableScrollbarRules(styleText: string): void {
  expect(styleText).toContain('.table-block.has-scrollbar');
  expect(styleText).toContain('.table-block.new-table-style');
  expect(styleText).toContain('overflow-x: hidden !important;');
  expect(styleText).toContain('.table-block .table-content');
  expect(styleText).toContain('overflow-x: auto !important;');
}

describe('chatWidth', () => {
  let storageChangeListeners: StorageChangeListener[];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    document.head.innerHTML = '';
    document.body.innerHTML = '<main></main>';

    storageChangeListeners = [];

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (value: Record<string, unknown>) => void) => {
        callback({ [STORAGE_KEY]: 85 });
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

  it('applies widescreen rules to Gemini table blocks', async () => {
    const { startChatWidthAdjuster } = await import('../index');
    startChatWidthAdjuster();

    const styleText = getInjectedStyle().textContent ?? '';

    expectTableRuleWidth(styleText, 85);
    expect(styleText).toContain('table-block .table-block');
    expect(styleText).toContain('.table-block.has-scrollbar');
    expect(styleText).toContain('.table-block.new-table-style');
    expect(styleText).toContain('.table-block .table-content');
    expectSingleTableScrollbarRules(styleText);
  });

  it('updates table widescreen rules when width setting changes', async () => {
    const { startChatWidthAdjuster } = await import('../index');
    startChatWidthAdjuster();

    expect(storageChangeListeners.length).toBeGreaterThan(0);

    storageChangeListeners[0]({ [STORAGE_KEY]: { oldValue: 85, newValue: 92 } }, 'sync');

    const styleText = getInjectedStyle().textContent ?? '';
    expectTableRuleWidth(styleText, 92);
    expect(styleText).toContain('table-block .table-content');
    expectSingleTableScrollbarRules(styleText);
  });
});
