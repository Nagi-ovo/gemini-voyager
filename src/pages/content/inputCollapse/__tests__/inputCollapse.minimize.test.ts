import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

vi.mock('../../../../utils/i18n', () => ({
  getTranslationSync: (key: string) =>
    key === 'inputCollapsePlaceholder' ? 'Message Gemini' : key,
}));

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

function createInputContainer(): HTMLElement {
  const container = document.createElement('div');
  container.style.backgroundColor = 'rgb(240, 244, 249)';

  const richTextarea = document.createElement('rich-textarea');
  const editor = document.createElement('div');
  editor.className = 'ql-editor';
  editor.setAttribute('contenteditable', 'true');
  richTextarea.appendChild(editor);
  container.appendChild(richTextarea);
  document.body.appendChild(container);

  return container;
}

describe('inputCollapse minimize mode', () => {
  let storageChangeListener: StorageChangeListener | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    storageChangeListener = null;

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({
          gvInputCollapseEnabled: true,
          gvInputMinCollapseEnabled: true,
        });
      },
    );

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: StorageChangeListener) => {
      storageChangeListener = listener;
    });
  });

  afterEach(() => {
    storageChangeListener?.(
      {
        gvInputCollapseEnabled: { oldValue: true, newValue: false } as chrome.storage.StorageChange,
      },
      'sync',
    );
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  async function initAndCollapse({
    minCollapseEnabled = true,
  }: { minCollapseEnabled?: boolean } = {}): Promise<HTMLElement> {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({
          gvInputCollapseEnabled: true,
          gvInputMinCollapseEnabled: minCollapseEnabled,
        });
      },
    );

    const container = createInputContainer();
    const { startInputCollapse } = await import('../index');
    startInputCollapse();

    // Trigger observer once and flush collapse timeout.
    document.body.appendChild(document.createElement('div'));
    await Promise.resolve();
    vi.advanceTimersByTime(200);

    return container;
  }

  it('applies minimized collapse class when enabled', async () => {
    const container = await initAndCollapse({ minCollapseEnabled: true });
    expect(container.classList.contains('gv-input-collapsed')).toBe(true);
    expect(container.classList.contains('gv-input-min-collapsed')).toBe(true);
  });

  it('double Enter expands the minimized input', async () => {
    const container = await initAndCollapse({ minCollapseEnabled: true });
    expect(container.classList.contains('gv-input-min-collapsed')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(container.classList.contains('gv-input-collapsed')).toBe(false);
    expect(container.classList.contains('gv-input-min-collapsed')).toBe(false);
  });

  it('does not expand on double Enter when minimized mode is disabled', async () => {
    const container = await initAndCollapse({ minCollapseEnabled: true });
    expect(container.classList.contains('gv-input-collapsed')).toBe(true);
    expect(container.classList.contains('gv-input-min-collapsed')).toBe(true);

    storageChangeListener?.(
      {
        gvInputMinCollapseEnabled: {
          oldValue: true,
          newValue: false,
        } as chrome.storage.StorageChange,
      },
      'sync',
    );
    expect(container.classList.contains('gv-input-min-collapsed')).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(container.classList.contains('gv-input-collapsed')).toBe(true);
  });

  it('adds minimized class immediately when toggle switches on for already-collapsed input', async () => {
    const container = await initAndCollapse({ minCollapseEnabled: false });
    expect(container.classList.contains('gv-input-collapsed')).toBe(true);
    expect(container.classList.contains('gv-input-min-collapsed')).toBe(false);

    storageChangeListener?.(
      {
        gvInputMinCollapseEnabled: {
          oldValue: false,
          newValue: true,
        } as chrome.storage.StorageChange,
      },
      'sync',
    );

    expect(container.classList.contains('gv-input-min-collapsed')).toBe(true);
  });

  it('cleans up collapse classes when main toggle is disabled', async () => {
    const container = await initAndCollapse({ minCollapseEnabled: true });
    expect(container.classList.contains('gv-input-min-collapsed')).toBe(true);
    expect(storageChangeListener).not.toBeNull();

    storageChangeListener?.(
      {
        gvInputCollapseEnabled: { oldValue: true, newValue: false } as chrome.storage.StorageChange,
      },
      'sync',
    );

    expect(container.classList.contains('gv-input-collapsed')).toBe(false);
    expect(container.classList.contains('gv-input-min-collapsed')).toBe(false);
  });
});
