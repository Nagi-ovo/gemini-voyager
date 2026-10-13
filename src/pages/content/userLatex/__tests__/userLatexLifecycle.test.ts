import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createUserLatexOwner } from '@/core/utils/userLatexSource';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { userLatexPrimitive } from '@/features/plugins/verbs/userLatex';

import {
  _resetUserLatexKatexLoader,
  _setUserLatexKatexLoaderForTest,
  renderUserLatex,
  restoreUserLatex,
} from '../index';

const renderToString = vi.fn((tex: string) => `<span class="katex">${tex}</span>`);
vi.mock('katex', () => ({ default: { renderToString } }));
const katexModule = { default: { renderToString } } as unknown as typeof import('katex');
const OWNER = 'data-user-latex-owner';
const scopes: PluginScope[] = [];

function userLine(text: string): HTMLElement {
  const line = document.createElement('p');
  line.className = 'query-text-line';
  line.textContent = text;
  document.body.append(line);
  return line;
}
const rendered = (line: Element) => line.querySelectorAll('.katex').length > 0;

function holdKatex(): { resolve: () => void; reject: () => void } {
  let resolve!: () => void;
  let reject!: () => void;
  const loaded = new Promise<typeof import('katex')>((ok, fail) => {
    resolve = () => ok(katexModule);
    reject = () => fail(new Error('offline'));
  });
  _setUserLatexKatexLoaderForTest(() => loaded);
  return { resolve, reject };
}

function startPrimitive(): PluginScope {
  const scope = new PluginScope();
  scopes.push(scope);
  userLatexPrimitive.activate(
    scope,
    { turn: 'p.query-text-line', unit: 'turn' },
    {
      doc: document,
      adapter: null,
      pluginId: 'test.user-latex',
      settings: {},
      setTargetCounter: () => {},
    },
  );
  return scope;
}

describe('user LaTeX render ownership under its actual plugin primitive', () => {
  beforeEach(() => {
    _resetUserLatexKatexLoader();
    renderToString.mockClear();
    document.body.innerHTML = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    await Promise.all(scopes.splice(0).map((scope) => scope.dispose()));
    vi.restoreAllMocks();
  });

  it('disposing a user LaTeX plugin twice restores only its own lines and ignores a wrong-owner restore', async () => {
    const plain = userLine('no math here');
    const mine = userLine('mine $a$');
    const theirs = userLine('theirs $b$');
    // Another renderer (a plugin) holds this line first.
    const other = createUserLatexOwner('plugin');
    await renderUserLatex(theirs, { owner: other });
    const scope = startPrimitive();
    await vi.waitFor(() => expect(rendered(mine)).toBe(true));
    expect(renderToString).toHaveBeenCalledTimes(2);

    await scope.dispose();
    await scope.dispose();

    expect(mine.textContent).toBe('mine $a$');
    expect(mine.attributes).toHaveLength(1);
    expect(plain.attributes).toHaveLength(1);
    expect(rendered(theirs)).toBe(true);
    expect(theirs.dataset.userLatexOriginal).toBe('theirs $b$');
    restoreUserLatex(theirs, createUserLatexOwner('plugin'));
    expect(rendered(theirs)).toBe(true);
    restoreUserLatex(theirs, other);
    expect(theirs.textContent).toBe('theirs $b$');
  });

  it('keeps ownership of a line across a pending KaTeX load and drops it on failure or cancel', async () => {
    const line = userLine('pending $x$');
    const failing = holdKatex();
    const first = startPrimitive();
    const holder = line.getAttribute(OWNER);
    expect(holder).not.toBeNull();

    // Another renderer finds it held while KaTeX loads and leaves it alone.
    const other = createUserLatexOwner('plugin');
    await renderUserLatex(line, { owner: other });
    expect(line.getAttribute(OWNER)).toBe(holder);

    // A failed load lets go without touching the text, so another renderer may try.
    failing.reject();
    await vi.waitFor(() => expect(line.hasAttribute(OWNER)).toBe(false));
    expect(line.dataset.userLatexProcessed).toBeUndefined();
    expect(line.textContent).toBe('pending $x$');
    await first.dispose();

    // Cancelled while loading: stopping lets go, and the late load renders nothing.
    const loading = holdKatex();
    const second = startPrimitive();
    expect(line.hasAttribute(OWNER)).toBe(true);
    await second.dispose();
    expect(line.hasAttribute(OWNER)).toBe(false);
    const retry = renderUserLatex(line, { owner: other });
    loading.resolve();
    await retry;
    expect(rendered(line)).toBe(true);
    // Rendered once, by the renderer that claimed it after the cancel.
    expect(line.getAttribute(OWNER)).toBe(other);
    expect(renderToString).toHaveBeenCalledTimes(1);
  });
});
