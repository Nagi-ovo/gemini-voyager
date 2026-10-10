import { describe, expect, it } from 'vitest';

import type { PromptItem } from '@/core/types/sync';

import { getPromptQuery } from '../slashComposerText';
import { createPromptPlacements } from '../slashPlacements';
import {
  createContentEditable,
  createTextarea,
  prompts,
  useSlashTestHarness,
} from './slashPromptTestHarness';

describe('slashPlacements', () => {
  const track = useSlashTestHarness();

  it('lets the overlay own the complete prompt-only selection area', () => {
    const input = createContentEditable('/trans');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[0], true);

    const token = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    const spacer = token.nextSibling!;
    const range = document.createRange();
    range.setStart(token.firstChild!, 0);
    range.setEndAfter(spacer);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    placements.syncSelection();

    expect(input.classList.contains('gv-pm-slash-prompt-only-selection')).toBe(true);
    expect(
      document
        .querySelector('.gv-pm-slash-textarea-token')
        ?.classList.contains('gv-pm-slash-textarea-token-selected'),
    ).toBe(true);

    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    placements.syncSelection();

    expect(input.classList.contains('gv-pm-slash-prompt-only-selection')).toBe(false);
    expect(
      document
        .querySelector('.gv-pm-slash-textarea-token')
        ?.classList.contains('gv-pm-slash-textarea-token-selected'),
    ).toBe(false);
  });

  it('keeps Prompt and ordinary text visibly selected together', () => {
    const input = createContentEditable('/trans');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[0], true);

    const token = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    const ordinaryText = document.createTextNode('ordinary text');
    input.append(ordinaryText);
    const range = document.createRange();
    range.setStart(token.firstChild!, 0);
    range.setEnd(ordinaryText, ordinaryText.data.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    placements.syncSelection();

    expect(input.classList.contains('gv-pm-slash-prompt-only-selection')).toBe(false);
    expect(
      document
        .querySelector('.gv-pm-slash-textarea-token')
        ?.classList.contains('gv-pm-slash-textarea-token-selected'),
    ).toBe(true);
  });

  it('marks a placed token as a prompt without changing what reads its text', () => {
    // `expandPromptTokens`, `isTextareaPromptOnlyValue` and `readText` all go
    // by the token's text, and the icon contributes none.
    const input = createContentEditable('/trans');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[0], true);

    const placed = input.querySelector<HTMLElement>('.gv-pm-slash-token')!;
    const icon = placed.querySelector('svg');

    expect(icon?.classList.contains('lucide-package')).toBe(true);
    expect(placed.firstElementChild).toBe(icon);
    expect(placed.textContent).toBe('Translator');
  });

  it('expands a selected contenteditable prompt before destroying slash completion', () => {
    const input = createContentEditable('/review');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[1], true);

    placements.destroy();

    expect(input.textContent?.trim()).toBe('Review this code and report correctness issues.');
    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
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
      const placements = track(
        createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
      );
      placements.place(getPromptQuery(input)!, prompts[1], true);
      input.textContent = 'Before Code Review';
      placements.afterInput(input);
      expect(capturedStartOffset).toBe(7);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('expands the stored prompt occurrence when the same name already appears earlier', () => {
    const input = createContentEditable('Code Review notes: /review');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[1], false);

    input.textContent = 'Code Review notes: Code Review\u00a0';
    const caret = document.createRange();
    caret.selectNodeContents(input);
    caret.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(caret);
    placements.afterInput(input);

    placements.expandForSend(input);

    expect(input.textContent).toBe(
      'Code Review notes: Review this code and report correctness issues.\u00a0',
    );
  });

  it('keeps a rebuilt prompt anchored when the same name is inserted before it', () => {
    const input = createContentEditable('/review');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[1], true);

    input.textContent = 'Code Review';
    placements.afterInput(input);
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(input.firstChild!, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    placements.noteEdit(input);
    input.textContent = 'Code Review Code Review';
    placements.afterInput(input);

    placements.expandForSend(input);

    expect(input.textContent).toBe('Code Review Review this code and report correctness issues.');
  });

  it('keeps the caret at the removed prompt when Gemini rebuilds the editor', async () => {
    const input = createContentEditable('/review');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[1], true);

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

    placements.backspace(input);
    await Promise.resolve();
    placements.backspace(input);
    await Promise.resolve();

    const prefix = selection.getRangeAt(0).cloneRange();
    prefix.selectNodeContents(input);
    prefix.setEnd(selection.focusNode!, selection.focusOffset);
    expect(input.textContent).toBe('Three after');
    expect(prefix.toString()).toBe('Three ');
  });

  it('materializes line breaks when expanding a multiline prompt for send', () => {
    const multilinePrompt: PromptItem = {
      id: 'structured',
      name: 'Structured',
      text: 'Please analyze:\n\n1. Find the issue\n2. Suggest a fix',
      tags: [],
      createdAt: 4,
    };
    const input = createContentEditable('/structured');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, multilinePrompt, true);

    placements.expandForSend(input);

    expect(input.querySelector('.gv-pm-slash-token')).toBeNull();
    expect(input.querySelectorAll('br')).toHaveLength(3);
    expect(input.textContent).toContain('Please analyze:');
    expect(input.textContent).toContain('1. Find the issue');
    expect(input.textContent).toContain('2. Suggest a fix');
    expect(
      Array.from(input.childNodes).some((node) => node instanceof Text && node.data.includes('\n')),
    ).toBe(false);
  });

  it('expands each live inline prompt exactly once when sending', () => {
    const input = createContentEditable('First /review');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[1], false);

    input.append(document.createTextNode(', then /trans'));
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    placements.afterInput(input);
    placements.place(getPromptQuery(input)!, prompts[0], false);
    input.append(document.createTextNode('.'));

    placements.expandForSend(input);

    expect(input.textContent).toBe(
      'First Review this code and report correctness issues.\u00a0, then Translate the following text into Chinese.\u00a0.',
    );
  });
});

