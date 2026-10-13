import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startSendScope } from './sendScopeHarness';

vi.mock('@/core/utils/browser', () => ({
  isSafari: vi.fn(() => false),
}));

function markVisible(element: HTMLElement): void {
  Object.defineProperty(element, 'offsetParent', { configurable: true, value: document.body });
}

function pressEnter(target: HTMLElement, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
}

function mountComposer(
  containerTag: string,
  inputTag: 'div' | 'textarea',
  buttonLabel: string,
): { input: HTMLElement; button: HTMLButtonElement } {
  const container = document.createElement(containerTag);
  if (containerTag === 'div') container.className = 'text-input-field';
  const input = document.createElement(inputTag);
  if (inputTag === 'div') input.setAttribute('contenteditable', 'true');
  const button = document.createElement('button');
  button.setAttribute('aria-label', buttonLabel);
  markVisible(button);
  container.append(input, button);
  document.body.append(container);
  return { input, button };
}

function stubNewlineCommands(): ReturnType<typeof vi.fn> {
  const execCommand = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: execCommand,
  });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  return execCommand;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('send behavior parity on Gemini', () => {
  it('keeps Ctrl+Shift+Enter sending and Alt+Enter as a Voyager newline on Gemini', async () => {
    const execCommand = stubNewlineCommands();
    const { input, button } = mountComposer('div', 'div', 'Send message');
    const click = vi.spyOn(button, 'click');
    const { stop } = await startSendScope();

    const ctrlShift = pressEnter(input, { ctrlKey: true, shiftKey: true });
    expect(click).toHaveBeenCalledTimes(1);
    expect(ctrlShift.defaultPrevented).toBe(true);

    const metaEnter = pressEnter(input, { metaKey: true });
    expect(click).toHaveBeenCalledTimes(2);
    expect(metaEnter.defaultPrevented).toBe(true);

    const altEnter = pressEnter(input, { altKey: true });
    expect(altEnter.defaultPrevented).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('insertParagraph', false);

    const shiftEnter = pressEnter(input, { shiftKey: true });
    expect(shiftEnter.defaultPrevented).toBe(false);

    const plainEnter = pressEnter(input);
    expect(plainEnter.defaultPrevented).toBe(true);
    expect(execCommand).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);

    const composing = pressEnter(input, { ctrlKey: true, isComposing: true });
    expect(composing.defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledTimes(2);

    stop();
  });

  it('keeps folder project instruction injection ahead of the Gemini send key', async () => {
    const { input, button } = mountComposer('div', 'div', 'Send message');
    const order: string[] = [];
    const injectInstructions = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      input.textContent = `[instructions]\n${input.textContent ?? ''}`;
      order.push('inject');
    };
    document.addEventListener('keydown', injectInstructions, true);
    let sentText: string | null = null;
    button.addEventListener('click', () => {
      sentText = input.textContent;
      order.push('send');
    });
    input.textContent = 'hello';

    const { stop } = await startSendScope();
    pressEnter(input, { ctrlKey: true });

    expect(order).toEqual(['inject', 'send']);
    expect(sentText).toBe('[instructions]\nhello');

    stop();
    document.removeEventListener('keydown', injectInstructions, true);
  });

  it('lets a document-capture listener registered after the send owner still see Ctrl+Enter', async () => {
    const { input, button } = mountComposer('div', 'div', 'Send message');
    const click = vi.spyOn(button, 'click');

    const { stop } = await startSendScope();

    const seen: boolean[] = [];
    const lateReader = (event: KeyboardEvent): void => {
      seen.push(event.ctrlKey && !event.defaultPrevented);
    };
    document.addEventListener('keydown', lateReader, true);
    pressEnter(input, { ctrlKey: true });

    expect(seen).toEqual([true]);
    expect(click).toHaveBeenCalledTimes(1);

    stop();
    document.removeEventListener('keydown', lateReader, true);
  });

  it("sends a slash prompt's re-dispatched Ctrl+Enter", async () => {
    const { input, button } = mountComposer('div', 'div', 'Send message');
    const click = vi.spyOn(button, 'click');
    const { stop } = await startSendScope();

    // Slash prompt swallows the trusted key and replays a synthetic one without keyCode.
    const replay = pressEnter(input, { ctrlKey: true });

    expect(replay.isTrusted).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
    expect(replay.defaultPrevented).toBe(true);

    stop();
  });
});

