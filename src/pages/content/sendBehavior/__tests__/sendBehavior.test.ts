import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

function markElementVisible(element: HTMLElement): void {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    value: document.body,
  });
}

function fireCtrlEnter(target: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe('sendBehavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '';

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ [StorageKeys.CTRL_ENTER_SEND]: true });
      },
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clicks the send button within the main chat container, ignoring stale update buttons elsewhere', async () => {
    // Stale update button from a previous edit — outside the main input container
    const staleUpdateButton = document.createElement('button');
    staleUpdateButton.className = 'update-button';
    markElementVisible(staleUpdateButton);

    // Main chat input container (.text-input-field)
    const inputContainer = document.createElement('div');
    inputContainer.className = 'text-input-field';

    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');

    const sendButton = document.createElement('button');
    sendButton.setAttribute('aria-label', 'Send message');
    markElementVisible(sendButton);

    inputContainer.append(input, sendButton);
    document.body.append(staleUpdateButton, inputContainer);

    const staleClickSpy = vi.spyOn(staleUpdateButton, 'click');
    const sendClickSpy = vi.spyOn(sendButton, 'click');

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const event = fireCtrlEnter(input);

    expect(sendClickSpy).toHaveBeenCalledTimes(1);
    expect(staleClickSpy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);

    cleanup();
  });

  it('clicks the update button within an edit container (chat-message)', async () => {
    // Edit mode: input and update button are inside a chat-message element
    const chatMessage = document.createElement('chat-message');

    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');

    const updateButton = document.createElement('button');
    updateButton.className = 'update-button';
    markElementVisible(updateButton);

    chatMessage.append(input, updateButton);
    document.body.append(chatMessage);

    const updateClickSpy = vi.spyOn(updateButton, 'click');

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const event = fireCtrlEnter(input);

    expect(updateClickSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    cleanup();
  });

  it('does not click any button when no known container is found', async () => {
    // Input is in an unknown container — no .text-input-field, chat-message, etc.
    const unknownDiv = document.createElement('div');

    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');

    const randomButton = document.createElement('button');
    randomButton.setAttribute('aria-label', 'Send');
    markElementVisible(randomButton);

    unknownDiv.append(input);
    document.body.append(unknownDiv, randomButton);

    const buttonClickSpy = vi.spyOn(randomButton, 'click');

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const event = fireCtrlEnter(input);

    expect(buttonClickSpy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    cleanup();
  });
});
