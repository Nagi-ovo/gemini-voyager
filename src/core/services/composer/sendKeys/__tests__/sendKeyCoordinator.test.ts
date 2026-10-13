import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { createSendKeyCoordinator } from '../sendKeyCoordinator';

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;
type SyncCallback = (result: Record<string, unknown>) => void;

const storageListeners = new Set<StorageListener>();
let pendingReads: SyncCallback[] = [];

function emitCtrlEnterSend(newValue: unknown): void {
  for (const listener of storageListeners) {
    listener({ [StorageKeys.CTRL_ENTER_SEND]: { newValue } }, 'sync');
  }
}

function settleReads(result: Record<string, unknown>): void {
  const reads = pendingReads;
  pendingReads = [];
  reads.forEach((callback) => callback(result));
}

function mountGeminiComposer(): { input: HTMLElement; button: HTMLButtonElement } {
  const container = document.createElement('div');
  container.className = 'text-input-field';
  const input = document.createElement('div');
  input.setAttribute('contenteditable', 'true');
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Send message');
  Object.defineProperty(button, 'offsetParent', { configurable: true, value: document.body });
  container.append(input, button);
  document.body.append(container);
  return { input, button };
}

function pressEnter(target: HTMLElement, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  storageListeners.clear();
  pendingReads = [];
  vi.mocked(chrome.storage.onChanged.addListener).mockImplementation((listener) => {
    storageListeners.add(listener as StorageListener);
  });
  vi.mocked(chrome.storage.onChanged.removeListener).mockImplementation((listener) => {
    storageListeners.delete(listener as StorageListener);
  });
  (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_defaults: Record<string, unknown>, callback: SyncCallback) => {
      pendingReads.push(callback);
    },
  );
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: vi.fn(() => true),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('send key coordinator', () => {
  it.each([{ isComposing: true }, { keyCode: 229 }])(
    'does not send or insert a newline when confirming an IME candidate: %j',
    (modifiers) => {
      const { input, button } = mountGeminiComposer();
      const click = vi.spyOn(button, 'click');
      const coordinator = createSendKeyCoordinator('gemini');
      coordinator.registerMainMode({ source: 'test', mode: 'ctrlEnterSends' });
      expect(pressEnter(input, modifiers).defaultPrevented).toBe(false);
      expect(pressEnter(input, { ...modifiers, ctrlKey: true }).defaultPrevented).toBe(false);
      expect(click).not.toHaveBeenCalled();
      expect(document.execCommand).not.toHaveBeenCalled();
      coordinator.stop();
    },
  );

  it('skips a keydown that an earlier preparation listener already prevented', () => {
    const { input, button } = mountGeminiComposer();
    const click = vi.spyOn(button, 'click');
    const coordinator = createSendKeyCoordinator('gemini');
    coordinator.registerMainMode({ source: 'test', mode: 'ctrlEnterSends' });
    const prevent = (event: Event) => event.preventDefault();
    document.addEventListener('keydown', prevent, { capture: true });
    pressEnter(input, { ctrlKey: true });
    document.removeEventListener('keydown', prevent, { capture: true });
    expect(click).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it.each(['stop', 'disabled', 'upload'])(
    'does not click Gemini’s shared send wrapper while %s',
    (state) => {
      const { input, button } = mountGeminiComposer();
      const wrapper = document.createElement('gem-icon-button');
      wrapper.className = 'send-button';
      button.before(wrapper);
      wrapper.append(button);
      Object.defineProperty(wrapper, 'offsetParent', { configurable: true, value: document.body });
      if (state === 'stop') {
        wrapper.classList.add('stop');
        button.setAttribute('aria-label', 'Stop response');
        button.innerHTML = '<mat-icon fonticon="stop"></mat-icon>';
      } else if (state === 'disabled') button.disabled = true;
      else wrapper.parentElement!.append(document.createElement('progress'));
      const click = vi.fn((event: Event) => event.preventDefault());
      wrapper.addEventListener('click', click);
      const coordinator = createSendKeyCoordinator('gemini');
      coordinator.registerMainMode({ source: 'test', mode: 'ctrlEnterSends' });
      pressEnter(input, { ctrlKey: true });
      expect(click).not.toHaveBeenCalled();
      wrapper.classList.remove('stop');
      button.disabled = false;
      button.setAttribute('aria-label', 'Send message');
      button.innerHTML = '';
      wrapper.parentElement!.querySelector('progress')?.remove();
      pressEnter(input, { ctrlKey: true });
      expect(click).toHaveBeenCalledOnce();
      coordinator.stop();
    },
  );

  it('sends the edit Update without borrowing the main composer button', () => {
    const main = mountGeminiComposer();
    const container = document.createElement('div');
    container.className = 'user-query-container edit-mode';
    container.innerHTML =
      '<div class="edit-container"><div class="edit-form"><div class="edit-container"><rich-textarea><div contenteditable="true"></div></rich-textarea></div></div><div class="edit-button-area"><gem-button class="update-button"><button>Update</button></gem-button></div></div>';
    document.body.append(container);
    const input = container.querySelector<HTMLElement>('[contenteditable]')!;
    const button = container.querySelector<HTMLElement>('.update-button button')!;
    Object.defineProperty(container.querySelector('.update-button'), 'offsetParent', {
      configurable: true,
      value: document.body,
    });
    Object.defineProperty(button, 'offsetParent', { configurable: true, value: document.body });
    const click = vi.spyOn(button, 'click');
    const mainClick = vi.spyOn(main.button, 'click');
    const coordinator = createSendKeyCoordinator('gemini');
    coordinator.registerMainMode({ source: 'test', mode: 'ctrlEnterSends' });
    pressEnter(input, { ctrlKey: true });
    expect(click).toHaveBeenCalledOnce();
    expect(mainClick).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it('attaches no listener or observer while no send mode is registered', async () => {
    vi.useFakeTimers();
    const { input } = mountGeminiComposer();
    const addListener = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const removeListener = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const keydownAdds = () => addListener.mock.calls.filter(([type]) => type === 'keydown');

    const coordinator = createSendKeyCoordinator('gemini', { isSafari: () => false });
    settleReads({});
    // A Safari fallback outside Safari keeps the page untouched, like the legacy module.
    const releaseFallback = coordinator.registerSafariFallback({ source: 'test' });
    expect(keydownAdds()).toHaveLength(0);
    expect(observe).not.toHaveBeenCalled();

    const releaseMain = coordinator.registerMainMode({ source: 'test', mode: 'ctrlEnterSends' });
    expect(keydownAdds().map(([, , options]) => options)).toEqual([{ capture: true }]);
    expect(addListener.mock.instances[0]).toBe(input);
    expect(observe).toHaveBeenCalledTimes(1);

    // An input that streams in later is picked up after the debounce.
    const editBox = document.createElement('textarea');
    document.body.append(editBox);
    await vi.advanceTimersByTimeAsync(100);
    expect(keydownAdds()).toHaveLength(2);

    // Releasing mid-debounce drops the pending scan with it.
    document.body.append(document.createElement('textarea'));
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    releaseMain();
    expect(removeListener.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(2);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    releaseFallback();
    coordinator.stop();
    expect(storageListeners.size).toBe(0);
  });

  it('keeps the Safari fallback registered while the main send mode activates late', () => {
    const { input, button } = mountGeminiComposer();
    const click = vi.spyOn(button, 'click');
    const coordinator = createSendKeyCoordinator('gemini', { isSafari: () => true });
    settleReads({ [StorageKeys.CTRL_ENTER_SEND]: false });

    coordinator.registerSafariFallback({ source: 'safari-fix' });
    pressEnter(input);
    expect(click).toHaveBeenCalledTimes(1);
    // The fallback is not a send-key change other features should follow.
    expect(coordinator.effectiveSendKey()).toBe('host');

    const releaseMain = coordinator.registerMainMode({
      source: 'ctrl-enter',
      mode: 'ctrlEnterSends',
    });
    expect(coordinator.effectiveSendKey()).toBe('ctrlEnter');
    expect(pressEnter(input).defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    releaseMain();
    expect(coordinator.effectiveSendKey()).toBe('host');
    pressEnter(input);
    expect(click).toHaveBeenCalledTimes(2);

    coordinator.stop();
  });

  it('refuses a second main send mode instead of silently stacking it', () => {
    const coordinator = createSendKeyCoordinator('gemini', { isSafari: () => false });
    coordinator.registerMainMode({ source: 'first', mode: 'ctrlEnterSends' });

    expect(() =>
      coordinator.registerMainMode({ source: 'second', mode: 'ctrlEnterSends' }),
    ).toThrow(/second registered a main send mode while first holds it/);
    expect(() => coordinator.registerMainMode({ source: 'local', mode: 'enterSends' })).toThrow();
    expect(() =>
      createSendKeyCoordinator('aistudio').registerSafariFallback({ source: 'safari' }),
    ).toThrow();

    coordinator.stop();
  });

  it('keeps the newer Ctrl+Enter switch in the effective send key when the startup read lands late', async () => {
    const coordinator = createSendKeyCoordinator('gemini', { isSafari: () => false });
    const seen: string[] = [];
    coordinator.subscribeEffectiveSendKey((key) => seen.push(key));

    emitCtrlEnterSend(true);
    settleReads({ [StorageKeys.CTRL_ENTER_SEND]: false });
    await coordinator.whenReady();

    expect(coordinator.effectiveSendKey()).toBe('ctrlEnter');
    expect(seen).toEqual(['ctrlEnter']);

    emitCtrlEnterSend(false);
    expect(seen).toEqual(['ctrlEnter', 'host']);
    coordinator.stop();
  });

  it('ignores a late startup read and late registrations after the coordinator stops', async () => {
    const { input, button } = mountGeminiComposer();
    const click = vi.spyOn(button, 'click');
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const coordinator = createSendKeyCoordinator('gemini', { isSafari: () => true });
    const releaseFallback = coordinator.registerSafariFallback({ source: 'safari-fix' });
    const seen: string[] = [];
    coordinator.subscribeEffectiveSendKey((key) => seen.push(key));

    coordinator.stop();
    await expect(coordinator.whenReady()).resolves.toBeUndefined();
    settleReads({ [StorageKeys.CTRL_ENTER_SEND]: true });
    expect(coordinator.effectiveSendKey()).toBe('host');
    const releaseLate = coordinator.registerMainMode({ source: 'late', mode: 'ctrlEnterSends' });
    coordinator.registerSafariFallback({ source: 'late-safari' });
    releaseFallback();
    releaseLate();

    expect(pressEnter(input, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(pressEnter(input).defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
    expect(storageListeners.size).toBe(0);
  });

  it('reads no Gemini switch on AI Studio and is ready at once', async () => {
    const coordinator = createSendKeyCoordinator('aistudio');

    await expect(coordinator.whenReady()).resolves.toBeUndefined();
    expect(coordinator.effectiveSendKey()).toBeNull();
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(storageListeners.size).toBe(0);
    coordinator.stop();
  });
});
