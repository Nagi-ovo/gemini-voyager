import { afterEach, describe, expect, it } from 'vitest';

import { resolvePromptSiteAdapter } from '../resolvePromptSiteAdapter';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('prompt insert', () => {
  it('unfolds a Gemini composer that input collapse folded, then inserts', () => {
    document.body.innerHTML =
      '<div class="gv-input-collapsed" style="background-color: rgb(255, 255, 255)">' +
      '<rich-textarea><div contenteditable="true"></div></rich-textarea></div>';
    const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
    // jsdom lays nothing out; the composer lookup only takes a visible input.
    editor.getBoundingClientRect = () => new DOMRect(0, 600, 600, 48);

    expect(resolvePromptSiteAdapter('https://gemini.google.com/app').insert('Summarize')).toBe(
      true,
    );

    expect(document.querySelector('.gv-input-collapsed')).toBeNull();
    expect(editor.textContent).toContain('Summarize');
  });

  it('reports no composer so the caller can copy instead', () => {
    expect(resolvePromptSiteAdapter('https://chat.deepseek.com/').insert('Summarize')).toBe(false);
  });
});
