import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

function markElementVisible(element: HTMLElement): void {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    value: document.body,
  });
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

  it('uses the active chat send button instead of unrelated update buttons when pressing ctrl+enter', async () => {
    const unrelatedUpdateButton = document.createElement('button');
    unrelatedUpdateButton.className = 'update-button';
    markElementVisible(unrelatedUpdateButton);

    const composer = document.createElement('div');
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');

    const activeSendButton = document.createElement('button');
    activeSendButton.setAttribute('aria-label', 'Send message');
    markElementVisible(activeSendButton);

    composer.append(input);
    document.body.append(unrelatedUpdateButton, composer, activeSendButton);

    const updateClickSpy = vi.spyOn(unrelatedUpdateButton, 'click');
    const sendClickSpy = vi.spyOn(activeSendButton, 'click');

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const ctrlEnterEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Enter',
      ctrlKey: true,
      key: 'Enter',
    });

    input.dispatchEvent(ctrlEnterEvent);

    expect(sendClickSpy).toHaveBeenCalledTimes(1);
    expect(updateClickSpy).not.toHaveBeenCalled();
    expect(ctrlEnterEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it('still uses a nearby update button in edit mode when pressing ctrl+enter', async () => {
    const editorContainer = document.createElement('div');
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');

    const nearbyUpdateButton = document.createElement('button');
    nearbyUpdateButton.className = 'update-button';
    markElementVisible(nearbyUpdateButton);

    editorContainer.append(input, nearbyUpdateButton);
    document.body.append(editorContainer);

    const updateClickSpy = vi.spyOn(nearbyUpdateButton, 'click');

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const ctrlEnterEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Enter',
      ctrlKey: true,
      key: 'Enter',
    });

    input.dispatchEvent(ctrlEnterEvent);

    expect(updateClickSpy).toHaveBeenCalledTimes(1);
    expect(ctrlEnterEvent.defaultPrevented).toBe(true);

    cleanup();
  });
});
