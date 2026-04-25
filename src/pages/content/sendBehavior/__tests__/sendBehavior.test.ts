import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { getTextOffset, setCaretPosition } from '../utils';

// Mock browser detection for Safari Enter Fix tests
vi.mock('@/core/utils/browser', () => ({
  isSafari: vi.fn(() => false),
}));

function markElementVisible(element: HTMLElement): void {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    value: document.body,
  });
}

function firePlainEnter(target: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
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

function mockExecCommand(implementation: Document['execCommand']): ReturnType<typeof vi.fn> {
  const execCommand = vi.fn(implementation);
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: execCommand,
  });

  return execCommand;
}

function mockAnimationFrame(): ReturnType<typeof vi.fn> {
  const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback): number => {
    callback(16);
    return 1;
  });

  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
  return requestAnimationFrameMock;
}

function setSelection(node: Node, offset: number): void {
  const selection = window.getSelection();
  if (!selection) throw new Error('Selection API unavailable');

  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

function getSelectionRange(): Range {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) throw new Error('Selection range unavailable');
  return selection.getRangeAt(0);
}

function getTextNode(element: Element): Text {
  const node = element.firstChild;
  if (!(node instanceof Text)) throw new Error('Expected a text node');
  return node;
}

function createContentEditable(html: string): HTMLElement {
  const input = document.createElement('div');
  input.setAttribute('contenteditable', 'true');
  input.innerHTML = html;
  document.body.append(input);
  return input;
}

function splitCurrentParagraph(input: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) throw new Error('Selection range unavailable');

  const range = selection.getRangeAt(0);
  if (!(range.startContainer instanceof Text)) throw new Error('Expected text selection');

  const paragraph = range.startContainer.parentElement;
  if (!(paragraph instanceof HTMLParagraphElement)) throw new Error('Expected paragraph');

  const text = range.startContainer.textContent ?? '';
  const beforeText = text.slice(0, range.startOffset);
  const afterText = text.slice(range.startOffset);
  const beforeParagraph = document.createElement('p');
  const afterParagraph = document.createElement('p');

  beforeParagraph.textContent = beforeText;
  if (afterText.length > 0) {
    afterParagraph.textContent = afterText;
  } else {
    afterParagraph.append(document.createElement('br'));
  }

  paragraph.replaceWith(beforeParagraph, afterParagraph);

  // Simulate an editor/browser leaving the selection somewhere unhelpful; sendBehavior must restore it.
  setSelection(input, input.childNodes.length);
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
    vi.unstubAllGlobals();
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

  it('inserts a textarea newline through execCommand when the browser command succeeds', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 4;
    document.body.append(textarea);

    const inputSpy = vi.fn();
    textarea.addEventListener('input', inputSpy);

    const execCommand = mockExecCommand((command, _showUI, value) => {
      if (command !== 'insertText') return false;
      textarea.setRangeText(value ?? '', textarea.selectionStart, textarea.selectionEnd, 'end');
      return true;
    });

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const event = firePlainEnter(textarea);

    expect(execCommand).toHaveBeenCalledWith('insertText', false, '\n');
    expect(textarea.value).toBe('he\no');
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(3);
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    cleanup();
  });

  it('falls back to direct textarea assignment when insertText execCommand fails', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 4;
    document.body.append(textarea);

    const inputSpy = vi.fn();
    textarea.addEventListener('input', inputSpy);

    const execCommand = mockExecCommand(() => false);

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const event = firePlainEnter(textarea);

    expect(execCommand).toHaveBeenCalledWith('insertText', false, '\n');
    expect(textarea.value).toBe('he\no');
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(3);
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    cleanup();
  });

  it('uses insertParagraph for contenteditable newline insertion and creates a separate paragraph', async () => {
    mockAnimationFrame();

    const input = createContentEditable('<p>hello</p>');
    const paragraph = input.querySelector('p');
    if (!paragraph) throw new Error('Expected paragraph');

    setSelection(getTextNode(paragraph), 5);

    const execCommand = mockExecCommand((command) => {
      if (command !== 'insertParagraph') return false;
      splitCurrentParagraph(input);
      return true;
    });

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const event = firePlainEnter(input);

    expect(execCommand).toHaveBeenCalledWith('insertParagraph', false);
    expect(Array.from(input.children).map((child) => child.tagName)).toEqual(['P', 'P']);
    expect(input.children[0].textContent).toBe('hello');
    expect(input.children[1].innerHTML).toBe('<br>');
    expect(event.defaultPrevented).toBe(true);

    cleanup();
  });

  it('restores the caret after insertParagraph splits text in the middle', async () => {
    mockAnimationFrame();

    const input = createContentEditable('<p>hello world</p>');
    const paragraph = input.querySelector('p');
    if (!paragraph) throw new Error('Expected paragraph');

    setSelection(getTextNode(paragraph), 5);

    mockExecCommand((command) => {
      if (command !== 'insertParagraph') return false;
      splitCurrentParagraph(input);
      return true;
    });

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    firePlainEnter(input);

    const secondParagraph = input.children[1];
    const secondTextNode = getTextNode(secondParagraph);
    const selectionRange = getSelectionRange();

    expect(secondParagraph.textContent).toBe(' world');
    expect(selectionRange.startContainer).toBe(secondTextNode);
    expect(selectionRange.startOffset).toBe(0);
    expect(getTextOffset(input)).toBe(6);

    cleanup();
  });

  it('sets the caret inside an empty paragraph instead of falling back to the root end', () => {
    const input = createContentEditable('<p>hello</p><p><br></p>');
    const emptyParagraph = input.children[1];

    setCaretPosition(input, 6);

    const selectionRange = getSelectionRange();

    expect(selectionRange.startContainer).toBe(emptyParagraph);
    expect(selectionRange.startOffset).toBe(0);
    expect(getTextOffset(input)).toBe(6);
  });
});

