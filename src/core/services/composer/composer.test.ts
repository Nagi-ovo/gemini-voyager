import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findComposer, insertIntoComposer, readComposer } from './index';

const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

function giveFieldGeometry(field: HTMLElement): void {
  const rect = new DOMRect(0, 0, 300, 60);
  Object.defineProperty(field, 'getClientRects', { value: () => [rect] });
  Object.defineProperty(field, 'getBoundingClientRect', { value: () => rect });
}

function showField<T extends HTMLElement>(field: T): T {
  giveFieldGeometry(field);
  document.body.append(field);
  return field;
}

function editable(text = ''): HTMLDivElement {
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  field.className = 'ProseMirror';
  field.tabIndex = 0;
  field.textContent = text;
  return showField(field);
}

function selectText(field: HTMLElement, start: number, end = start): void {
  const node = field.firstChild;
  if (!(node instanceof Text)) throw new Error('Fixture must contain a text node');
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  if (!selection) throw new Error('Fixture requires a Selection');
  selection.removeAllRanges();
  selection.addRange(range);
}

// jsdom has no editing engine; emulate the observable insertion into its real Range.
function installEditingCommands() {
  const command = vi.fn((name: string, _showUI?: boolean, value?: string): boolean => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return false;
    if (name !== 'insertText' && name !== 'insertParagraph' && name !== 'delete') return false;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    if (name === 'delete') return true;
    const node = document.createTextNode(name === 'insertParagraph' ? '\n' : (value ?? ''));
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  });
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: command,
  });
  return command;
}

beforeEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
  if (originalExecCommand) {
    Object.defineProperty(document, 'execCommand', originalExecCommand);
  } else {
    Reflect.deleteProperty(document, 'execCommand');
  }
});

describe('findComposer', () => {
  it('finds the current ChatGPT composer through an adapter selector without a legacy id', () => {
    const field = editable();
    field.setAttribute('data-composer-markdown', '');
    const adapter = {
      selectors: { composer: '#prompt-textarea, [data-composer-markdown][contenteditable="true"]' },
    };

    expect(document.getElementById('prompt-textarea')).toBeNull();
    expect(findComposer(adapter)).toBe(field);
    expect(findComposer(null)).toBeNull();
    expect(findComposer('[')).toBeNull();
  });

  it('skips disabled, readonly and inaccessible editors, including hidden ancestors', () => {
    document.body.innerHTML = `
      <textarea disabled></textarea>
      <textarea readonly></textarea>
      <textarea hidden></textarea>
      <div inert><textarea></textarea></div>
      <div aria-hidden="true"><textarea></textarea></div>
      <div aria-disabled="true"><textarea></textarea></div>
      <div style="display:none"><textarea></textarea></div>
      <div style="visibility:hidden"><textarea></textarea></div>
      <div contenteditable="false" role="textbox"></div>
      <input type="checkbox">
    `;
    for (const candidate of document.querySelectorAll<HTMLElement>(
      'textarea, input, [role="textbox"]',
    )) {
      giveFieldGeometry(candidate);
    }
    const field = showField(document.createElement('textarea'));

    expect(findComposer('textarea, [role="textbox"], input')).toBe(field);
    field.remove();
    expect(findComposer('textarea, [role="textbox"], input')).toBeNull();
  });

  it('can require an unambiguous editable match and search a supplied document', () => {
    const first = showField(document.createElement('textarea'));
    const second = showField(document.createElement('textarea'));
    expect(findComposer('textarea', { requireUnique: true })).toBeNull();
    second.disabled = true;
    expect(findComposer('textarea', { requireUnique: true })).toBe(first);

    const other = document.implementation.createHTMLDocument('isolated');
    const isolated = other.createElement('textarea');
    other.body.append(isolated);
    expect(findComposer('textarea', { doc: other, requireVisible: false })).toBe(isolated);
  });
});