describe('slashTextareaPlacements', () => {
  const track = useSlashTestHarness();

  it('replaces a textarea query and keeps a hoverable name marker inside the composer', () => {
    const input = createTextarea('Please /review');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[1], false);

    expect(input.value.trimEnd()).toBe('Please Code Review');
    expect(document.querySelector('.gv-pm-slash-textarea-token')?.textContent).toBe('Code Review');
  });

  it('expands a selected textarea prompt before destroying slash completion', () => {
    const input = createTextarea('/review');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[1], true);

    placements.destroy();

    expect(input.value.trimEnd()).toBe('Review this code and report correctness issues.');
    expect(input.classList.contains('gv-pm-slash-textarea-hide-value')).toBe(false);
    expect(document.querySelector('.gv-pm-slash-textarea-token')).toBeNull();
  });

  it('reveals textarea text typed after a selected prompt and preserves it when sending', () => {
    const input = createTextarea('/review');
    const placements = track(
      createPromptPlacements({ scheme: () => 'light', bindPreview: () => {} }),
    );
    placements.place(getPromptQuery(input)!, prompts[1], true);

    expect(input.classList.contains('gv-pm-slash-textarea-hide-value')).toBe(true);

    input.setRangeText('Focus on security.', input.selectionStart, input.selectionEnd, 'end');
    placements.afterInput(input);

    expect(input.value).toContain('Code Review\u00a0Focus on security.');
    expect(input.classList.contains('gv-pm-slash-textarea-hide-value')).toBe(false);
    expect(document.querySelector('.gv-pm-slash-textarea-token')?.textContent).toBe('Code Review');

    placements.expandForSend(input);
    expect(input.value).toContain(
      'Review this code and report correctness issues.\u00a0Focus on security.',
    );
  });
});
