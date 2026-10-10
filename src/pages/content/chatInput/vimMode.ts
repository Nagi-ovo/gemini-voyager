import { StorageKeys } from '@/core/types/common';
import { composedTargetElement } from '@/core/utils/composedTarget';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { expandInputWithCursorAtEnd } from '../inputCollapse';
import { createVimCommands, shouldIgnoreKey } from './vimCommands';
import type { VimMode } from './vimCommands';
import { createVimEditor, getInputText, getCaretOffset } from './vimDomEditor';
import { createVimInputTargets, isEditableTarget, getSendButtonTarget } from './vimInputTargets';
import { scrollCaretIntoView } from './vimLayout';
import { createVimPresentation } from './vimPresentation';

interface StartInputVimModeOptions {
  /** PluginHost owns enable/disable state on third-party platforms. */
  forceEnabled?: boolean;
  /**
   * Site-specific composer selector (the `vimInput` primitive passes the
   * adapter's `composer` semantic selector or a plugin param). Tried before the
   * generic chat-input list so a platform Voyager has no hard-coded selector
   * for still gets Vim on the right element.
   */
  composerSelector?: string;
}

let configuredComposerSelector: string | null = null;

const MODE_CLASS_PREFIX = 'gv-input-vim-mode-';
const SEND_RECONCILE_DELAY_MS = 80;
const SEND_RECONCILE_ATTEMPTS = 8;

let isEnabled = false;
let isListenerActive = false;
let activeInput: HTMLElement | null = null;
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
let clickHandler: ((event: MouseEvent) => void) | null = null;
let focusInHandler: ((event: FocusEvent) => void) | null = null;
let focusOutHandler: ((event: FocusEvent) => void) | null = null;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
let sendReconcileTimer: number | null = null;

const { findVimInput, findVimInputFromTarget } = createVimInputTargets(
  () => configuredComposerSelector,
);
const view = createVimPresentation(
  () => ({
    activeInput,
    isEnabled,
    mode: commands.mode,
    buffer: commands.buffer,
    composerSelector: configuredComposerSelector,
  }),
  findVimInput,
);
const editor = createVimEditor((input, offset) => {
  scrollCaretIntoView(input, offset);
  view.scheduleCursorUpdate();
});
const commands = createVimCommands(editor, () => activeInput, {
  modeChanged: () => {
    updateInputModeClasses();
    view.updateHud();
    view.scheduleCursorUpdate();
  },
  commandChanged: () => view.updateHud(),
});

function setActiveInput(input: HTMLElement | null): void {
  if (activeInput === input) return;

  if (activeInput) {
    activeInput.classList.remove(
      `${MODE_CLASS_PREFIX}insert`,
      `${MODE_CLASS_PREFIX}normal`,
      `${MODE_CLASS_PREFIX}visual`,
    );
    delete activeInput.dataset.gvVimMode;
  }

  activeInput = input;
  commands.resetCommandState();
  editor.clearUndoStack();

  if (input) {
    commands.enterMode('insert');
  } else {
    view.hideCursor();
    view.updateHud();
  }
}

function clearSendReconcileTimer(): void {
  if (sendReconcileTimer !== null) {
    clearTimeout(sendReconcileTimer);
    sendReconcileTimer = null;
  }
}

function returnToInsertAfterSubmit(input: HTMLElement | null): void {
  const nextInput =
    (input?.isConnected ? input : null) ??
    findVimInput() ??
    findVimInput({ requireVisible: false });

  if (!nextInput) {
    setActiveInput(null);
    return;
  }

  if (activeInput !== nextInput) {
    setActiveInput(nextInput);
  }

  commands.resetCommandState();
  editor.clearUndoStack();
  commands.enterMode('insert');
  view.scheduleCursorUpdate();
}

function reconcilePossibleSend(input: HTMLElement, previousText: string, attempt = 0): void {
  if (!activeInput || !input.isConnected) {
    clearSendReconcileTimer();
    setActiveInput(null);
    return;
  }

  const currentInput = findVimInput() ?? findVimInput({ requireVisible: false });
  const inputChanged = Boolean(currentInput && currentInput !== input);
  const becameEmpty = previousText.trim().length > 0 && getInputText(input).trim().length === 0;

  if (inputChanged || becameEmpty) {
    clearSendReconcileTimer();
    returnToInsertAfterSubmit(currentInput ?? input);
    return;
  }

  if (attempt >= SEND_RECONCILE_ATTEMPTS) {
    clearSendReconcileTimer();
    return;
  }

  sendReconcileTimer = window.setTimeout(() => {
    sendReconcileTimer = null;
    reconcilePossibleSend(input, previousText, attempt + 1);
  }, SEND_RECONCILE_DELAY_MS);
}

function scheduleSendReconcile(input: HTMLElement | null): void {
  if (!input) return;

  const previousText = getInputText(input);
  if (previousText.trim().length === 0) return;

  clearSendReconcileTimer();
  sendReconcileTimer = window.setTimeout(() => {
    sendReconcileTimer = null;
    reconcilePossibleSend(input, previousText);
  }, SEND_RECONCILE_DELAY_MS);
}

function focusElement(input: HTMLElement): void {
  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }
}

function focusVimInput(mode: VimMode = 'insert'): boolean {
  let input = findVimInput();
  if (!input) {
    expandInputWithCursorAtEnd();
    input = findVimInput() ?? findVimInput({ requireVisible: false });
  }

  if (!input) return false;

  setActiveInput(input);
  focusElement(input);
  editor.setInputSelection(input, getCaretOffset(input));
  commands.enterMode(mode);
  return true;
}