describe('readComposer', () => {
  it('reads a plain input value and normalizes contenteditable line endings and spaces', () => {
    const field = showField(document.createElement('textarea'));
    field.value = 'first\nsecond';
    expect(readComposer(field)).toBe('first\nsecond');
    const rich = editable();
    Object.defineProperty(rich, 'innerText', {
      configurable: true,
      value: 'first\r\nsecond\u00a0word',
    });
    expect(readComposer(rich)).toBe('first\nsecond word');
  });

  it('reads an empty ProseMirror paragraph as an empty draft and preserves paragraph/br breaks', () => {
    const field = editable();
    field.innerHTML = '<p><br></p>';
    expect(readComposer(field)).toBe('');
    field.innerHTML = '<p>first<br>second</p><p>third</p><p><br></p><p>last</p>';
    expect(readComposer(field)).toBe('first\nsecond\nthird\n\nlast');
  });
});

describe('insertIntoComposer on plain fields', () => {
  it.each(['textarea', 'input'] as const)('bypasses a React value tracker on %s', (tag) => {
    const field = showField(document.createElement(tag));
    const prototype =
      tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const value = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (!value?.get || !value.set) throw new Error('Fixture requires native value accessors');
    let tracked = '';
    let hostDraft = '';
    Object.defineProperty(field, 'value', {
      configurable: true,
      get: () => value.get?.call(field),
      set: (next: string) => {
        tracked = next;
        value.set?.call(field, next);
      },
    });
    field.addEventListener('input', () => {
      if (field.value === tracked) return;
      hostDraft = field.value;
      tracked = field.value;
    });

    field.value += 'dropped';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(hostDraft).toBe('');
    expect(insertIntoComposer(field, 'accepted', 'replace')).toBe(true);
    expect(hostDraft).toBe('accepted');
    expect(field.value).toBe('accepted');
  });

  it.each(['textarea', 'input'] as const)(
    'supports all modes and leaves the %s caret after insertion',
    (tag) => {
      const field = showField(document.createElement(tag));
      const input = vi.fn();
      document.body.addEventListener('input', input);
      try {
        for (const [mode, expected, caret] of [
          ['append', 'abCDxy!', 7],
          ['replace', '!', 1],
          ['insertAtCursor', 'ab!xy', 3],
        ] as const) {
          field.value = 'abCDxy';
          field.setSelectionRange(2, 4);
          expect(insertIntoComposer(field, '!', mode)).toBe(true);
          expect(field.value).toBe(expected);
          expect(field.selectionStart).toBe(caret);
          expect(field.selectionEnd).toBe(caret);
        }
        expect(input).toHaveBeenCalledTimes(3);
        expect(insertIntoComposer(field, field.value, 'replace')).toBe(false);
      } finally {
        document.body.removeEventListener('input', input);
      }
    },
  );

  it('rejects unsupported and readonly fields without changing their contents', () => {
    const readonly = showField(document.createElement('textarea'));
    readonly.value = 'keep';
    readonly.readOnly = true;
    const unsupported = showField(document.createElement('div'));
    unsupported.textContent = 'keep';
    const checkbox = showField(document.createElement('input'));
    checkbox.type = 'checkbox';
    checkbox.value = 'keep';
    for (const field of [readonly, unsupported, checkbox]) {
      expect(insertIntoComposer(field, 'changed', 'replace')).toBe(false);
    }
    expect(readonly.value).toBe('keep');
    expect(unsupported.textContent).toBe('keep');
    expect(checkbox.value).toBe('keep');
  });
});

