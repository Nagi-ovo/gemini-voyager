import { describe, expect, it } from 'vitest';

import type { PromptItem } from '@/core/types/sync';

import { startPromptSlashCommand } from '../slashPrompt';
import {
  createContentEditable,
  setRect,
  withQueryRect,
  typeInto,
  press,
  prompts,
  useSlashTestHarness,
} from './slashPromptTestHarness';

describe('slashPrompt', () => {
  let destroy: (() => void) | null = null;
  useSlashTestHarness(() => {
    destroy?.();
    destroy = null;
  });

  it('shows only matching names and tags, with the body in a hover tooltip', () => {
    const input = createContentEditable('/trans');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;

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

  it('lets keyboard navigation replace a hovered selection', () => {
    const input = createContentEditable('/');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);

    const root = document.getElementById('gv-pm-slash-root')!;
    const options = Array.from(root.querySelectorAll<HTMLElement>('.gv-pm-slash-option'));
    options[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(root.dataset.gvInteraction).toBe('pointer');
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    press(input, 'ArrowUp');

    expect(root.dataset.gvInteraction).toBe('keyboard');
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
    ]);
  });

  it('shows the completion while the query is still being typed', () => {
    withQueryRect(() => {
      const input = createContentEditable('/trans');
      destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
      typeInto(input);

      const ghost = document.getElementById('gv-pm-slash-ghost')!;
      expect(ghost.textContent).toBe('lator');
      expect(ghost.classList.contains('gv-pm-slash-ghost-visible')).toBe(true);
      // Drawn past the end of what was typed.
      expect(ghost.style.left).toBe('60px');
      expect(ghost.style.top).toBe('80px');
    });
  });

  it('takes the completion on Tab without placing the token', () => {
    // Tab used to place the token outright, which for a template opened the
    // fill surface over a composer still reading `/a` - the completion it had
    // just offered never arrived.
    withQueryRect(() => {
      const input = createContentEditable('/trans');
      destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
      typeInto(input);

      press(input, 'Tab');

      expect(input.textContent).toBe('/Translator');
      expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    });
  });

  it('places the token on Tab once there is nothing left to complete', () => {
    withQueryRect(() => {
      const input = createContentEditable('/Translator');
      destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
      typeInto(input);

      press(input, 'Tab');

      expect(input.querySelector('.gv-pm-slash-token')?.textContent).toBe('Translator');
    });
  });

  it('still places the token on Enter while a completion is showing', () => {
    withQueryRect(() => {
      const input = createContentEditable('/trans');
      destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
      typeInto(input);

      press(input, 'Enter');

      expect(input.querySelector('.gv-pm-slash-token')?.textContent).toBe('Translator');
    });
  });

  it('takes the completion down with the list', () => {
    withQueryRect(() => {
      const input = createContentEditable('/trans');
      destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
      typeInto(input);
      const ghost = document.getElementById('gv-pm-slash-ghost')!;
      expect(ghost.classList.contains('gv-pm-slash-ghost-visible')).toBe(true);

      press(input, 'Escape');

      expect(ghost.classList.contains('gv-pm-slash-ghost-visible')).toBe(false);
    });
  });

  it('never puts the completion into the composer text', () => {
    // It is a separate fixed element on purpose: backspace, caret movement and
    // IME composition all have to behave exactly as they did.
    const input = createContentEditable('/trans');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);

    expect(input.textContent).toBe('/trans');
    expect(input.querySelector('#gv-pm-slash-ghost')).toBeNull();
  });

  it('anchors completion beside the slash inside a fullscreen composer', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      'getBoundingClientRect',
    );
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
      const input = createContentEditable('/');
      setRect(input, { top: 40, bottom: 720, height: 680 });
      destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
      const list = document.getElementById('gv-pm-slash-list')!;
      setRect(list, { height: 144 });

      typeInto(input);

      const root = document.getElementById('gv-pm-slash-root')!;
      expect(root.style.left).toBe('52px');
      expect(root.style.top).toBe('108px');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('keeps completion above a bottom composer when there is no room below the slash', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      'getBoundingClientRect',
    );
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 52,
        top: 700,
        right: 60,
        bottom: 722,
        width: 8,
        height: 22,
        x: 52,
        y: 700,
        toJSON: () => ({}),
      }),
    });

    try {
      const input = createContentEditable('/');
      setRect(input, { top: 680, bottom: 748, height: 68 });
      destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
      const list = document.getElementById('gv-pm-slash-list')!;
      setRect(list, { height: 144 });

      typeInto(input);

      const root = document.getElementById('gv-pm-slash-root')!;
      expect(root.style.left).toBe('52px');
      expect(root.style.top).toBe('550px');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('confirms with Enter and renders an inline name token backed by the prompt body', () => {
    const input = createContentEditable('/trans');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);

    const event = press(input, 'Enter');

    expect(event.defaultPrevented).toBe(true);
    const token = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    expect(token.dataset.gvPromptName).toBe('Translator');
    expect(token.textContent).toBe('Translator');
    expect(token.dataset.gvPromptText).toBe('Translate the following text into Chinese.');
    expect(token.hasAttribute('title')).toBe(false);
    expect(input.classList.contains('gv-pm-slash-contenteditable-hide-value')).toBe(false);
    expect(token.style.getPropertyValue('--gv-pm-slash-token-color')).toBe(
      'var(--gv-pm-brand, var(--gv-pm-brand-default))',
    );
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
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: withPath }).destroy;
    typeInto(input);
    press(input, 'Enter');

    typeInto(input);

    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });

  it('supports arrow navigation and Tab confirmation', () => {
    const input = createContentEditable('/');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);

    press(input, 'ArrowDown');
    const event = press(input, 'Tab');

    expect(event.defaultPrevented).toBe(true);
    expect(input.querySelector<HTMLElement>('.gv-pm-slash-token')?.dataset.gvPromptName).toBe(
      'Translator',
    );
  });

  it.each(['/ ', 'A / B'])(
    'does not complete a slash query starting with whitespace: %s',
    (text) => {
      const input = createContentEditable(text);
      const promptsWithB: PromptItem[] = [
        ...prompts,
        { id: 'b', name: 'B', text: 'Prompt B body.', tags: [], createdAt: 4 },
      ];
      destroy = startPromptSlashCommand({
        scheme: () => 'light',
        initialItems: promptsWithB,
      }).destroy;

      typeInto(input);

      expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
      expect(press(input, 'Enter').defaultPrevented).toBe(false);
      expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    },
  );

  it('still completes a slash query when the name immediately follows the slash', () => {
    const input = createContentEditable('/B');
    const promptsWithB: PromptItem[] = [
      ...prompts,
      { id: 'b', name: 'B', text: 'Prompt B body.', tags: [], createdAt: 4 },
    ];
    destroy = startPromptSlashCommand({
      scheme: () => 'light',
      initialItems: promptsWithB,
    }).destroy;

    typeInto(input);

    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(false);
    expect(document.getElementById('gv-pm-slash-list')?.textContent).toContain('B');
    expect(press(input, 'Enter').defaultPrevented).toBe(true);
    expect(input.querySelector<HTMLElement>('.gv-pm-slash-token')?.dataset.gvPromptName).toBe('B');
  });

  it('filters and completes a multi-word prompt name after an internal space', () => {
    const input = createContentEditable('/Daily S');
    const dailyStandup: PromptItem = {
      id: 'daily-standup',
      name: 'Daily Standup',
      text: 'Summarize yesterday, today, and blockers.',
      tags: [],
      createdAt: 4,
    };
    destroy = startPromptSlashCommand({
      scheme: () => 'light',
      initialItems: [...prompts, dailyStandup],
    }).destroy;

    typeInto(input);

    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(false);
    expect(document.getElementById('gv-pm-slash-list')?.textContent).toContain('Daily Standup');
    expect(press(input, 'Enter').defaultPrevented).toBe(true);
    expect(input.querySelector<HTMLElement>('.gv-pm-slash-token')?.dataset.gvPromptName).toBe(
      'Daily Standup',
    );
  });

  it('closes completion immediately when the slash query is deleted', () => {
    const input = createContentEditable('/');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);

    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(false);

    const event = press(input, 'Backspace');

    expect(event.defaultPrevented).toBe(false);
    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });

  it('closes completion for beforeinput deletion commands', () => {
    const input = createContentEditable('/');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
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
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
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

  it('confirms with a left mouse press without moving the editor selection', () => {
    const input = createContentEditable('/review');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);

    const option = document.querySelector<HTMLElement>('.gv-pm-slash-option')!;
    option.dispatchEvent(
      new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }),
    );

    expect(input.querySelector<HTMLElement>('.gv-pm-slash-token')?.dataset.gvPromptName).toBe(
      'Code Review',
    );
  });

  it('paints every slash surface in the site scheme even when the page markers disagree', () => {
    withQueryRect(() => {
      const input = createContentEditable('/trans');
      document.body.insertAdjacentHTML('afterbegin', '<div class="theme-host light-theme"></div>');
      destroy = startPromptSlashCommand({ scheme: () => 'dark', initialItems: prompts }).destroy;
      typeInto(input);

      const root = document.getElementById('gv-pm-slash-root')!;
      root
        .querySelector<HTMLElement>('.gv-pm-slash-option')!
        .dispatchEvent(new MouseEvent('mouseenter'));
      expect(root.dataset.gvTheme).toBe('dark');
      expect(document.getElementById('gv-pm-slash-ghost')?.dataset.gvTheme).toBe('dark');
      expect(document.getElementById('gv-pm-slash-tooltip')?.dataset.gvTheme).toBe('dark');

      press(input, 'Enter');
      expect(input.querySelector<HTMLElement>('.gv-pm-slash-token')?.dataset.gvTheme).toBe('dark');
    });
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
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;

    typeInto(promptTextarea);

    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });
});
