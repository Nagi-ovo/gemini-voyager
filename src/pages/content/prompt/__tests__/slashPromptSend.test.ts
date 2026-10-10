import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { PromptItem } from '@/core/types/sync';

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

describe('slashPromptSend', () => {
  let destroy: (() => void) | null = null;
  useSlashTestHarness(() => {
    destroy?.();
    destroy = null;
  });

  it('keeps an external marker when Gemini rebuilds the editor and sends the body', async () => {
    const input = createContentEditable('/review');
    input.closest<HTMLElement>('rich-textarea')!.style.backgroundColor = 'rgb(255, 251, 239)';
    input.addEventListener('input', () => {
      if (input.querySelector('.gv-pm-slash-token')) input.textContent = 'Code Review';
    });
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
    expect(marker.textContent).toBe('Code Review');
    expect(marker.classList.contains('gv-pm-slash-textarea-token-native')).toBe(false);
    expect(marker.classList.contains('gv-pm-slash-textarea-token-covered-source')).toBe(true);
    expect(marker.style.backgroundColor).toBe('rgb(255, 251, 239)');
    expect(marker.style.getPropertyValue('--gv-pm-slash-input-surface')).toBe('rgb(255, 251, 239)');
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

  it('expands a rebuilt prompt alongside a later live token when sending', async () => {
    const input = createContentEditable('/trans');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const rebuiltToken = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    rebuiltToken.replaceWith(document.createTextNode(rebuiltToken.textContent || ''));
    input.append(document.createTextNode('/review'));
    const caret = document.createRange();
    caret.selectNodeContents(input);
    caret.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(caret);
    typeInto(input);
    press(input, 'Enter');

    expect(input.querySelectorAll('.gv-pm-slash-token')).toHaveLength(1);

    let sentText = '';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') sentText = input.textContent || '';
    });
    press(input, 'Enter');
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(sentText).toContain('Translate the following text into Chinese.');
    expect(sentText).toContain('Review this code and report correctness issues.');
  });

  it('preserves blank lines when expanding a rebuilt multiline prompt', async () => {
    const multilinePrompt: PromptItem = {
      ...prompts[0],
      text: 'Line 1\n\nLine 3',
    };
    const input = createContentEditable('/trans');
    destroy = startPromptSlashCommand({
      scheme: () => 'light',
      initialItems: [multilinePrompt],
    }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const rebuiltToken = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    rebuiltToken.replaceWith(document.createTextNode(rebuiltToken.textContent || ''));
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();

    press(input, 'Enter');
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    const renderedChildren = Array.from(input.childNodes).filter(
      (node) => node.nodeName === 'BR' || node.textContent?.trim() !== '',
    );
    expect(renderedChildren.map((node) => `${node.nodeName}:${node.textContent}`)).toEqual([
      '#text:Line 1',
      'BR:',
      'BR:',
      '#text:Line 3',
    ]);
  });

  it('expands a rebuilt prompt after an earlier live token when sending', async () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    input.append(document.createTextNode('/trans'));
    const caret = document.createRange();
    caret.selectNodeContents(input);
    caret.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(caret);
    typeInto(input);
    press(input, 'Enter');

    const tokens = input.querySelectorAll<HTMLElement>('.gv-pm-slash-token');
    tokens[1].replaceWith(document.createTextNode(tokens[1].textContent || ''));
    expect(input.querySelectorAll('.gv-pm-slash-token')).toHaveLength(1);

    let sentText = '';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') sentText = input.textContent || '';
    });
    press(input, 'Enter');
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(sentText).toContain('Review this code and report correctness issues.');
    expect(sentText).toContain('Translate the following text into Chinese.');
  });

  it('unwraps inline tokens to plain prompt text before a send Enter reaches the host page', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const sendEvent = press(input, 'Enter');

    expect(sendEvent.defaultPrevented).toBe(true);
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.textContent).toContain('Review this code and report correctness issues.');
    expect(input.classList.contains('gv-pm-slash-contenteditable-hide-value')).toBe(false);
  });

  it('preserves the token on plain Enter when Ctrl/Cmd+Enter send mode is enabled', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({
      scheme: () => 'light',
      initialItems: prompts,
      initialCtrlEnterSend: true,
    }).destroy;
    typeInto(input);
    press(input, 'Tab');

    const newlineEvent = press(input, 'Enter');

    expect(newlineEvent.defaultPrevented).toBe(false);
    expect(input.querySelector('.gv-pm-slash-token')).not.toBeNull();
    expect(input.textContent).toBe('Code Review\u00a0');

    const sendEvent = press(input, 'Enter', { ctrlKey: true });

    expect(sendEvent.defaultPrevented).toBe(true);
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.textContent).toContain('Review this code and report correctness issues.');
  });

  it('updates the Ctrl/Cmd+Enter send mode when the sync setting changes', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Tab');
    const addStorageListener = chrome.storage.onChanged.addListener as unknown as ReturnType<
      typeof vi.fn
    >;
    const storageListener = addStorageListener.mock.calls.at(-1)?.[0] as
      | ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
      | undefined;

    storageListener?.(
      { [StorageKeys.CTRL_ENTER_SEND]: { oldValue: false, newValue: true } },
      'sync',
    );
    const newlineEvent = press(input, 'Enter');

    expect(storageListener).toBeDefined();
    expect(newlineEvent.defaultPrevented).toBe(false);
    expect(input.querySelector('.gv-pm-slash-token')).not.toBeNull();
  });

  it('does not reopen completion from a slash in the expanded body before replaying Enter', async () => {
    const input = createContentEditable('/slash');
    const slashBodyPrompt: PromptItem = {
      id: 'slash-body',
      name: 'Slash Body',
      text: 'Use /review',
      tags: [],
      createdAt: 4,
    };
    destroy = startPromptSlashCommand({
      scheme: () => 'light',
      initialItems: [slashBodyPrompt, ...prompts],
    }).destroy;
    typeInto(input);
    press(input, 'Enter');

    let hostEnterCount = 0;
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') hostEnterCount++;
    });
    press(input, 'Enter');
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(hostEnterCount).toBe(1);
    expect(input.textContent).toBe('Use /review\u00a0');
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });

  it('unwraps inline tokens before a programmatic send-button click', () => {
    document.body.innerHTML = `
      <form>
        <rich-textarea><div id="question-input" contenteditable="true" role="textbox">/review</div></rich-textarea>
        <button type="button" aria-label="Send message"></button>
      </form>
    `;
    const input = document.getElementById('question-input')!;
    const send = document.querySelector<HTMLButtonElement>('button')!;
    setRect(input);
    input.focus();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    send.click();

    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.textContent).toContain('Review this code and report correctness issues.');
  });

  it.each([
    ['localized label', '<button type="button" aria-label="发送消息"></button>', 'button'],
    [
      'icon only',
      '<button type="button"><span class="material-symbols-outlined">send</span></button>',
      '.material-symbols-outlined',
    ],
  ])('unwraps inline tokens for a %s send button', (_name, buttonHtml, clickSelector) => {
    document.body.innerHTML = `
      <form>
        <rich-textarea><div id="question-input" contenteditable="true" role="textbox">/review</div></rich-textarea>
        ${buttonHtml}
      </form>
    `;
    const input = document.getElementById('question-input')!;
    const clickTarget = document.querySelector<HTMLElement>(clickSelector)!;
    setRect(input);
    input.focus();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    clickTarget.click();

    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.textContent).toContain('Review this code and report correctness issues.');
  });

  it('does not unwrap prompts for an unrelated send-looking button', () => {
    const input = createContentEditable('/review');
    const feedback = document.createElement('button');
    feedback.setAttribute('aria-label', 'Send feedback');
    document.body.appendChild(feedback);
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    feedback.click();

    expect(input.querySelector('.gv-pm-slash-token')).not.toBeNull();
    expect(input.textContent).toBe('Code Review\u00a0');
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
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');
    expect(input.querySelector('.gv-pm-slash-token')).not.toBeNull();

    unrelatedForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(input.querySelector('.gv-pm-slash-token')).not.toBeNull();

    chatForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.textContent).toContain('Review this code and report correctness issues.');
  });

  it('shows a selected prompt name in a textarea and expands its body only when sending', () => {
    const input = createTextarea('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);

    press(input, 'Enter');

    const token = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
    expect(input.value.trimEnd()).toBe('Code Review');
    expect(input.classList.contains('gv-pm-slash-textarea-hide-value')).toBe(true);
    expect(token.textContent).toBe('Code Review');
    expect(token.hasAttribute('title')).toBe(false);

    token.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.getElementById('gv-pm-slash-tooltip')?.textContent).toBe(
      'Review this code and report correctness issues.',
    );

    press(input, 'Enter');
    expect(input.value.trimEnd()).toBe('Review this code and report correctness issues.');
    expect(input.classList.contains('gv-pm-slash-textarea-hide-value')).toBe(false);
  });
});
