import { afterEach, describe, expect, it } from 'vitest';

import { SHADOW_SURFACE_ATTR, installShadowKeyGuard } from '..';

type Scene = {
  field: HTMLElement;
  pageSaw: string[];
  fieldSaw: string[];
  press: (key: string) => KeyboardEvent;
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = '';
});

/**
 * A page window-capture shortcut registered after the guard (the guard loads at
 * document_start), and a field inside a shadow root.
 */
function scene({
  marked = true,
  field = document.createElement('input'),
  guard = true,
}: { marked?: boolean; field?: HTMLElement; guard?: boolean } = {}): Scene & {
  stop: () => void;
} {
  const stop = guard ? installShadowKeyGuard() : () => {};
  cleanups.push(stop);
  const host = document.createElement('div');
  if (marked) host.setAttribute(SHADOW_SURFACE_ATTR, '');
  document.body.appendChild(host);
  host.attachShadow({ mode: 'open' }).appendChild(field);

  const pageSaw: string[] = [];
  const pageShortcut = (e: KeyboardEvent) => {
    pageSaw.push(`${e.type}:${e.key}`);
    if (e.key === 'j') e.preventDefault();
  };
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    window.addEventListener(type, pageShortcut, true);
    cleanups.push(() => window.removeEventListener(type, pageShortcut, true));
  }

  const fieldSaw: string[] = [];
  field.addEventListener('keydown', (e) => {
    fieldSaw.push(`${e.type}:${e.key}`);
    if (e.key === 'Enter') e.preventDefault();
  });

  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    field.dispatchEvent(event);
    return event;
  };
  return { field, pageSaw, fieldSaw, press, stop };
}

describe('shadow key guard', () => {
  it('keeps keys typed into a marked surface field from a page capture listener', () => {
    const { pageSaw, fieldSaw, press } = scene();

    const letter = press('j');
    const enter = press('Enter');

    expect(pageSaw).toEqual([]);
    expect(fieldSaw).toEqual(['keydown:j', 'keydown:Enter']);
    // The page never cancelled the letter, so the browser still types it; the
    // field's own Enter handling still cancels the original key.
    expect(letter.defaultPrevented).toBe(false);
    expect(enter.defaultPrevented).toBe(true);
  });

  it('also covers keypress and keyup', () => {
    const { field, pageSaw } = scene();
    for (const type of ['keypress', 'keyup']) {
      field.dispatchEvent(new KeyboardEvent(type, { key: 'k', bubbles: true, composed: true }));
    }
    expect(pageSaw).toEqual([]);
  });

  it('protects contenteditable fields', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    const { pageSaw, press } = scene({ field: editable });
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    press('j');
    expect(pageSaw).toEqual([]);
  });

  it('leaves keys alone in an unmarked shadow root', () => {
    const { pageSaw, fieldSaw, press } = scene({ marked: false });
    press('j');
    expect(pageSaw).toEqual(['keydown:j']);
    expect(fieldSaw).toEqual(['keydown:j']);
  });

  it('leaves keys alone on a control that is not a text field', () => {
    const { pageSaw, press } = scene({ field: document.createElement('button') });
    press('j');
    expect(pageSaw).toEqual(['keydown:j']);
  });

  it('stops guarding once removed', () => {
    const { pageSaw, press, stop } = scene();
    stop();
    press('j');
    expect(pageSaw).toEqual(['keydown:j']);
  });

  it('cannot help a page capture listener registered before it', () => {
    const { pageSaw, press } = scene({ guard: false });
    cleanups.push(installShadowKeyGuard());
    press('a');
    expect(pageSaw).toEqual(['keydown:a']);
  });
});
