import { describe, expect, it, vi } from 'vitest';

import { activatePromptText } from '../promptClickAction';

describe('activatePromptText', () => {
  it('keeps copy as the default behavior when direct insert is disabled', async () => {
    const copyText = vi.fn(async () => {});
    const expandInputCollapseIfNeeded = vi.fn();
    const insertTextIntoChatInput = vi.fn(() => true);

    const result = await activatePromptText('Hello', false, {
      copyText,
      expandInputCollapseIfNeeded,
      insertTextIntoChatInput,
    });

    expect(result).toBe('copied');
    expect(copyText).toHaveBeenCalledWith('Hello');
    expect(expandInputCollapseIfNeeded).not.toHaveBeenCalled();
    expect(insertTextIntoChatInput).not.toHaveBeenCalled();
  });

  it('inserts into Gemini input when direct insert is enabled and input is available', async () => {
    const copyText = vi.fn(async () => {});
    const expandInputCollapseIfNeeded = vi.fn();
    const insertTextIntoChatInput = vi.fn(() => true);

    const result = await activatePromptText('Hello', true, {
      copyText,
      expandInputCollapseIfNeeded,
      insertTextIntoChatInput,
    });

    expect(result).toBe('inserted');
    expect(expandInputCollapseIfNeeded).toHaveBeenCalledTimes(1);
    expect(insertTextIntoChatInput).toHaveBeenCalledWith('Hello');
    expect(copyText).not.toHaveBeenCalled();
  });

  it('passes multi-line prompt text through unchanged so newlines reach the chat input', async () => {
    const copyText = vi.fn(async () => {});
    const expandInputCollapseIfNeeded = vi.fn();
    const insertTextIntoChatInput = vi.fn(() => true);

    const multiline = 'Line 1\n\nLine 3';
    const result = await activatePromptText(multiline, true, {
      copyText,
      expandInputCollapseIfNeeded,
      insertTextIntoChatInput,
    });

    expect(result).toBe('inserted');
    expect(insertTextIntoChatInput).toHaveBeenCalledWith(multiline);
  });

  it('falls back to copy when direct insert is enabled but Gemini input is unavailable', async () => {
    const copyText = vi.fn(async () => {});
    const expandInputCollapseIfNeeded = vi.fn();
    const insertTextIntoChatInput = vi.fn(() => false);

    const result = await activatePromptText('Hello', true, {
      copyText,
      expandInputCollapseIfNeeded,
      insertTextIntoChatInput,
    });

    expect(result).toBe('copied');
    expect(expandInputCollapseIfNeeded).toHaveBeenCalledTimes(1);
    expect(insertTextIntoChatInput).toHaveBeenCalledWith('Hello');
    expect(copyText).toHaveBeenCalledWith('Hello');
  });
});
