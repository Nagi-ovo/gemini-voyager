import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';

type TimelineManagerInternal = {
  turnTextCache: WeakMap<HTMLElement, { raw: string; summary: string }>;
  getTurnTextCached: (element: HTMLElement | null) => string;
  extractTurnText: (element: HTMLElement | null) => string;
};

function makeTurn(html: string): HTMLElement {
  const turn = document.createElement('div');
  turn.className = 'user-query-bubble-with-background';
  turn.innerHTML = html;
  document.body.appendChild(turn);
  return turn;
}

describe('TimelineManager turn-text cache (issue #753 follow-up)', () => {
  let manager: TimelineManager;
  let internal: TimelineManagerInternal;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    manager = new TimelineManager();
    internal = manager as unknown as TimelineManagerInternal;
  });

  it('computes the summary once for unchanged content', () => {
    const turn = makeTurn('<p class="query-text-line">Hello cache</p>');
    const extractSpy = vi.spyOn(internal, 'extractTurnText');

    expect(internal.getTurnTextCached(turn)).toBe('Hello cache');
    expect(internal.getTurnTextCached(turn)).toBe('Hello cache');
    expect(internal.getTurnTextCached(turn)).toBe('Hello cache');

    expect(extractSpy).toHaveBeenCalledTimes(1);
  });

  it('recomputes when the turn content changes in place', () => {
    const turn = makeTurn('<p class="query-text-line">Before edit</p>');
    const extractSpy = vi.spyOn(internal, 'extractTurnText');

    expect(internal.getTurnTextCached(turn)).toBe('Before edit');

    turn.querySelector('p')!.textContent = 'After edit';

    expect(internal.getTurnTextCached(turn)).toBe('After edit');
    expect(extractSpy).toHaveBeenCalledTimes(2);
  });

  it('recomputes when extension UI is injected into the turn after first extraction', () => {
    const turn = makeTurn('<p class="query-text-line">Stable text</p>');

    expect(internal.getTurnTextCached(turn)).toBe('Stable text');

    // A late-injected fork button changes raw textContent (invalidates the
    // cache) but must stay excluded from the recomputed summary.
    const fork = document.createElement('button');
    fork.className = 'gv-fork-btn';
    fork.textContent = 'Fork';
    turn.appendChild(fork);

    expect(internal.getTurnTextCached(turn)).toBe('Stable text');
  });

  it('keeps the cached summary clean of visually-hidden text', () => {
    const turn = makeTurn(
      '<span class="cdk-visually-hidden">You said</span><p class="query-text-line">Visible only</p>',
    );

    expect(internal.getTurnTextCached(turn)).toBe('Visible only');
    expect(internal.getTurnTextCached(turn)).toBe('Visible only');
  });

  it('returns empty string for null elements', () => {
    expect(internal.getTurnTextCached(null)).toBe('');
  });
});
