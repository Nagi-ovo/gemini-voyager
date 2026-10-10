import { describe, expect, it } from 'vitest';

import { createVimEditor } from '../vimDomEditor';
import { createVimOperators } from '../vimOperators';
import {
  setupVimTestEnvironment,
  createTextareaInput,
  createQuillParagraphInput,
  setParagraphRects,
  getParagraphTexts,
  setParagraphSelection,
  mockParagraphRangeRects,
} from './vimHarness';

setupVimTestEnvironment();

describe('Vim operators', () => {
  it('deletes the character at the caret with x', async () => {
    const input = createTextareaInput('hello');
    input.selectionStart = 1;
    input.selectionEnd = 1;

    const operators = createVimOperators(createVimEditor(() => {}));

    operators.deleteChars(input, 1);

    expect(input.value).toBe('hllo');
    expect(input.selectionStart).toBe(1);
  });

  it('deletes exactly two lines with 2dd', async () => {
    const input = createTextareaInput('one\ntwo\nthree\nfour');
    input.selectionStart = 4;
    input.selectionEnd = 4;

    const operators = createVimOperators(createVimEditor(() => {}));

    operators.applyOperatorLine(input, 'd', 2);

    expect(input.value).toBe('one\nfour');
    expect(input.selectionStart).toBe(4);
  });

  it('deletes a full Quill paragraph with dd instead of only text to the right', async () => {
    mockParagraphRangeRects();
    const input = createQuillParagraphInput(['one', 'two', 'three']);
    setParagraphRects(input, [10, 30, 50]);
    setParagraphSelection(input, 1, 1);

    const operators = createVimOperators(createVimEditor(() => {}));

    operators.applyOperatorLine(input, 'd', 1);

    expect(getParagraphTexts(input)).toEqual(['one', 'three']);
    expect(window.getSelection()?.anchorNode).toBe(input.children[1].firstChild);
  });

  it('deletes an empty Quill paragraph with dd', async () => {
    mockParagraphRangeRects();
    const input = createQuillParagraphInput(['one', '', 'three']);
    setParagraphRects(input, [10, 30, 50]);
    setParagraphSelection(input, 1);

    const operators = createVimOperators(createVimEditor(() => {}));

    operators.applyOperatorLine(input, 'd', 1);

    expect(getParagraphTexts(input)).toEqual(['one', 'three']);
    expect(window.getSelection()?.anchorNode).toBe(input.children[1].firstChild);
  });
});
