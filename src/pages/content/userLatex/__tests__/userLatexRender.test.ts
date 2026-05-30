import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetUserLatexKatexLoader, startUserLatex } from '../index';

// Mock the dynamically-imported KaTeX module.
const renderToString = vi.fn((tex: string) => `<span class="katex-rendered">${tex}</span>`);
vi.mock('katex', () => ({ default: { renderToString } }));

function makeUserMessage(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'query-text-line';
  p.textContent = text;
  document.body.appendChild(p);
  return p;
}

// Let the dynamic import('katex') microtask + processElement resume.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('userLatex dynamic KaTeX rendering', () => {
  beforeEach(() => {
    _resetUserLatexKatexLoader();
    renderToString.mockClear();
    document.body.innerHTML = '';
  });

  it('lazily loads KaTeX and renders math when a user message contains LaTeX', async () => {
    const el = makeUserMessage('Euler: $e^{i\\pi}+1=0$ done');
    startUserLatex();
    await flush();

    expect(renderToString).toHaveBeenCalled();
    expect(el.dataset.userLatexProcessed).toBe('1');
    expect(el.querySelector('.katex-rendered')).not.toBeNull();
  });

  it('does not load KaTeX for messages without math', async () => {
    const el = makeUserMessage('just a $ sign, no closing delimiter');
    startUserLatex();
    await flush();

    expect(renderToString).not.toHaveBeenCalled();
    expect(el.dataset.userLatexProcessed).toBe('1');
  });

  it('does not clobber a node that was repainted while KaTeX was loading', async () => {
    const el = makeUserMessage('$x^2$');
    startUserLatex();
    // Gemini re-renders this node before the dynamic import resolves.
    el.textContent = 'totally new content';
    await flush();

    // The stale render must not overwrite the fresh content; the processed flag
    // is cleared so a later observer pass can handle the new text.
    expect(el.textContent).toBe('totally new content');
    expect(el.dataset.userLatexProcessed).toBeUndefined();
  });
});
