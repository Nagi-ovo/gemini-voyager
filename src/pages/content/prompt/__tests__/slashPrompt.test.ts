import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

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
    expect(token.textContent).toBe('Translator');
    expect(token.dataset.gvPromptText).toBe('Translate the following text into Chinese.');
    expect(token.title).toBe('Translate the following text into Chinese.');
    expect(input.classList.contains('gv-pm-slash-contenteditable-hide-value')).toBe(false);
    expect(token.style.getPropertyValue('color')).toBe('rgb(11, 87, 208)');
    expect(token.style.getPropertyPriority('color')).toBe('important');
    const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
    expect(marker.classList.contains('gv-pm-slash-textarea-token-native')).toBe(true);
    expect(marker.style.left).toBe('20px');
    expect(marker.style.top).toBe('300px');
    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);

    token.dispatchEvent(new MouseEvent('mouseenter'));
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

  it('keeps an external marker when Gemini rebuilds the editor and sends the body', async () => {
    const input = createContentEditable('/review');
    input.addEventListener('input', () => {
      if (input.querySelector('.gv-pm-slash-token')) input.textContent = 'Code Review';
    });
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
    expect(marker.textContent).toBe('Code Review');
    expect(marker.classList.contains('gv-pm-slash-textarea-token-native')).toBe(false);
    marker.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.getElementById('gv-pm-slash-tooltip')?.textContent).toBe(
      'Review this code and report correctness issues.',
    );

    setRect(input, { left: 40, top: 180 });
    input.textContent = 'Code Review\n\nMy note';
    typeInto(input);
    expect(marker.style.left).toBe('40px');
    expect(marker.style.top).toBe('180px');

    let sentText = '';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') sentText = input.textContent || '';
    });
    press(input, 'Enter');
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(sentText).toContain('Review this code and report correctness issues.');
  });

  it('anchors the marker to a prompt range after preceding text and multiline reflow', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      'getBoundingClientRect',
    );
    let rangeRect = { left: 140, top: 220, right: 220, bottom: 246, width: 80, height: 26 };
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...rangeRect, x: rangeRect.left, y: rangeRect.top, toJSON: () => ({}) }),
    });

    try {
      const input = createContentEditable('Before /review');
      destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
      typeInto(input);
      press(input, 'Enter');

      const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
      expect(marker.style.left).toBe('140px');
      expect(marker.style.top).toBe('220px');

      rangeRect = { left: 156, top: 164, right: 236, bottom: 190, width: 80, height: 26 };
      input.textContent = 'Before Code Review\n\nMy note';
      typeInto(input);
      expect(marker.style.left).toBe('156px');
      expect(marker.style.top).toBe('164px');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('hides the marker when the prompt range is outside the editor viewport', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      'getBoundingClientRect',
    );
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 140,
        top: 220,
        right: 220,
        bottom: 246,
        width: 80,
        height: 26,
        x: 140,
        y: 220,
        toJSON: () => ({}),
      }),
    });

    try {
      const input = createContentEditable('/review');
      setRect(input, { top: 300, bottom: 360 });
      destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
      typeInto(input);
      press(input, 'Enter');

      const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
      expect(marker.hidden).toBe(true);

      setRect(input, { top: 180, bottom: 260 });
      typeInto(input);
      expect(marker.hidden).toBe(false);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('positions each rebuilt marker over its own prompt name', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      'getBoundingClientRect',
    );
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: Range) {
        const left = 100 + this.startOffset * 10;
        return {
          left,
          top: 180,
          right: left + 80,
          bottom: 206,
          width: 80,
          height: 26,
          x: left,
          y: 180,
          toJSON: () => ({}),
        };
      },
    });

    try {
      const input = createContentEditable('/trans');
      destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
      typeInto(input);
      press(input, 'Enter');

      input.append(document.createTextNode('/review'));
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      typeInto(input);
      press(input, 'Enter');

      input.textContent = 'Translator\u00a0Code Review\u00a0';
      typeInto(input);
      const markers = Array.from(
        document.querySelectorAll<HTMLElement>('.gv-pm-slash-textarea-token'),
      );

      expect(markers.map((marker) => marker.textContent)).toEqual(['Translator', 'Code Review']);
      expect(markers[0].style.left).toBe('100px');
      expect(markers[1].style.left).toBe('210px');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('copies typography from the rebuilt node that contains a mixed-script prompt name', () => {
    const metaPrompt: PromptItem = {
      id: 'meta',
      name: '元Prompt(杠杆)',
      text: 'Long meta prompt body.',
      tags: [],
      createdAt: 4,
    };
    const input = createContentEditable('/元');
    destroy = startPromptSlashCommand({ initialItems: [...prompts, metaPrompt] }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const paragraph = document.createElement('p');
    paragraph.style.fontFamily = 'serif';
    paragraph.style.fontSize = '19px';
    paragraph.style.fontWeight = '500';
    paragraph.style.lineHeight = '27px';
    paragraph.style.letterSpacing = '0.4px';
    paragraph.textContent = '元Prompt(杠杆)\u00a0';
    input.replaceChildren(paragraph);
    typeInto(input);

    const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
    expect(marker.style.fontFamily).toBe('serif');
    expect(marker.style.fontSize).toBe('19px');
    expect(marker.style.fontWeight).toBe('500');
    expect(marker.style.lineHeight).toBe('27px');
    expect(marker.style.letterSpacing).toBe('0.4px');
  });

  it('keeps a long prompt tooltip open while the pointer moves onto and scrolls it', () => {
    const hideGraceMs = 151;
    vi.useFakeTimers();
    try {
      const longText = Array.from({ length: 20 }, () => prompts[1].text).join('\n');
      const longPrompts = prompts.map((prompt) =>
        prompt.id === 'review' ? { ...prompt, text: longText } : prompt,
      );
      const input = createContentEditable('/review');
      destroy = startPromptSlashCommand({ initialItems: longPrompts }).destroy;
      typeInto(input);
      press(input, 'Enter');

      const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
      marker.dispatchEvent(new MouseEvent('mouseenter'));
      const tooltip = document.getElementById('gv-pm-slash-tooltip')!;
      marker.dispatchEvent(new MouseEvent('mouseleave'));
      tooltip.dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(hideGraceMs);

      expect(tooltip.classList.contains('gv-pm-slash-tooltip-visible')).toBe(true);
      tooltip.scrollTop = 120;
      expect(tooltip.scrollTop).toBe(120);
      tooltip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(tooltip.classList.contains('gv-pm-slash-tooltip-visible')).toBe(true);

      tooltip.dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(hideGraceMs);
      expect(tooltip.classList.contains('gv-pm-slash-tooltip-visible')).toBe(false);
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('repositions the marker when the editor grows without emitting an input event', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
    let resizeCallback: ResizeObserverCallback = () => {
      throw new Error('ResizeObserver callback was not registered');
    };
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    });

    try {
      const input = createContentEditable('/review');
      destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
      typeInto(input);
      press(input, 'Enter');

      setRect(input, { left: 52, top: 140 });
      resizeCallback([], {} as ResizeObserver);

      const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
      expect(marker.style.left).toBe('52px');
      expect(marker.style.top).toBe('140px');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'ResizeObserver', originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'ResizeObserver');
      }
    }
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

  it('closes completion immediately when the slash query is deleted', () => {
    const input = createContentEditable('/');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);

    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(false);

    const event = press(input, 'Backspace');

    expect(event.defaultPrevented).toBe(false);
    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });

  it('closes completion for beforeinput deletion commands', () => {
    const input = createContentEditable('/');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);

    const event = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentBackward',
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });

  it('reopens completion after deletion when the remaining text is still a slash query', () => {
    const input = createContentEditable('/trans');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);

    press(input, 'Backspace');
    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);

    input.textContent = '/tran';
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    typeInto(input);

    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(false);
    expect(document.getElementById('gv-pm-slash-list')?.textContent).toContain('Translator');
  });

  it('removes the external prompt marker when the editor content is deleted', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');
    expect(document.querySelector('.gv-pm-slash-textarea-token')).not.toBeNull();

    input.replaceChildren();
    typeInto(input);

    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
    expect(input.classList.contains('gv-pm-slash-contenteditable-hide-value')).toBe(false);
    expect(press(input, 'Enter').defaultPrevented).toBe(false);
  });

  it('removes the marker when Gemini replaces the editor after deleting a full selection', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');
    expect(document.querySelector('.gv-pm-slash-textarea-token')).not.toBeNull();

    const replacement = document.createElement('div');
    replacement.id = 'question-input';
    replacement.setAttribute('contenteditable', 'true');
    replacement.setAttribute('role', 'textbox');
    setRect(replacement);
    input.replaceWith(replacement);
    typeInto(replacement);

    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
    expect(press(replacement, 'Enter').defaultPrevented).toBe(false);
  });

  it('clears the marker before Ctrl+A Backspace deletes the editor content', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
    press(input, 'Backspace');

    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
    expect(input.classList.contains('gv-pm-slash-contenteditable-hide-value')).toBe(false);
  });

  it('updates the prompt anchor when text is inserted before its name', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      'getBoundingClientRect',
    );
    let capturedStartOffset = -1;
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: Range) {
        capturedStartOffset = this.startOffset;
        return {
          left: 120,
          top: 180,
          right: 200,
          bottom: 206,
          width: 80,
          height: 26,
          x: 120,
          y: 180,
          toJSON: () => ({}),
        };
      },
    });

    try {
      const input = createContentEditable('/review');
      destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
      typeInto(input);
      press(input, 'Enter');
      input.textContent = 'Before Code Review';
      typeInto(input);
      expect(capturedStartOffset).toBe(7);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('keeps visual spacing after a prompt and removes it atomically with Backspace', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    expect(input.textContent).toBe('Code Review\u00a0');
    const event = press(input, 'Backspace');

    expect(event.defaultPrevented).toBe(true);
    expect(input.textContent).toBe('');
    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
  });

  it('keeps the caret at the removed prompt when Gemini rebuilds the editor', async () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const token = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    const spacer = token.nextSibling!;
    token.before(document.createTextNode('Three '));
    spacer.after(document.createTextNode('after'));
    const caret = document.createRange();
    caret.setStartAfter(spacer);
    caret.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(caret);

    input.addEventListener('input', () => {
      const text = input.textContent || '';
      queueMicrotask(() => {
        input.textContent = text;
        const end = document.createRange();
        end.selectNodeContents(input);
        end.collapse(false);
        selection.removeAllRanges();
        selection.addRange(end);
      });
    });

    press(input, 'Backspace');
    await Promise.resolve();

    const prefix = selection.getRangeAt(0).cloneRange();
    prefix.selectNodeContents(input);
    prefix.setEnd(selection.focusNode!, selection.focusOffset);
    expect(input.textContent).toBe('Three after');
    expect(prefix.toString()).toBe('Three ');
  });

  it('does not remove the prompt when Backspace follows two line breaks', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const token = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    input.append(document.createElement('br'), document.createElement('br'));
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const event = press(input, 'Backspace');

    expect(event.defaultPrevented).toBe(false);
    expect(token.isConnected).toBe(true);
    expect(document.querySelector('.gv-pm-slash-textarea-token')).not.toBeNull();
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

    expect(sendEvent.defaultPrevented).toBe(true);
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.textContent).toContain('Review this code and report correctness issues.');
    expect(input.classList.contains('gv-pm-slash-contenteditable-hide-value')).toBe(false);
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

    expect(input.value.trimEnd()).toBe('Please Code Review');
    expect(document.querySelector('.gv-pm-slash-textarea-token')?.textContent).toBe('Code Review');
  });

  it('shows a selected prompt name in a textarea and expands its body only when sending', () => {
    document.body.innerHTML = '<div class="input-area"><textarea></textarea></div>';
    const input = document.querySelector('textarea')!;
    input.value = '/review';
    input.setSelectionRange(input.value.length, input.value.length);
    setRect(input);
    input.focus();
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);

    press(input, 'Enter');

    const token = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
    expect(input.value.trimEnd()).toBe('Code Review');
    expect(input.classList.contains('gv-pm-slash-textarea-hide-value')).toBe(true);
    expect(token.textContent).toBe('Code Review');

    token.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.getElementById('gv-pm-slash-tooltip')?.textContent).toBe(
      'Review this code and report correctness issues.',
    );

    press(input, 'Enter');
    expect(input.value.trimEnd()).toBe('Review this code and report correctness issues.');
    expect(input.classList.contains('gv-pm-slash-textarea-hide-value')).toBe(false);
  });

  it('removes a selected textarea prompt with one Backspace', () => {
    document.body.innerHTML = '<div class="input-area"><textarea></textarea></div>';
    const input = document.querySelector('textarea')!;
    input.value = '/review';
    input.setSelectionRange(input.value.length, input.value.length);
    setRect(input);
    input.focus();
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Tab');

    const event = press(input, 'Backspace');

    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe('');
    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
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
