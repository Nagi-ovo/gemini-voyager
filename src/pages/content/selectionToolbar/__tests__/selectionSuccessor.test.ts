/**
 * Two content-script copies on one page, as after an extension update: the retiring copy's
 * highlight save is still pending when its successor starts, and only finishes afterwards. Each
 * `vi.resetModules()` import is a separate copy with its own module state, sharing the DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../inputCollapse/index', () => ({ expandInputCollapseIfNeeded: vi.fn() }));

const RECT = { top: 200, bottom: 210, left: 100, right: 110, width: 10, height: 10 };

interface SelectionCopy {
  startHost: typeof import('../host').startSelectionToolbarHost;
  startQuote: typeof import('../../quoteReply/quoteAction').startQuoteAction;
  startHighlight: typeof import('../../highlight/highlightAction').startHighlightAction;
  Manager: typeof import('../../highlight/manager').HighlightManager;
}

async function loadCopy(): Promise<SelectionCopy> {
  vi.resetModules();
  const [host, quote, highlight, manager] = await Promise.all([
    import('../host'),
    import('../../quoteReply/quoteAction'),
    import('../../highlight/highlightAction'),
    import('../../highlight/manager'),
  ]);
  vi.spyOn(manager.HighlightManager.prototype, 'init').mockResolvedValue();
  return {
    startHost: host.startSelectionToolbarHost,
    startQuote: quote.startQuoteAction,
    startHighlight: highlight.startHighlightAction,
    Manager: manager.HighlightManager,
  };
}

function select(id: string, end: number): void {
  const text = document.getElementById(id)?.firstChild;
  if (!(text instanceof Text)) throw new Error(`Expected text in #${id}`);
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, end);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup'));
  vi.advanceTimersByTime(250);
}

function press(button: HTMLButtonElement): void {
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  button.click();
}

const shownButtons = (selector: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).filter(
    (button) => button.isConnected && !button.classList.contains('gv-hidden'),
  );

describe('a selection toolbar successor while the retired copy finishes late', () => {
  const stops: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...RECT, x: 0, y: 0, toJSON: () => ({}) }),
    });
    document.body.innerHTML = `
      <main>
        <div class="conversation-container" id="1111111111111111">
          <div class="user-query-bubble-with-background"><p id="user">Question text</p></div>
          <model-response><message-content><p id="assistant">Answer text</p></message-content></model-response>
        </div>
      </main>
      <textarea></textarea>
    `;
    const input = document.querySelector('textarea')!;
    input.getBoundingClientRect = () => ({ ...RECT, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    input.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it('the successor keeps its selection and quotes normally after the old save finishes', async () => {
    const old = await loadCopy();
    let finishOldSave = (_saved: boolean): void => {};
    vi.spyOn(old.Manager.prototype, 'createFromRange').mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishOldSave = resolve;
      }),
    );
    const stopOldHost = old.startHost();
    const stopOldQuote = old.startQuote();
    const stopOldHighlight = old.startHighlight({});
    select('assistant', 6);
    press(shownButtons('.gv-highlight-action')[0]!);

    // Retirement stops the old copy's actions, then its host, while the save is pending.
    stopOldHighlight();
    stopOldQuote();
    stopOldHost();

    const successor = await loadCopy();
    stops.push(successor.startHost(), successor.startQuote());
    select('user', 8);
    expect(shownButtons('.gv-quote-btn')).toHaveLength(1);

    finishOldSave(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(window.getSelection()?.toString()).toBe('Question');
    expect(shownButtons('.gv-quote-btn')).toHaveLength(1);
    press(shownButtons('.gv-quote-btn')[0]!);
    vi.advanceTimersByTime(200);
    expect(document.querySelector('textarea')!.value).toBe('> Question\n');
  });
});
