import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CleanupPositions } from '@/core/types/cleanupPositions';
import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { createUserLatexOwner } from '@/core/utils/userLatexSource';

import { type NativeFeature, createNativeFeatureToggle } from '../../featureLifecycle';
import {
  USER_LATEX_TOGGLE,
  _resetUserLatexKatexLoader,
  _setUserLatexKatexLoaderForTest,
  renderUserLatex,
  restoreUserLatex,
  startUserLatex,
  stopUserLatex,
} from '../index';

const renderToString = vi.fn((tex: string) => `<span class="katex">${tex}</span>`);
vi.mock('katex', () => ({ default: { renderToString } }));

const katexModule = { default: { renderToString } } as unknown as typeof import('katex');

/** Gemini's sent user line (see the module header). */
function userLine(text: string): HTMLElement {
  const line = document.createElement('p');
  line.className = 'query-text-line';
  line.textContent = text;
  document.body.append(line);
  return line;
}

const rendered = (line: Element) => line.querySelectorAll('.katex').length > 0;
const OWNER = 'data-user-latex-owner';

/** KaTeX waits until `settle` resolves (or rejects) it. */
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

const feature: NativeFeature = {
  id: 'user-latex',
  position: CleanupPositions.CleanupCodeBlockCollapse,
  start: startUserLatex,
  toggle: USER_LATEX_TOGGLE,
};
const flip = (newValue: unknown) => ({ [StorageKeys.USER_LATEX_ENABLED]: { newValue } });

describe('Gemini user LaTeX lifecycle', () => {
  beforeEach(() => {
    _resetUserLatexKatexLoader();
    renderToString.mockClear();
    document.body.innerHTML = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stopUserLatex();
    vi.restoreAllMocks();
  });

  it('reads a missing or non-false switch as on, like the plugin binding', () => {
    expect([undefined, null, true, 'false', 0].map(USER_LATEX_TOGGLE.isEnabled)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(USER_LATEX_TOGGLE.isEnabled(false)).toBe(false);
    expect(USER_LATEX_TOGGLE.key).toBe('gvUserLatexEnabled');
  });

  it('turns user LaTeX off and on live from the popup switch while the native module owns it', async () => {
    const line = userLine('Euler $e^{i\\pi}$');
    const manager = new CleanupManager();
    const toggle = createNativeFeatureToggle(manager, feature);
    await toggle.applyInitial(true);
    await vi.waitFor(() => expect(rendered(line)).toBe(true));

    toggle.handleChange(flip(false), 'sync');
    await vi.waitFor(() => expect(toggle.isMounted()).toBe(false));
    expect(line.textContent).toBe('Euler $e^{i\\pi}$');
    expect(line.attributes).toHaveLength(1);
    // Nothing renders while it is off, not even a line that arrives later.
    const later = userLine('later $x$');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(rendered(later)).toBe(false);

    toggle.handleChange(flip(true), 'sync');
    await vi.waitFor(() => expect(rendered(line) && rendered(later)).toBe(true));
    expect(manager.list()).toHaveLength(1);
  });

  it('keeps the switch flipped during the startup read instead of the late initial value', async () => {
    const line = userLine('$x$');
    const toggle = createNativeFeatureToggle(new CleanupManager(), feature);

    toggle.handleChange(flip(false), 'sync');
    await toggle.applyInitial(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(toggle.isMounted()).toBe(false);
    expect(rendered(line)).toBe(false);
    expect(line.hasAttribute(OWNER)).toBe(false);
  });

  it('stops user LaTeX twice without error and restores only the lines it rendered', async () => {
    const plain = userLine('no math here');
    const mine = userLine('mine $a$');
    const theirs = userLine('theirs $b$');
    // Another renderer (a plugin) holds this line first.
    const other = createUserLatexOwner('plugin');
    await renderUserLatex(theirs, { owner: other });
    const stop = startUserLatex();
    await vi.waitFor(() => expect(rendered(mine)).toBe(true));
    expect(renderToString).toHaveBeenCalledTimes(2);

    stop();
    stop();

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
    const stopFirst = startUserLatex();
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
    stopFirst();

    // Cancelled while loading: stopping lets go, and the late load renders nothing.
    const loading = holdKatex();
    const stopSecond = startUserLatex();
    expect(line.hasAttribute(OWNER)).toBe(true);
    stopSecond();
    expect(line.hasAttribute(OWNER)).toBe(false);
    const retry = renderUserLatex(line, { owner: other });
    loading.resolve();
    await retry;
    expect(rendered(line)).toBe(true);
    // Rendered once, by the renderer that claimed it after the cancel.
    expect(line.getAttribute(OWNER)).toBe(other);
    expect(renderToString).toHaveBeenCalledTimes(1);
  });

  it('renders nothing into a line Gemini detached while KaTeX loaded once user LaTeX stopped', async () => {
    const line = userLine('detached $x$');
    const loading = holdKatex();
    const stop = startUserLatex();
    expect(line.hasAttribute(OWNER)).toBe(true);

    line.remove();
    stop();
    loading.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rendered(line)).toBe(false);
    expect(line.textContent).toBe('detached $x$');
    expect(line.hasAttribute(OWNER)).toBe(false);
    expect(line.dataset.userLatexProcessed).toBeUndefined();
  });

  it('lets the next user LaTeX run render a line Gemini detached and re-inserted around a stop', async () => {
    const line = userLine('moved $y$');
    const stopFirst = startUserLatex();
    await vi.waitFor(() => expect(rendered(line)).toBe(true));
    const first = line.getAttribute(OWNER);

    line.remove();
    stopFirst();
    // Put back as text while detached, so it is plain when Gemini re-inserts it.
    expect(line.textContent).toBe('moved $y$');
    expect(line.hasAttribute(OWNER)).toBe(false);
    document.body.append(line);

    startUserLatex();
    await vi.waitFor(() => expect(rendered(line)).toBe(true));
    expect(line.getAttribute(OWNER)).not.toBe(first);
    expect(line.querySelectorAll('.katex')).toHaveLength(1);
  });
});
