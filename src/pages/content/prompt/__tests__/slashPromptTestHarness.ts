import { afterEach, beforeEach } from 'vitest';

import type { PromptItem } from '@/core/types/sync';

export const prompts: PromptItem[] = [
  {
    id: 'translate',
    name: 'Translator',
    text: 'Translate the following text into Chinese.',
    tags: ['writing', 'language'],
    createdAt: 1,
  },
  {
    id: 'review',
    name: 'Code Review',
    text: 'Review this code and report correctness issues.',
    tags: ['code'],
    createdAt: 2,
  },
  {
    id: 'legacy',
    text: 'Legacy body without a name',
    tags: ['legacy'],
    createdAt: 3,
  },
];

export function setRect(element: HTMLElement, rect: Partial<DOMRect> = {}): void {
  element.getBoundingClientRect = () =>
    ({
      x: 20,
      y: 300,
      top: 300,
      left: 20,
      right: 420,
      bottom: 360,
      width: 400,
      height: 60,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;
}

/**
 * jsdom gives a Range a zero rect, and the completion is placed from the end of
 * the typed query, so it needs a real one to measure against.
 */
export function withQueryRect(run: () => void): void {
  const original = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 52,
      top: 80,
      right: 60,
      bottom: 102,
      width: 8,
      height: 22,
      x: 52,
      y: 80,
      toJSON: () => ({}),
    }),
  });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(Range.prototype, 'getBoundingClientRect', original);
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  }
}

export function createContentEditable(text: string): HTMLElement {
  document.body.innerHTML = `<rich-textarea><div id="question-input" contenteditable="true" role="textbox"></div></rich-textarea>`;
  const input = document.getElementById('question-input')!;
  input.textContent = text;
  setRect(input);
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return input;
}

export function typeInto(input: HTMLElement): void {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function press(
  input: HTMLElement,
  key: string,
  init: Omit<KeyboardEventInit, 'key'> = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    ...init,
    key,
    bubbles: true,
    cancelable: true,
  });
  input.dispatchEvent(event);
  return event;
}

export function useSlashTestHarness(cleanup?: () => void) {
  const owners: { destroy: () => void }[] = [];
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    cleanup?.();
    owners.reverse().forEach((owner) => owner.destroy());
    owners.length = 0;
    document.body.innerHTML = '';
  });
  return <T extends { destroy: () => void }>(owner: T): T => {
    owners.push(owner);
    return owner;
  };
}

export function createPreviewTargets(): {
  root: HTMLElement;
  option: HTMLElement;
  token: HTMLElement;
} {
  document.body.innerHTML =
    '<div id="gv-pm-slash-root"><button class="gv-pm-slash-option"></button></div><span class="gv-pm-slash-token"></span>';
  return {
    root: document.getElementById('gv-pm-slash-root')!,
    option: document.querySelector<HTMLElement>('.gv-pm-slash-option')!,
    token: document.querySelector<HTMLElement>('.gv-pm-slash-token')!,
  };
}

export function createTextarea(text: string): HTMLTextAreaElement {
  document.body.innerHTML = '<div class="input-area"><textarea></textarea></div>';
  const input = document.querySelector('textarea')!;
  input.value = text;
  input.setSelectionRange(text.length, text.length);
  setRect(input);
  input.focus();
  return input;
}
