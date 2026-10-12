import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startHighlightAction } from '../../highlight/highlightAction';
import { HighlightManager } from '../../highlight/manager';
import { startQuoteAction } from '../../quoteReply/quoteAction';
import { registerSelectionAction, startSelectionToolbarHost } from '../host';

vi.mock('../../inputCollapse/index', () => ({ expandInputCollapseIfNeeded: vi.fn() }));

const RECT = { top: 200, bottom: 210, left: 100, right: 110, width: 10, height: 10 };
const RANGE_GEOMETRY = ['getBoundingClientRect', 'getClientRects'] as const;
const originalGeometry = RANGE_GEOMETRY.map((name) =>
  Object.getOwnPropertyDescriptor(Range.prototype, name),
);
const stops: Array<() => void> = [];

function start(stop: () => void): () => void {
  stops.push(stop);
  return stop;
}

function installConversation(): void {
  document.body.innerHTML = `
    <main>
      <div class="conversation-container" id="1111111111111111">
        <div class="user-query-bubble-with-background"><p id="user">Question text</p></div>
        <model-response><message-content><p id="assistant">Answer text</p></message-content></model-response>
      </div>
    </main>
    <nav><p id="nav">Recent chat</p></nav>
    <textarea></textarea>
  `;
  const input = document.querySelector('textarea')!;
  input.getBoundingClientRect = () => ({ ...RECT, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  input.scrollIntoView = vi.fn();
}

/** Change the page selection only, as a script or a keyboard shortcut the host ignores would. */
function setSelection(id: string, start = 0, end = 6): void {
  const text = document.getElementById(id)?.firstChild;
  if (!(text instanceof Text)) throw new Error(`Expected text in #${id}`);
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** A mouse selection the host has not measured yet: still inside its debounce window. */
function selectUnsettled(id: string, start = 0, end = 6): void {
  setSelection(id, start, end);
  document.dispatchEvent(new MouseEvent('mouseup'));
}

function select(id: string, start = 0, end = 6): void {
  selectUnsettled(id, start, end);
  vi.advanceTimersByTime(250);
}

const toolbar = () => document.querySelector<HTMLElement>('.gv-selection-toolbar');
const isShown = (element: Element | null | undefined) =>
  Boolean(element?.isConnected && !element.classList.contains('gv-hidden'));
const quoteButton = () => document.querySelector<HTMLButtonElement>('.gv-quote-btn');
const highlightButton = () => document.querySelector<HTMLButtonElement>('.gv-highlight-action');

describe('selection toolbar host', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(HighlightManager.prototype, 'init').mockResolvedValue();
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...RECT, x: 0, y: 0, toJSON: () => ({}) }),
    });
    installConversation();
  });

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    RANGE_GEOMETRY.forEach((name, index) => {
      const descriptor = originalGeometry[index];
      if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
      else Reflect.deleteProperty(Range.prototype, name);
    });
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it('shows only the highlight button on an assistant selection when quote is off', () => {
    start(startSelectionToolbarHost());
    start(startHighlightAction({}));

    select('assistant');

    expect(isShown(toolbar())).toBe(true);
    expect(isShown(highlightButton())).toBe(true);
    expect(quoteButton()).toBeNull();
  });

  it('shows no toolbar on a user selection when only highlight is on', () => {
    start(startSelectionToolbarHost());
    start(startHighlightAction({}));

    select('user');

    expect(isShown(toolbar())).toBe(false);
  });

  it('shows only the quote button when highlight is off', () => {
    start(startSelectionToolbarHost());
    start(startQuoteAction());

    select('assistant');
    expect(isShown(quoteButton())).toBe(true);
    expect(highlightButton()).toBeNull();

    select('user');
    expect(isShown(toolbar())).toBe(true);
    expect(isShown(quoteButton())).toBe(true);
  });

  it('hides the toolbar when no action is registered', () => {
    start(startSelectionToolbarHost());
    const stopQuote = startQuoteAction();
    select('assistant');
    expect(isShown(toolbar())).toBe(true);

    stopQuote();
    expect(isShown(toolbar())).toBe(false);
    select('user');
    expect(isShown(toolbar())).toBe(false);
  });

  it('one toolbar for both actions', () => {
    start(startSelectionToolbarHost());
    start(startHighlightAction({}));
    start(startQuoteAction());

    select('assistant');

    expect(document.querySelectorAll('.gv-selection-toolbar')).toHaveLength(1);
    const buttons = Array.from(toolbar()!.querySelectorAll('.gv-selection-action'));
    expect(buttons.map((button) => button.classList.contains('gv-quote-btn'))).toEqual([
      true,
      false,
    ]);
    expect(buttons.every(isShown)).toBe(true);
    expect(isShown(document.querySelector('.gv-highlight-color-trigger'))).toBe(true);
  });

  it('an old quote unregister does not remove a newer quote action', () => {
    start(startSelectionToolbarHost());
    const stopOldQuote = startQuoteAction();
    start(startQuoteAction());

    stopOldQuote();
    stopOldQuote();
    select('assistant');

    expect(isShown(quoteButton())).toBe(true);
  });

  it('a finished highlight does not clear a selection made after it', async () => {
    let finishSave = (_saved: boolean): void => {};
    vi.spyOn(HighlightManager.prototype, 'createFromRange').mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishSave = resolve;
      }),
    );
    start(startSelectionToolbarHost());
    start(startQuoteAction());
    start(startHighlightAction({}));
    select('assistant');
    highlightButton()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    highlightButton()!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    highlightButton()!.click();

    select('user', 0, 8);
    finishSave(true);
    await Promise.resolve();

    expect(window.getSelection()?.toString()).toBe('Question');
    expect(isShown(toolbar())).toBe(true);
  });

  describe('a highlight save that finishes while the user selects again', () => {
    function clickHighlightWithPendingSave(): (saved: boolean) => void {
      let finishSave = (_saved: boolean): void => {};
      vi.spyOn(HighlightManager.prototype, 'createFromRange').mockReturnValue(
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
      );
      start(startSelectionToolbarHost());
      start(startHighlightAction({}));
      select('assistant');
      highlightButton()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      highlightButton()!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      highlightButton()!.click();
      return finishSave;
    }

    it('does not clear a selection still inside the debounce window', async () => {
      const finishSave = clickHighlightWithPendingSave();

      selectUnsettled('user', 0, 8);
      finishSave(true);
      await Promise.resolve();

      expect(window.getSelection()?.toString()).toBe('Question');
    });

    it('does not clear a selection that changed without a mouse or key event', async () => {
      const finishSave = clickHighlightWithPendingSave();

      setSelection('user', 0, 8);
      finishSave(true);
      await Promise.resolve();

      expect(window.getSelection()?.toString()).toBe('Question');
    });

    it('still clears the selection it was saved from', async () => {
      const finishSave = clickHighlightWithPendingSave();

      finishSave(true);
      await Promise.resolve();

      expect(window.getSelection()?.toString()).toBe('');
    });
  });

  it('a toolbar click inside the debounce window does not act on the previous selection', () => {
    start(startSelectionToolbarHost());
    start(startQuoteAction());
    select('assistant');

    selectUnsettled('user', 0, 8);
    quoteButton()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    quoteButton()!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    quoteButton()!.click();
    vi.advanceTimersByTime(200);

    expect(document.querySelector('textarea')!.value).toBe('');
  });

  it('clears the selection a finished action started from', () => {
    start(startSelectionToolbarHost());
    start(startQuoteAction());
    select('assistant');

    quoteButton()!.click();

    expect(window.getSelection()?.toString()).toBe('');
    expect(isShown(toolbar())).toBe(false);
  });

  it('does not show the toolbar for navigation or composer selections', () => {
    start(startSelectionToolbarHost());
    start(startQuoteAction());

    select('nav');
    expect(toolbar()).toBeNull();
  });

  it('follows a keyboard selection made with Shift and arrow keys', () => {
    start(startSelectionToolbarHost());
    start(startQuoteAction());
    const text = document.getElementById('assistant')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 6);
    window.getSelection()!.addRange(range);

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    vi.advanceTimersByTime(250);

    expect(isShown(quoteButton())).toBe(true);
  });

  it('toolbar host stop leaves nothing on detached hosts after a re-render', () => {
    const stopHost = startSelectionToolbarHost();
    start(startQuoteAction());
    start(startHighlightAction({}));
    select('assistant');
    const shown = toolbar()!;
    document.querySelector<HTMLButtonElement>('.gv-highlight-color-trigger')!.click();
    document.querySelector<HTMLButtonElement>('[data-highlight-color="pink"]')!.click();

    // Gemini re-renders the page body and drops the toolbar with it.
    shown.remove();
    installConversation();
    select('assistant');
    expect(toolbar()).toBe(shown);
    expect(isShown(shown)).toBe(true);

    stopHost();
    expect(shown.isConnected).toBe(false);
    expect(document.querySelector('.gv-selection-toolbar')).toBeNull();
    expect(document.getElementById('gemini-voyager-quote-reply-style')).toBeNull();
    expect(
      document.documentElement.classList.contains('gv-highlight-selection-preview-active'),
    ).toBe(false);
    select('assistant');
    expect(document.querySelector('.gv-selection-toolbar')).toBeNull();
  });

  it("a retired host's late stop leaves the new host's toolbar and style", () => {
    const stopOld = startSelectionToolbarHost();
    start(startQuoteAction());
    start(startSelectionToolbarHost());

    stopOld();
    select('assistant');

    expect(document.querySelectorAll('.gv-selection-toolbar')).toHaveLength(1);
    expect(isShown(quoteButton())).toBe(true);
    expect(document.getElementById('gemini-voyager-quote-reply-style')).not.toBeNull();
  });

  it('tracks the first selected line, hides offscreen and cancels geometry work on teardown', () => {
    const rect = { top: 200, bottom: 400, left: 100, width: 100, height: 200 };
    const measureRange = vi.fn(() => rect as DOMRect);
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: measureRange,
    });
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [{ ...rect, top: 210, bottom: 220, height: 10 }] as unknown as DOMRectList,
    });
    const stopHost = startSelectionToolbarHost();
    const unregister = registerSelectionAction({
      id: 'probe',
      order: 1,
      className: 'gv-probe',
      label: () => 'Probe',
      createIcon: () => document.createElement('i'),
      isAvailable: () => true,
      run: () => false,
    });
    try {
      select('assistant');
      const element = toolbar()!;
      const measureToolbar = vi
        .spyOn(element, 'getBoundingClientRect')
        .mockReturnValue({ width: 80, height: 30 } as DOMRect);
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
      expect(element.style.top).toBe('164px');
      expect(element.style.left).toBe('110px');
      rect.top = window.innerHeight + 1;
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
      expect(element.classList.contains('gv-hidden')).toBe(true);
      rect.top = 200;
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
      expect(element.classList.contains('gv-hidden')).toBe(false);
      window.dispatchEvent(new Event('scroll'));
      stopHost();
      measureRange.mockClear();
      measureToolbar.mockClear();
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
      expect(measureRange).not.toHaveBeenCalled();
      expect(measureToolbar).not.toHaveBeenCalled();
      expect(document.querySelector('.gv-selection-toolbar')).toBeNull();
    } finally {
      unregister();
      stopHost();
    }
  });
});
