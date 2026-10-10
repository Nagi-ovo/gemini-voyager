import { findChatInput } from './index';

interface FindVimInputOptions {
  requireVisible?: boolean;
  target?: HTMLElement | null;
}

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="textbox"]';
const EDIT_PROMPT_SELECTOR = [
  '.query-content.edit-mode textarea',
  '.edit-container textarea',
  'textarea[aria-label="Edit prompt"]',
  'textarea[aria-label="Edit message"]',
].join(',');
const SEND_BUTTON_SELECTOR = [
  '.update-button',
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
  'button[data-tooltip*="Send"]',
  'button[data-tooltip*="send"]',
  'button mat-icon[fonticon="send"]',
  '[data-send-button]',
  '.send-button',
  'button[aria-label*="Update"]',
  'button[aria-label*="Save"]',
  'button[aria-label*="更新"]',
].join(',');

/** Wrapper selectors may contain several hidden editors; prefer the rendered control. */
export function resolveConfiguredComposer(
  selector: string,
  options: { requireVisible?: boolean } = {},
  doc: Document = document,
): HTMLElement | null {
  const requireVisible = options.requireVisible ?? true;
  let fallback: HTMLElement | null = null;
  try {
    for (const element of Array.from(doc.querySelectorAll(selector))) {
      if (!(element instanceof HTMLElement)) continue;
      const editables = element.matches(EDITABLE_SELECTOR)
        ? [element]
        : Array.from(element.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR));
      for (const editable of editables) {
        if (!fallback) fallback = editable;
        if (isVisibleHudMount(editable)) return editable;
      }
    }
  } catch {
    // Invalid selector from a site file: fall back to the generic lookup.
    return null;
  }
  return requireVisible ? null : fallback;
}

export function isEditableTarget(element: HTMLElement | null): boolean {
  if (!element) return false;
  return element.matches(EDITABLE_SELECTOR) || Boolean(element.closest(EDITABLE_SELECTOR));
}

export function isEditPromptInput(element: HTMLElement): boolean {
  return element.matches(EDIT_PROMPT_SELECTOR);
}

export function getSendButtonTarget(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;

  const matched = element.closest(SEND_BUTTON_SELECTOR);
  if (!(matched instanceof HTMLElement)) return null;

  const button = matched.closest('button');
  return button instanceof HTMLElement ? button : matched;
}

function hasVisibleLayout(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isElementHidden(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return true;

  const style = window.getComputedStyle?.(element);
  return style?.display === 'none' || style?.visibility === 'hidden';
}

export function isVisibleHudMount(element: HTMLElement | null): element is HTMLElement {
  if (!element || !element.isConnected || isElementHidden(element)) return false;
  return hasVisibleLayout(element);
}

export function createVimInputTargets(getConfiguredSelector: () => string | null) {
  function locateChatInput(options: { requireVisible?: boolean } = {}): HTMLElement | null {
    const configuredComposerSelector = getConfiguredSelector();
    if (configuredComposerSelector) {
      const configured = resolveConfiguredComposer(configuredComposerSelector, options);
      if (configured) return configured;
    }
    return findChatInput(options);
  }

  function findEditPromptInput(requireVisible = true): HTMLElement | null {
    let fallback: HTMLElement | null = null;

    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>(EDIT_PROMPT_SELECTOR),
    )) {
      if (!fallback && element.isConnected) fallback = element;
      if (isVisibleHudMount(element)) return element;
    }

    return requireVisible ? null : fallback;
  }

  function findVimInputFromTarget(element: HTMLElement | null): HTMLElement | null {
    if (!element) return null;

    const editable = element.matches(EDITABLE_SELECTOR)
      ? element
      : element.closest<HTMLElement>(EDITABLE_SELECTOR);
    if (!editable) return null;

    if (isEditPromptInput(editable)) return editable;

    const input = locateChatInput({ requireVisible: false });
    return input && (editable === input || input.contains(editable)) ? input : null;
  }

  function findVimInput(options: FindVimInputOptions = {}): HTMLElement | null {
    const requireVisible = options.requireVisible ?? true;
    const activeElement =
      options.target ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const targetedInput = findVimInputFromTarget(activeElement);

    if (targetedInput && (!requireVisible || isVisibleHudMount(targetedInput))) {
      return targetedInput;
    }

    const editInput = findEditPromptInput(true);
    if (editInput) return editInput;

    const chatInput = locateChatInput();
    if (chatInput) return chatInput;

    if (requireVisible) return null;
    return findEditPromptInput(false) ?? locateChatInput({ requireVisible: false });
  }

  return { findVimInput, findVimInputFromTarget };
}
