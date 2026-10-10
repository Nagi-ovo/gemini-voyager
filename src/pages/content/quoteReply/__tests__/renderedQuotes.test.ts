import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderQuotedUserMessages, startRenderedQuoteStyling } from '../renderedQuotes';

function installUserMessage(lines: string[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'query-text';
  lines.forEach((text) => {
    const line = document.createElement('p');
    line.className = 'query-text-line';
    line.textContent = text;
    container.appendChild(line);
  });
  document.body.appendChild(container);
  return container;
}

function installComposer(lines: string[]): HTMLElement {
  const input = document.createElement('div');
  input.setAttribute('contenteditable', 'true');
  input.setAttribute('role', 'textbox');
  lines.forEach((text) => {
    const line = document.createElement('p');
    line.textContent = text;
    input.appendChild(line);
  });
  document.body.appendChild(input);
  return input;
}

describe('rendered Quote Reply blocks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('groups consecutive quote lines while preserving their raw text', () => {
    const container = installUserMessage([
      '> quoted context',
      '>',
      '> more context',
      'My follow-up question',
    ]);
    const raw = container.textContent;

    renderQuotedUserMessages();

    const wrapper = container.querySelector('blockquote.gv-rendered-quote');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelectorAll(':scope > .query-text-line')).toHaveLength(3);
    expect(wrapper?.querySelectorAll('.gv-rendered-quote-marker')).toHaveLength(3);
    expect(wrapper?.querySelector('.gv-rendered-quote-empty')).not.toBeNull();
    expect(wrapper?.nextElementSibling?.textContent).toBe('My follow-up question');
    expect(container.textContent).toBe(raw);
  });

  it('keeps separate quote runs separate and remains idempotent', () => {
    const container = installUserMessage(['> first quote', 'question', '> second quote']);

    renderQuotedUserMessages();
    renderQuotedUserMessages();

    expect(container.querySelectorAll(':scope > .gv-rendered-quote')).toHaveLength(2);
    expect(container.querySelectorAll('.gv-rendered-quote-marker')).toHaveLength(2);
    expect(container.textContent).toBe('> first quotequestion> second quote');
  });

  it('does not reinterpret a greater-than prefix without quote spacing', () => {
    const container = installUserMessage(['>not a quote']);

    renderQuotedUserMessages();

    expect(container.querySelector('.gv-rendered-quote')).toBeNull();
    expect(container.textContent).toBe('>not a quote');
  });

  it('groups quoted context in the composer without changing its text', () => {
    const input = installComposer(['> first quote', '> second quote', 'Follow-up']);
    const rawText = input.textContent;
    const cleanup = startRenderedQuoteStyling();
    const lines = Array.from(input.children);

    expect(lines[0].classList).toContain('gv-composer-quote-line');
    expect(lines[0].classList).toContain('gv-composer-quote-start');
    expect(lines[0].classList).not.toContain('gv-composer-quote-end');
    expect(lines[1].classList).toContain('gv-composer-quote-line');
    expect(lines[1].classList).toContain('gv-composer-quote-end');
    expect(lines[2].classList).not.toContain('gv-composer-quote-line');
    expect(input.textContent).toBe(rawText);

    cleanup();
    expect(input.querySelector('[class*="gv-composer-quote"]')).toBeNull();
  });

  it('updates composer quote styling as the user edits', () => {
    const input = installComposer(['Draft']);
    const line = input.firstElementChild;
    if (!(line instanceof HTMLElement)) throw new Error('Expected a composer line.');
    const cleanup = startRenderedQuoteStyling();

    line.textContent = '> Quoted';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(line.classList).toContain('gv-composer-quote-line');

    line.textContent = 'Plain text';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(line.classList).not.toContain('gv-composer-quote-line');

    cleanup();
  });

  it('decorates messages added after startup', async () => {
    const container = installUserMessage([]);
    const cleanup = startRenderedQuoteStyling();
    const line = document.createElement('p');
    line.className = 'query-text-line';
    line.textContent = '> arrived later';
    container.appendChild(line);

    await Promise.resolve();
    vi.advanceTimersByTime(80);

    expect(container.querySelector('blockquote.gv-rendered-quote')).not.toBeNull();
    cleanup();
  });

  it('restyles the composer when its lines are replaced without an input event', async () => {
    const input = installComposer(['Draft']);
    const cleanup = startRenderedQuoteStyling();
    const quoted = document.createElement('p');
    quoted.textContent = '> inserted context';

    input.replaceChildren(quoted);
    await Promise.resolve();
    vi.advanceTimersByTime(80);

    expect(quoted.classList).toContain('gv-composer-quote-line');
    cleanup();
  });

  it('styles a composer mounted after startup', async () => {
    const cleanup = startRenderedQuoteStyling();
    const host = document.createElement('div');
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');
    input.setAttribute('role', 'textbox');
    const line = document.createElement('p');
    line.textContent = '> quoted';
    input.appendChild(line);
    host.appendChild(input);

    document.body.appendChild(host);
    await Promise.resolve();
    vi.advanceTimersByTime(80);

    expect(line.classList).toContain('gv-composer-quote-line');
    cleanup();
  });

  it('does not measure layout while unrelated rows stream into the page', async () => {
    installComposer(['Draft']);
    const cleanup = startRenderedQuoteStyling();
    const measure = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    const list = document.createElement('div');
    document.body.appendChild(list);

    for (let i = 0; i < 20; i++) {
      const row = document.createElement('a');
      row.textContent = `Conversation ${i}`;
      list.appendChild(row);
    }
    await Promise.resolve();
    vi.advanceTimersByTime(80);

    expect(measure).not.toHaveBeenCalled();
    measure.mockRestore();
    cleanup();
  });

  it('restores a marker after another renderer repaints a quoted line', async () => {
    const container = installUserMessage(['> before $x$']);
    const cleanup = startRenderedQuoteStyling();
    const line = container.querySelector<HTMLElement>('.query-text-line');
    if (!line) throw new Error('Expected user message line.');

    line.textContent = '> after $y$';
    await Promise.resolve();
    vi.advanceTimersByTime(80);

    expect(line.querySelector('.gv-rendered-quote-marker')?.textContent).toBe('> ');
    expect(container.textContent).toBe('> after $y$');
    cleanup();
  });

  it('restores the original DOM on cleanup', () => {
    const container = installUserMessage(['> quoted context', 'question']);
    const raw = container.innerHTML;
    const cleanup = startRenderedQuoteStyling();

    cleanup();

    expect(container.querySelector('.gv-rendered-quote')).toBeNull();
    expect(container.querySelector('.gv-rendered-quote-marker')).toBeNull();
    expect(container.querySelector('.gv-rendered-quote-line')).toBeNull();
    expect(container.innerHTML).toBe(raw);
  });

  it('uses Voyager theme variables and logical properties in every browser', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    // Collect the rules by what they style, not by slicing between two comments:
    // the previous end anchor was an unrelated comment, so editing that comment
    // silently emptied this block and every assertion below passed on nothing.
    const block = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selector]) => /\.gv-(?:rendered-quote|composer-quote)/.test(selector))
      .map(([rule]) => rule)
      .join('\n');

    expect(block, 'no Quote Reply rules found').not.toBe('');

    expect(block).toContain('.gv-rendered-quote');
    expect(block).toContain('var(--gv-pm-brand, var(--gv-pm-brand-default))');
    expect(block).toContain('border-inline-start');
    expect(block).toContain('border-start-end-radius');
    expect(block).toContain('.gv-rendered-quote-marker');
    expect(block).toContain('.gv-composer-quote-line');
    expect(block).toContain('.gv-composer-quote-start');
    expect(block).toContain('.gv-composer-quote-end');
    expect(block).not.toContain('border-left');
  });
});
