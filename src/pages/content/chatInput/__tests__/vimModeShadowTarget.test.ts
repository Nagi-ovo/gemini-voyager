import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

function enableVimMode(): void {
  (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
      callback({ [StorageKeys.INPUT_VIM_MODE]: true });
    },
  );
}

function createQuestionInput(): HTMLElement {
  document.body.innerHTML = `
    <rich-textarea>
      <div id="question-input" contenteditable="true" role="textbox">hello</div>
    </rich-textarea>
  `;
  const input = document.getElementById('question-input')!;
  input.getBoundingClientRect = () =>
    ({ height: 24, width: 320, top: 0, left: 0, right: 320, bottom: 24 }) as DOMRect;
  input.focus = vi.fn();
  return input;
}

describe('input vim mode and shadow roots', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('lets i reach an input inside an extension panel shadow root', async () => {
    enableVimMode();
    const composer = createQuestionInput();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panelInput = document.createElement('input');
    host.attachShadow({ mode: 'open' }).appendChild(panelInput);
    panelInput.focus();

    const { startInputVimMode } = await import('../vimMode');
    const cleanup = await startInputVimMode();

    const event = new KeyboardEvent('keydown', {
      key: 'i',
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    panelInput.dispatchEvent(event);

    expect(composer.focus).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    cleanup();
  });
});