describe('safariEnterFix', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '';

    // Enable Safari Enter Fix, disable Ctrl+Enter Send
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({
          [StorageKeys.CTRL_ENTER_SEND]: false,
          [StorageKeys.SAFARI_ENTER_FIX]: true,
        });
      },
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clicks send button on plain Enter when on Safari', async () => {
    // Mock isSafari to return true
    const { isSafari } = await import('@/core/utils/browser');
    (isSafari as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const inputContainer = document.createElement('div');
    inputContainer.className = 'text-input-field';

    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');

    const sendButton = document.createElement('button');
    sendButton.setAttribute('aria-label', 'Send message');
    markElementVisible(sendButton);

    inputContainer.append(input, sendButton);
    document.body.append(inputContainer);

    const sendClickSpy = vi.spyOn(sendButton, 'click');

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const event = firePlainEnter(input);

    expect(sendClickSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    cleanup();
  });

  it('does not click send button on plain Enter when not on Safari', async () => {
    // Mock isSafari to return false
    const { isSafari } = await import('@/core/utils/browser');
    (isSafari as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const inputContainer = document.createElement('div');
    inputContainer.className = 'text-input-field';

    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');

    const sendButton = document.createElement('button');
    sendButton.setAttribute('aria-label', 'Send message');
    markElementVisible(sendButton);

    inputContainer.append(input, sendButton);
    document.body.append(inputContainer);

    const sendClickSpy = vi.spyOn(sendButton, 'click');

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    const event = firePlainEnter(input);

    expect(sendClickSpy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    cleanup();
  });

  it('does not intercept Shift+Enter on Safari', async () => {
    const { isSafari } = await import('@/core/utils/browser');
    (isSafari as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const inputContainer = document.createElement('div');
    inputContainer.className = 'text-input-field';

    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');

    const sendButton = document.createElement('button');
    sendButton.setAttribute('aria-label', 'Send message');
    markElementVisible(sendButton);

    inputContainer.append(input, sendButton);
    document.body.append(inputContainer);

    const sendClickSpy = vi.spyOn(sendButton, 'click');

    const { startSendBehavior } = await import('../index');
    const cleanup = await startSendBehavior();

    // Fire Shift+Enter
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(sendClickSpy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    cleanup();
  });
});