describe('insertIntoComposer on ProseMirror', () => {
  it('appends, replaces and inserts at the cursor using the selected editable range', () => {
    installEditingCommands();
    const field = editable();
    for (const [mode, expected] of [
      ['append', 'abCDxy!'],
      ['replace', '!'],
      ['insertAtCursor', 'ab!xy'],
    ] as const) {
      field.textContent = 'abCDxy';
      selectText(field, 2, 4);
      expect(insertIntoComposer(field, '!', mode)).toBe(true);
      expect(readComposer(field)).toBe(expected);
      expect(document.activeElement).toBe(field);
    }
  });

  it('passes multiline text to one editing command without synthetic keyboard or send events', () => {
    const command = installEditingCommands();
    const field = editable('draft');
    const forbidden = vi.fn();
    const form = document.createElement('form');
    const send = document.createElement('button');
    send.type = 'submit';
    document.body.append(form);
    form.append(field, send);
    form.addEventListener('submit', forbidden);
    send.addEventListener('click', forbidden);
    for (const type of ['keydown', 'keyup', 'beforeinput']) {
      field.addEventListener(type, forbidden);
    }
    const text = 'first\nsecond\nthird';
    expect(insertIntoComposer(field, text, 'replace')).toBe(true);
    expect(readComposer(field)).toBe(text);
    expect(command).toHaveBeenCalledExactlyOnceWith('insertText', false, text);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('appends at the editor end when the cursor selection belongs to page content', () => {
    installEditingCommands();
    const outside = editable('selected page content');
    const field = editable('draft');
    selectText(outside, 0, 8);
    expect(insertIntoComposer(field, ' appended', 'insertAtCursor')).toBe(true);
    expect(readComposer(field)).toBe('draft appended');
    expect(readComposer(outside)).toBe('selected page content');
  });

  it('clears only the chosen editor using a scoped delete command', () => {
    const command = installEditingCommands();
    const other = editable('other unsent draft');
    const field = editable('clear this draft');
    selectText(other, 0, 5);
    expect(insertIntoComposer(field, '', 'replace')).toBe(true);
    expect(readComposer(field)).toBe('');
    expect(readComposer(other)).toBe('other unsent draft');
    expect(command).toHaveBeenCalledExactlyOnceWith('delete', false);
    expect(insertIntoComposer(field, '', 'replace')).toBe(false);
  });

  it('does not pretend an ignored or failed editing command changed the host draft', () => {
    const command = installEditingCommands();
    const field = editable();
    field.innerHTML = '<p>keep</p>';
    for (const accepted of [false, true]) {
      command.mockReturnValue(accepted);
      expect(insertIntoComposer(field, 'changed', 'replace')).toBe(false);
      expect(field.innerHTML).toBe('<p>keep</p>');
    }
    command.mockImplementation(() => {
      throw new Error('Editing command unavailable');
    });
    expect(insertIntoComposer(field, 'changed', 'replace')).toBe(false);
    expect(field.innerHTML).toBe('<p>keep</p>');
  });
});

describe('insertIntoComposer preserves Quill editing behavior', () => {
  it('keeps per-line paragraph insertion for append and cursor insertion', () => {
    const command = installEditingCommands();
    const container = document.createElement('rich-textarea');
    const field = editable('abCDxy');
    container.append(field);
    document.body.append(container);
    selectText(field, 2, 4);
    expect(insertIntoComposer(field, 'first\nsecond', 'insertAtCursor')).toBe(true);
    expect(readComposer(field)).toBe('abfirst\nsecondxy');
    expect(command).toHaveBeenCalledWith('insertParagraph', false);
    expect(insertIntoComposer(field, '\nlast', 'append')).toBe(true);
    expect(readComposer(field)).toBe('abfirst\nsecondxy\nlast');
  });

  it('keeps replacement fallback and removes the Quill blank marker', () => {
    const command = installEditingCommands();
    command.mockReturnValue(false);
    const field = editable('old');
    field.className = 'ql-editor ql-blank';
    const input = vi.fn();
    field.addEventListener('input', input);
    expect(insertIntoComposer(field, 'first\nsecond', 'replace')).toBe(true);
    expect(readComposer(field)).toBe('first\nsecond');
    expect(field.classList.contains('ql-blank')).toBe(false);
    expect(command).toHaveBeenCalledExactlyOnceWith('insertText', false, 'first\nsecond');
    expect(input).toHaveBeenCalledOnce();
  });
});
