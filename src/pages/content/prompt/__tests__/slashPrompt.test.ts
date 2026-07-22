import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PromptItem } from '@/core/types/sync';

import { matchSlashPrompts, startPromptSlashCommand } from '../slashPrompt';

const prompts: PromptItem[] = [
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

function setRect(element: HTMLElement, rect: Partial<DOMRect> = {}): void {
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

function createContentEditable(text: string): HTMLElement {
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

function typeInto(input: HTMLElement): void {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(input: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  return event;
}

describe('matchSlashPrompts', () => {
  it('matches only prompt names and excludes legacy prompts without names', () => {
    expect(matchSlashPrompts(prompts, 'review').map((item) => item.id)).toEqual(['review']);
    expect(matchSlashPrompts(prompts, 'correctness')).toEqual([]);
    expect(matchSlashPrompts(prompts, 'legacy')).toEqual([]);
  });
});

describe('slash prompt completion', () => {
  let destroy: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    destroy?.();
    destroy = null;
    document.body.innerHTML = '';
  });

  it('shows only matching names and tags, with the body in a hover tooltip', () => {
    const input = createContentEditable('/trans');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;

    typeInto(input);

    const list = document.getElementById('gv-pm-slash-list')!;
    expect(list.textContent).toContain('Translator');
    expect(list.textContent).toContain('writing');
    expect(list.textContent).toContain('language');
    expect(list.textContent).not.toContain('Translate the following');
    expect(list.textContent).not.toContain('Code Review');

    const option = list.querySelector<HTMLElement>('.gv-pm-slash-option')!;
    option.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.getElementById('gv-pm-slash-tooltip')?.textContent).toBe(
      'Translate the following text into Chinese.',
    );
  });

  it('confirms with Enter and renders an inline name token backed by the prompt body', () => {
    const input = createContentEditable('/trans');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);

    const event = press(input, 'Enter');

    expect(event.defaultPrevented).toBe(true);
    const token = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    expect(token.dataset.gvPromptName).toBe('Translator');
    expect(token.textContent).toBe('Translate the following text into Chinese.');
    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);

    token.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(document.getElementById('gv-pm-slash-tooltip')?.textContent).toBe(
      'Translate the following text into Chinese.',
    );
  });

  it('does not reopen completion for a slash contained inside a selected prompt body', () => {
    const input = createContentEditable('/review');
    const withPath = prompts.map((prompt) =>
      prompt.id === 'review' ? { ...prompt, text: 'Review https://example.com/a/b.' } : prompt,
    );
    destroy = startPromptSlashCommand({ initialItems: withPath }).destroy;
    typeInto(input);
    press(input, 'Enter');

    typeInto(input);

    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });

  it('supports arrow navigation and Tab confirmation', () => {
    const input = createContentEditable('/');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);

    press(input, 'ArrowDown');
    const event = press(input, 'Tab');

    expect(event.defaultPrevented).toBe(true);
    expect(input.querySelector<HTMLElement>('.gv-pm-slash-token')?.dataset.gvPromptName).toBe(
      'Translator',
    );
  });

  it('confirms with a left mouse press without moving the editor selection', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);

    const option = document.querySelector<HTMLElement>('.gv-pm-slash-option')!;
    option.dispatchEvent(
      new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }),
    );

    expect(input.querySelector<HTMLElement>('.gv-pm-slash-token')?.dataset.gvPromptName).toBe(
      'Code Review',
    );
  });

  it('unwraps inline tokens to plain prompt text before a send Enter reaches the host page', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const sendEvent = press(input, 'Enter');

    expect(sendEvent.defaultPrevented).toBe(false);
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.textContent).toContain('Review this code and report correctness issues.');
  });

  it('unwraps inline tokens before a programmatic send-button click', () => {
    const input = createContentEditable('/review');
    const send = document.createElement('button');
    send.setAttribute('aria-label', 'Send message');
    document.body.appendChild(send);
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    send.click();

    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.textContent).toContain('Review this code and report correctness issues.');
  });

  it('unwraps tokens only when their chat form is submitted', () => {
    document.body.innerHTML =
      '<form id="chat-form"><rich-textarea><div id="question-input" contenteditable="true" role="textbox"></div></rich-textarea></form>';
    const input = document.getElementById('question-input')!;
    input.textContent = '/review';
    setRect(input);
    input.focus();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const chatForm = document.getElementById('chat-form')!;
    const unrelatedForm = document.createElement('form');
    document.body.appendChild(unrelatedForm);
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');
    expect(input.querySelector('.gv-pm-slash-token')).not.toBeNull();

    unrelatedForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(input.querySelector('.gv-pm-slash-token')).not.toBeNull();

    chatForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.textContent).toContain('Review this code and report correctness issues.');
  });

  it('replaces a textarea query and keeps a hoverable name marker inside the composer', () => {
    document.body.innerHTML = '<div class="input-area"><textarea></textarea></div>';
    const input = document.querySelector('textarea')!;
    input.value = 'Please /review';
    input.setSelectionRange(input.value.length, input.value.length);
    setRect(input);
    input.focus();
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);

    press(input, 'Tab');

    expect(input.value).toBe('Please Review this code and report correctness issues.');
    expect(document.querySelector('.gv-pm-slash-textarea-token')?.textContent).toBe('Code Review');
  });

  it('ignores the Prompt Manager form textarea', () => {
    document.body.innerHTML = `
      <div class="gv-pm-panel"><textarea class="gv-pm-input-text"></textarea></div>
      <rich-textarea><div id="question-input" contenteditable="true" role="textbox"></div></rich-textarea>
    `;
    const promptTextarea = document.querySelector<HTMLTextAreaElement>('.gv-pm-input-text')!;
    promptTextarea.value = '/review';
    const chatInput = document.getElementById('question-input')!;
    setRect(chatInput);
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;

    typeInto(promptTextarea);

    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });
});
