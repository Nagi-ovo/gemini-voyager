import { describe, expect, it, vi } from 'vitest';

import { createVimEditor } from '../vimDomEditor';
import { getRenderedLineMotionOffset } from '../vimLayout';
import {
  setupVimTestEnvironment,
  createQuestionInput,
  createQuillParagraphInput,
  createQuillInlineNewlineInput,
  setParagraphRects,
  setContentEditableSelection,
  setParagraphSelection,
  mockCharacterRects,
  mockParagraphRangeRects,
  presentationFor,
} from './vimHarness';

setupVimTestEnvironment();

describe('Vim rendered layout', () => {
  it('moves j/k between rendered lines without an extra horizontal character step', async () => {
    mockCharacterRects({
      0: { left: 80, top: 10, width: 10 },
      1: { left: 90, top: 10, width: 10 },
      2: { left: 80, top: 30, width: 10 },
      3: { left: 90, top: 30, width: 10 },
    });
    const input = createQuestionInput('abcd');
    setContentEditableSelection(input, 1);
    const selection = window.getSelection();
    const modify = vi.fn();
    if (!selection) throw new Error('Expected selection.');
    Object.defineProperty(selection, 'modify', {
      configurable: true,
      value: modify,
    });

    const editor = createVimEditor(() => {});

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);

    expect(input.textContent).toBe('abcd');
    expect(selection.anchorOffset).toBe(3);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, -1, 1, null)!.offset);

    expect(selection.anchorOffset).toBe(1);
    expect(modify).not.toHaveBeenCalled();
  });

  it('moves j/k through consecutive empty rendered lines', async () => {
    mockCharacterRects({
      0: { left: 80, top: 10, width: 10 },
      2: { left: 80, top: 30, width: 0 },
      3: { left: 80, top: 50, width: 0 },
      4: { left: 80, top: 70, width: 10 },
    });
    const input = createQuestionInput('a\n\n\nb');
    setContentEditableSelection(input, 0);
    const selection = window.getSelection();
    if (!selection) throw new Error('Expected selection.');

    const editor = createVimEditor(() => {});
    const view = presentationFor(input);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    window.dispatchEvent(new Event('resize'));
    expect(selection.anchorOffset).toBe(2);
    const cursor = document.querySelector<HTMLElement>('.gv-input-vim-cursor');
    expect(cursor?.style.top).toBe('30px');

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    window.dispatchEvent(new Event('resize'));
    expect(selection.anchorOffset).toBe(3);
    expect(cursor?.style.top).toBe('50px');

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    expect(selection.anchorOffset).toBe(4);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, -1, 1, null)!.offset);
    expect(selection.anchorOffset).toBe(3);

    view.dispose();
  });

  it('moves j/k through literal empty lines inside one Quill paragraph', async () => {
    mockCharacterRects({
      0: { left: 80, top: 10, width: 10 },
      2: { left: 0, top: 0, width: 0, missing: true },
      3: { left: 0, top: 0, width: 0, missing: true },
      4: { left: 80, top: 70, width: 10 },
    });
    const input = createQuillInlineNewlineInput('a\n\n\nb');
    setParagraphSelection(input, 0);
    const selection = window.getSelection();
    if (!selection) throw new Error('Expected selection.');

    const editor = createVimEditor(() => {});
    const view = presentationFor(input);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    window.dispatchEvent(new Event('resize'));
    expect(selection.anchorOffset).toBe(2);
    const literalCursor = document.querySelector<HTMLElement>('.gv-input-vim-cursor');
    expect(literalCursor?.style.top).toBe('30px');

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    window.dispatchEvent(new Event('resize'));
    expect(selection.anchorOffset).toBe(3);
    expect(literalCursor?.style.top).toBe('50px');

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    expect(selection.anchorOffset).toBe(4);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, -1, 1, null)!.offset);
    expect(selection.anchorOffset).toBe(3);

    view.dispose();
  });

  it('moves j/k through Quill empty paragraphs', async () => {
    mockParagraphRangeRects();
    const input = createQuillParagraphInput(['a', '', '', 'b']);
    setParagraphRects(input, [10, 30, 50, 70]);
    setParagraphSelection(input, 0);
    const selection = window.getSelection();
    if (!selection) throw new Error('Expected selection.');

    const editor = createVimEditor(() => {});

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    expect(selection.anchorNode).toBe(input.children[1]);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    expect(selection.anchorNode).toBe(input.children[2]);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    expect(selection.anchorNode).toBe(input.children[3].firstChild);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, -1, 1, null)!.offset);
    expect(selection.anchorNode).toBe(input.children[2]);
  });

  it('moves onto an empty line even when the collapsed newline rect overlaps a text line', async () => {
    mockCharacterRects({
      0: { left: 80, top: 10, width: 10 },
      2: { left: 80, top: 30, width: 0 },
      3: { left: 80, top: 30, width: 10 },
    });
    const input = createQuestionInput('a\n\nb');
    setContentEditableSelection(input, 0);
    const selection = window.getSelection();
    if (!selection) throw new Error('Expected selection.');

    const editor = createVimEditor(() => {});

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);

    expect(selection.anchorOffset).toBe(2);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);
    expect(selection.anchorOffset).toBe(3);

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, -1, 1, null)!.offset);
    expect(selection.anchorOffset).toBe(2);
  });

  it('does not treat a trailing newline as an empty rendered line', async () => {
    mockCharacterRects({
      0: { left: 80, top: 10, width: 10 },
      2: { left: 80, top: 30, width: 10 },
    });
    const input = createQuestionInput('a\nb\n');
    setContentEditableSelection(input, 2);
    const selection = window.getSelection();
    if (!selection) throw new Error('Expected selection.');

    const editor = createVimEditor(() => {});

    editor.setInputSelection(input, getRenderedLineMotionOffset(input, 1, 1, null)!.offset);

    expect(selection.anchorOffset).toBe(2);
  });
});
