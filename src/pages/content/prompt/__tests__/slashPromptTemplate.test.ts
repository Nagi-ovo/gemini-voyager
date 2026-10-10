import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PromptItem } from '@/core/types/sync';

import { expandAllPromptTokens } from '../slashPlacements';
import { startPromptSlashCommand } from '../slashPrompt';

const prompts: PromptItem[] = [
  {
    id: 'fable',
    name: 'Fable',
    text: '围绕 {{concept}} 这个概念,用 {{tone}} 的语气写一则寓言。',
    tags: ['writing'],
    createdAt: 1,
  },
  {
    id: 'plain',
    name: 'Plain',
    text: 'Review this code and report correctness issues.',
    tags: ['code'],
    createdAt: 2,
  },
];

function setRect(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    ({
      x: 20,
      y: 300,
      top: 300,
      left: 20,
      right: 420,
      bottom: 360,
      width: 400,
      height: 60,
      toJSON: () => ({}),
    }) as DOMRect;
}

function createContentEditable(text: string): HTMLElement {
  document.body.innerHTML = `<rich-textarea><div id="question-input" contenteditable="true" role="textbox"></div></rich-textarea>`;
  const input = document.getElementById('question-input')!;
  input.textContent = text;
  setRect(input);
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return input;
}

function typeInto(input: HTMLElement): void {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(input: HTMLElement, key: string): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function fillSurface(): HTMLElement | null {
  return document.querySelector('.gv-pm-fill');
}

function slots(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.gv-pm-fill .gv-pm-slot')];
}

function token(input: HTMLElement): HTMLElement | null {
  return input.querySelector('.gv-pm-slash-token');
}

describe('slash completion with template prompts', () => {
  let destroy: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    destroy?.();
    destroy = null;
    document.body.innerHTML = '';
  });

  it('asks for the values before it places a token', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    // Nothing has been committed to the composer yet.
    expect(token(input)).toBeNull();
    expect(fillSurface()).not.toBeNull();
    expect(slots().map((slot) => slot.dataset.gvVar)).toEqual(['concept', 'tone']);
    // The result list gets out of the way.
    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });

  it('stores the resolved body on the token so expansion stays unchanged', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const [concept, tone] = slots();
    concept.textContent = '沉没成本';
    tone.textContent = '克制';
    (document.querySelector('.gv-pm-fill .gv-pm-save') as HTMLButtonElement).click();

    const placed = token(input);
    expect(placed).not.toBeNull();
    // The chip still reads as the prompt's name…
    expect(placed?.textContent).toBe('Fable');
    // …while the body it will expand into is already resolved.
    expect(placed?.dataset.gvPromptText).toBe('围绕 沉没成本 这个概念,用 克制 的语气写一则寓言。');
    expect(fillSurface()).toBeNull();
  });

  it('offers the filled values as fields while the turn is unsent', () => {
    // The token carries an already-resolved body, so without this the preview
    // is a wall of template text with the reader's own answers buried in it -
    // and those answers are still theirs to change until the turn is sent.
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const [concept, tone] = slots();
    concept.textContent = '沉没成本';
    tone.textContent = '克制';
    concept.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const placed = token(input)!;
    placed.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = document.getElementById('gv-pm-slash-tooltip')!;
    const fields = [...tooltip.querySelectorAll<HTMLElement>('.gv-pm-slash-tooltip-value')];

    expect(fields.map((f) => f.textContent)).toEqual(['沉没成本', '克制']);
    // Editable, and able to wrap: an `<input>` cannot, and a long value ran
    // off the side of the card instead of flowing with the sentence.
    expect(
      fields.every((f) => f.tagName === 'SPAN' && f.getAttribute('contenteditable') === 'true'),
    ).toBe(true);
    // The template around them is not editable; that belongs in the manager.
    const prose = [...tooltip.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('');
    expect(prose).toBe('围绕  这个概念,用  的语气写一则寓言。');
  });

  it('sends what was changed in the preview', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const [concept, tone] = slots();
    concept.textContent = '沉没成本';
    tone.textContent = '克制';
    concept.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const placed = token(input)!;
    placed.dispatchEvent(new MouseEvent('mouseenter'));
    const field = document.querySelector<HTMLElement>('.gv-pm-slash-tooltip-value')!;
    field.textContent = '锚定效应';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    // Expansion reads the token's own body first, so the edit has to land there.
    const edited = '围绕 锚定效应 这个概念,用 克制 的语气写一则寓言。';
    expect(placed.dataset.gvPromptText).toBe(edited);
    // The overlay chip lives in a fixed container on `body`, outside the
    // composer, and carries its own copy of the body - the first version of
    // this sync looked the token up through the input and missed it entirely.
    const overlay = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token');
    if (overlay) expect(overlay.dataset.gvPromptText).toBe(edited);
  });

  it('sends the edit even when the host rebuilt the token as plain text', () => {
    // Expansion then falls back on the remembered record instead of the
    // token's dataset, so the edit has to reach that too.
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const [concept, tone] = slots();
    concept.textContent = '沉没成本';
    tone.textContent = '克制';
    concept.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const placed = token(input)!;
    placed.dispatchEvent(new MouseEvent('mouseenter'));
    const field = document.querySelector<HTMLElement>('.gv-pm-slash-tooltip-value')!;
    field.textContent = '锚定效应';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    // Strip the live token the way Gemini does when it rebuilds the turn, then
    // expand: what is sent has to be the edited body.
    placed.replaceWith(document.createTextNode('Fable'));
    expandAllPromptTokens();

    expect(input.textContent).toContain('锚定效应');
    expect(input.textContent).not.toContain('沉没成本');
  });

  it('leaves the list keys alone while a preview field has focus', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const [concept, tone] = slots();
    concept.textContent = '沉没成本';
    tone.textContent = '克制';
    concept.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const placed = token(input)!;
    placed.dispatchEvent(new MouseEvent('mouseenter'));
    const field = document.querySelector<HTMLElement>('.gv-pm-slash-tooltip-value')!;
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    let reachedDocument = false;
    document.addEventListener('keydown', () => (reachedDocument = true), { once: true });

    field.dispatchEvent(event);

    expect(reachedDocument).toBe(false);
    // A placeholder holds one value, never a second line.
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a preview unmarked when no template was filled', () => {
    const input = createContentEditable('/plain');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const placed = token(input)!;
    placed.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = document.getElementById('gv-pm-slash-tooltip')!;

    expect(tooltip.querySelector('.gv-pm-slash-tooltip-value')).toBeNull();
    expect(tooltip.textContent).toBe('Review this code and report correctness issues.');
  });

  it('keeps the placeholders when the user defers filling', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    (document.querySelector('.gv-pm-fill .gv-pm-cancel') as HTMLButtonElement).click();

    // "Keep as is" is the deferred path: the body expands literally at send.
    expect(token(input)?.dataset.gvPromptText).toBe(prompts[0].text);
  });

  it('shows the chosen prompt in the composer while its values are collected', () => {
    // A template places its token only once the values are in, so the composer
    // used to sit on the bare query - typing `/` and pressing Enter opened the
    // fill surface over a composer still reading `/`, which said nothing about
    // what had just been chosen.
    const input = createContentEditable('/');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    expect(fillSurface()).not.toBeNull();
    expect(input.textContent).toBe('/Fable');
  });

  it('leaves the query editable when the fill is abandoned', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    slots()[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(fillSurface()).toBeNull();
    expect(token(input)).toBeNull();
    // Nothing is placed, and the completed query is still text the user owns.
    expect(input.textContent).toBe('/Fable');
  });

  it('does not disturb a prompt that has no placeholders', () => {
    const input = createContentEditable('/plain');
    destroy = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    expect(fillSurface()).toBeNull();
    expect(token(input)?.dataset.gvPromptText).toBe(prompts[1].text);
  });

  it('takes an open fill surface down with the controller', () => {
    const input = createContentEditable('/fable');
    const controller = startPromptSlashCommand({ scheme: () => 'light', initialItems: prompts });
    destroy = controller.destroy;
    typeInto(input);
    press(input, 'Enter');
    expect(fillSurface()).not.toBeNull();

    controller.destroy();
    destroy = null;

    expect(fillSurface()).toBeNull();
  });
});