function updateInputModeClasses(): void {
  if (!activeInput) return;

  activeInput.classList.toggle(`${MODE_CLASS_PREFIX}insert`, commands.mode === 'insert');
  activeInput.classList.toggle(`${MODE_CLASS_PREFIX}normal`, commands.mode === 'normal');
  activeInput.classList.toggle(`${MODE_CLASS_PREFIX}visual`, commands.mode === 'visual');
  activeInput.dataset.gvVimMode = commands.mode;
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!isEnabled || shouldIgnoreKey(event)) return;

  // Read through shadow hosts so typing in an extension panel stays typing.
  const target = composedTargetElement(event);

  if (!activeInput && event.key === 'i' && !event.shiftKey && !isEditableTarget(target)) {
    if (focusVimInput('insert')) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  const targetInput = findVimInputFromTarget(target);
  if (!activeInput && targetInput) {
    setActiveInput(targetInput);
  }

  if (!activeInput || targetInput !== activeInput) return;

  if (commands.isRepeatBlocked(event)) {
    event.preventDefault();
    event.stopPropagation();
    view.scheduleCursorUpdate();
    return;
  }

  if (event.key === 'Enter') {
    scheduleSendReconcile(activeInput);
  }

  const result = commands.handleKey(event, activeInput);
  if (result) {
    event.preventDefault();
    event.stopPropagation();
    if (result === 'command') {
      updateInputModeClasses();
      view.updateHud();
    }
    view.scheduleCursorUpdate();
  }
}

function handleClick(event: MouseEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!getSendButtonTarget(target)) return;

  scheduleSendReconcile(activeInput ?? findVimInput() ?? findVimInput({ requireVisible: false }));
}

function handleFocusIn(event: FocusEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const input = findVimInputFromTarget(target);
  if (!input) return;

  setActiveInput(input);
}

function handleFocusOut(event: FocusEvent): void {
  if (!activeInput) return;
  const nextFocus = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;

  if (nextFocus && activeInput.contains(nextFocus)) return;

  window.setTimeout(() => {
    if (!activeInput) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeInput.contains(activeElement)) return;
    setActiveInput(null);
  }, 0);
}

function activateListener(): void {
  if (isListenerActive) return;

  keydownHandler = handleKeyDown;
  clickHandler = handleClick;
  focusInHandler = handleFocusIn;
  focusOutHandler = handleFocusOut;

  window.addEventListener('keydown', keydownHandler, { capture: true });
  document.addEventListener('click', clickHandler, { capture: true });
  document.addEventListener('focusin', focusInHandler, { capture: true });
  document.addEventListener('focusout', focusOutHandler, { capture: true });
  view.start();
  isListenerActive = true;
  const focused = document.activeElement;
  if (focused instanceof HTMLElement) setActiveInput(findVimInputFromTarget(focused));
}

function deactivateListener(): void {
  if (!isListenerActive) return;

  if (keydownHandler) window.removeEventListener('keydown', keydownHandler, { capture: true });
  if (clickHandler) document.removeEventListener('click', clickHandler, { capture: true });
  if (focusInHandler) document.removeEventListener('focusin', focusInHandler, { capture: true });
  if (focusOutHandler) document.removeEventListener('focusout', focusOutHandler, { capture: true });
  view.pause();
  clearSendReconcileTimer();

  setActiveInput(null);
  view.hideCursor();
  isListenerActive = false;
  keydownHandler = null;
  clickHandler = null;
  focusInHandler = null;
  focusOutHandler = null;
}

function reconcileListener(): void {
  if (isEnabled) {
    activateListener();
  } else {
    deactivateListener();
  }
}

async function loadSettings(): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.sync?.get) {
        resolve();
        return;
      }

      chrome.storage.sync.get({ [StorageKeys.INPUT_VIM_MODE]: false }, (result) => {
        isEnabled = result?.[StorageKeys.INPUT_VIM_MODE] === true;
        resolve();
      });
    } catch (error) {
      if (!isExtensionContextInvalidatedError(error)) {
        console.warn('[InputVimMode] Failed to load settings:', error);
      }
      resolve();
    }
  });
}

function setupStorageListener(): void {
  if (storageListener) return;

  storageListener = (changes, areaName) => {
    if (areaName !== 'sync' || !(StorageKeys.INPUT_VIM_MODE in changes)) return;

    isEnabled = changes[StorageKeys.INPUT_VIM_MODE].newValue === true;
    reconcileListener();
  };

  try {
    if (typeof chrome !== 'undefined') {
      chrome.storage?.onChanged?.addListener(storageListener);
    }
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      console.warn('[InputVimMode] Failed to setup storage listener:', error);
    }
  }
}

function cleanup(): void {
  configuredComposerSelector = null;
  isEnabled = false;
  deactivateListener();
  editor.clearUndoStack();

  if (storageListener) {
    try {
      if (typeof chrome !== 'undefined') {
        chrome.storage?.onChanged?.removeListener(storageListener);
      }
    } catch {
      // Ignore cleanup errors.
    }
    storageListener = null;
  }

  view.dispose();
}

export async function startInputVimMode(
  options: StartInputVimModeOptions = {},
): Promise<() => void> {
  configuredComposerSelector = options.composerSelector?.trim() || null;
  if (options.forceEnabled) {
    isEnabled = true;
  } else {
    setupStorageListener();
    await loadSettings();
  }
  reconcileListener();

  return cleanup;
}
