import { describe, expect, it } from 'vitest';

import { startPromptSlashCommand } from '../slashPrompt';
import {
  createContentEditable,
  setRect,
  typeInto,
  press,
  prompts,
  createTextarea,
  useSlashTestHarness,
} from './slashPromptTestHarness';

describe('slashPromptEditing', () => {
  let destroy: (() => void) | null = null;
  useSlashTestHarness(() => {
    destroy?.();
    destroy = null;
  });

  it('keeps the caret visible at the input start when Home is pressed after selection', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const token = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    const event = press(input, 'Home');
    const range = window.getSelection()!.getRangeAt(0);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(range.collapsed).toBe(true);
    expect(token.contains(range.startContainer)).toBe(false);
    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(input);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    expect(prefixRange.toString()).toBe('');
  });

  it('removes the external prompt marker when the editor content is deleted', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
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
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
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
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
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

  it('removes the prompt spacer before removing the prompt with Backspace', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    expect(input.textContent).toBe('Code Review\u00a0');
    const spacerEvent = press(input, 'Backspace');

    expect(spacerEvent.defaultPrevented).toBe(true);
    expect(input.textContent).toBe('Code Review');
    expect(input.querySelector('.gv-pm-slash-token')).not.toBeNull();
    expect(document.querySelector('.gv-pm-slash-textarea-token')).not.toBeNull();
    expect(document.activeElement).toBe(input);

    const promptEvent = press(input, 'Backspace');

    expect(promptEvent.defaultPrevented).toBe(true);
    expect(input.textContent).toBe('');
    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
  });

  it('does not treat matching ordinary text after a rebuilt prompt as an atomic prompt', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const token = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    token.replaceWith(document.createTextNode(token.textContent || ''));
    input.append(document.createTextNode('Code Review'));
    const caret = document.createRange();
    caret.selectNodeContents(input);
    caret.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(caret);
    typeInto(input);

    const backspaceEvent = press(input, 'Backspace');

    expect(backspaceEvent.defaultPrevented).toBe(false);
    expect(input.textContent).toBe('Code Review\u00a0Code Review');
    expect(document.querySelectorAll('.gv-pm-slash-textarea-token')).toHaveLength(1);

    const sendEvent = press(input, 'Enter');

    expect(sendEvent.defaultPrevented).toBe(true);
    expect(input.textContent).toBe(
      'Review this code and report correctness issues.\u00a0Code Review',
    );
  });

  it('removes a rebuilt prompt spacer before removing its remembered range', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const token = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    token.replaceWith(document.createTextNode(token.textContent || ''));
    const caret = document.createRange();
    caret.selectNodeContents(input);
    caret.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(caret);
    typeInto(input);

    const spacerEvent = press(input, 'Backspace');
    const promptEvent = press(input, 'Backspace');

    expect(spacerEvent.defaultPrevented).toBe(true);
    expect(promptEvent.defaultPrevented).toBe(true);
    expect(input.textContent).toBe('');
    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
  });

  it('removes the repeated prompt token immediately before the caret', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');
    const firstToken = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;

    input.append(document.createTextNode('/review'));
    const caret = document.createRange();
    caret.selectNodeContents(input);
    caret.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(caret);
    typeInto(input);
    press(input, 'Enter');
    const tokens = input.querySelectorAll<HTMLElement>('.gv-pm-slash-token');
    const secondToken = tokens[1];

    const spacerEvent = press(input, 'Backspace');
    const event = press(input, 'Backspace');

    expect(spacerEvent.defaultPrevented).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(firstToken.isConnected).toBe(true);
    expect(secondToken.isConnected).toBe(false);
    expect(input.querySelectorAll('.gv-pm-slash-token')).toHaveLength(1);
  });

  it('preserves the first prompt styling and focus after deleting a later prompt', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');
    const firstToken = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    const firstColor = firstToken.style.getPropertyValue('--gv-pm-slash-token-color');

    input.append(document.createTextNode('hello /trans'));
    const secondCaret = document.createRange();
    secondCaret.selectNodeContents(input);
    secondCaret.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(secondCaret);
    typeInto(input);
    press(input, 'Enter');
    const secondToken = input.querySelectorAll<HTMLElement>('.gv-pm-slash-token')[1];

    press(input, 'Backspace');
    press(input, 'Backspace');

    expect(firstToken.isConnected).toBe(true);
    expect(secondToken.isConnected).toBe(false);
    expect(document.querySelectorAll('.gv-pm-slash-textarea-token')).toHaveLength(1);
    expect(firstToken.style.getPropertyValue('--gv-pm-slash-token-color')).toBe(firstColor);

    const spacer = firstToken.nextSibling!;
    while (spacer.nextSibling) spacer.nextSibling.remove();
    const firstCaret = document.createRange();
    firstCaret.setStartAfter(spacer);
    firstCaret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(firstCaret);
    typeInto(input);

    const spacerEvent = press(input, 'Backspace');

    expect(spacerEvent.defaultPrevented).toBe(true);
    expect(firstToken.isConnected).toBe(true);
    expect(document.activeElement).toBe(input);

    const firstEvent = press(input, 'Backspace');

    expect(firstEvent.defaultPrevented).toBe(true);
    expect(firstToken.isConnected).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(selection.rangeCount).toBe(1);
    expect(input.contains(selection.getRangeAt(0).commonAncestorContainer)).toBe(true);
  });

  it('does not remove the prompt when Backspace follows two line breaks', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
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

  it('removes a selected textarea prompt with two Backspaces', () => {
    const input = createTextarea('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Tab');

    const spacerEvent = press(input, 'Backspace');

    expect(spacerEvent.defaultPrevented).toBe(true);
    expect(input.value).toBe('Code Review');
    expect(document.querySelector('.gv-pm-slash-textarea-token')).not.toBeNull();

    const event = press(input, 'Backspace');

    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe('');
    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
  });

  it('keeps later textarea prompts tracked when a selected earlier prompt is deleted', () => {
    const input = createTextarea('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');
    input.setRangeText(' /trans', input.value.length, input.value.length, 'end');
    typeInto(input);
    press(input, 'Enter');

    input.setSelectionRange(0, 'Code Review'.length);
    const deleteEvent = press(input, 'Delete');
    input.setRangeText('', 0, 'Code Review'.length, 'start');
    typeInto(input);

    expect(deleteEvent.defaultPrevented).toBe(false);
    expect(document.querySelectorAll('.gv-pm-slash-textarea-token')).toHaveLength(1);
    expect(document.querySelector('.gv-pm-slash-textarea-token')?.textContent).toBe('Translator');

    input.setSelectionRange(input.value.length, input.value.length);
    const sendEvent = press(input, 'Enter');

    expect(sendEvent.defaultPrevented).toBe(true);
    expect(input.value).toContain('Translate the following text into Chinese.');
    expect(input.value).not.toContain('Translator');
  });

  it('does not forget a textarea prompt when deleting ordinary text with the same name', () => {
    const input = createTextarea('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');
    input.setRangeText('Code Review', input.value.length, input.value.length, 'end');
    typeInto(input);

    const ordinaryStart = input.value.lastIndexOf('Code Review');
    input.setSelectionRange(ordinaryStart, ordinaryStart + 'Code Review'.length);
    press(input, 'Delete');
    input.setRangeText('', ordinaryStart, ordinaryStart + 'Code Review'.length, 'start');
    typeInto(input);

    expect(document.querySelectorAll('.gv-pm-slash-textarea-token')).toHaveLength(1);
    input.setSelectionRange(input.value.length, input.value.length);
    const sendEvent = press(input, 'Enter');
    expect(sendEvent.defaultPrevented).toBe(true);
    expect(input.value).toContain('Review this code and report correctness issues.');
  });

  it('does not treat matching ordinary text before the caret as a textarea prompt', () => {
    const input = createTextarea('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');
    input.setRangeText('Code Review', input.value.length, input.value.length, 'end');
    typeInto(input);

    const backspaceEvent = press(input, 'Backspace');

    expect(backspaceEvent.defaultPrevented).toBe(false);
    expect(input.value).toBe('Code Review\u00a0Code Review');
    expect(document.querySelectorAll('.gv-pm-slash-textarea-token')).toHaveLength(1);

    const sendEvent = press(input, 'Enter');
    expect(sendEvent.defaultPrevented).toBe(true);
    expect(input.value).toBe('Review this code and report correctness issues.\u00a0Code Review');
  });
});