describe('send behavior parity on AI Studio', () => {
  it('hands Shift+Enter and Alt+Enter to AI Studio in Enter-send mode', async () => {
    const execCommand = stubNewlineCommands();
    const { input, button } = mountComposer('ms-prompt-input-wrapper', 'textarea', 'Run prompt');
    const click = vi.spyOn(button, 'click');
    const { stop } = await startSendScope('aistudio');

    expect(pressEnter(input, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(pressEnter(input, { altKey: true }).defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();

    const ctrlShift = pressEnter(input, { ctrlKey: true, shiftKey: true });
    expect(ctrlShift.defaultPrevented).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('insertText', false, '\n');
    expect(click).not.toHaveBeenCalled();

    const plainEnter = pressEnter(input);
    expect(plainEnter.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    stop();
  });
});

describe('send behavior parity for the Safari Enter fix', () => {
  it('lets Ctrl+Enter send win over the Safari Enter fix when both are on', async () => {
    const { isSafari } = await import('@/core/utils/browser');
    vi.mocked(isSafari).mockReturnValue(true);
    const execCommand = stubNewlineCommands();
    const { input, button } = mountComposer('div', 'div', 'Send message');
    const click = vi.spyOn(button, 'click');
    const { stop, stopMain } = await startSendScope('gemini', { safari: true });

    pressEnter(input);
    expect(click).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('insertParagraph', false);

    pressEnter(input, { ctrlKey: true });
    expect(click).toHaveBeenCalledTimes(1);

    // Turning Ctrl+Enter off live hands plain Enter back to the Safari fix.
    await stopMain();
    pressEnter(input);
    expect(click).toHaveBeenCalledTimes(2);
    expect(pressEnter(input, { altKey: true }).defaultPrevented).toBe(false);

    stop();
    vi.mocked(isSafari).mockReturnValue(false);
  });
});

describe('send behavior on the page coordinator', () => {
  it('registers on the page coordinator and leaves it running after its own stop', async () => {
    const { input, button } = mountComposer('div', 'div', 'Send message');
    const click = vi.spyOn(button, 'click');
    const { startSendKeyCoordinator } =
      await import('@/core/services/composer/sendKeys/sendKeyCoordinator');
    const page = startSendKeyCoordinator('gemini');
    const { stop } = await startSendScope('gemini', { coordinator: page });

    pressEnter(input, { ctrlKey: true });
    expect(click).toHaveBeenCalledTimes(1);

    stop();
    expect(pressEnter(input, { ctrlKey: true }).defaultPrevented).toBe(false);
    // The page coordinator is still alive for the next owner.
    page.registerMainMode({ source: 'next-owner', mode: 'ctrlEnterSends' });
    pressEnter(input, { ctrlKey: true });
    expect(click).toHaveBeenCalledTimes(2);
    page.stop();
  });

  it('attaches nothing for a send behavior that starts after the page coordinator stopped', async () => {
    const { input, button } = mountComposer('div', 'div', 'Send message');
    const click = vi.spyOn(button, 'click');
    const { startSendKeyCoordinator } =
      await import('@/core/services/composer/sendKeys/sendKeyCoordinator');
    const page = startSendKeyCoordinator('gemini');
    page.stop();
    const { stop } = await startSendScope('gemini', { coordinator: page, safari: true });

    expect(pressEnter(input, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
    stop();
  });
});
