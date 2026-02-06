import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';

describe('TimelineManager selector priority compatibility', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('prefers built-in selectors over stale auto-detected selector cache', async () => {
    const main = document.createElement('main');

    const defaultTurn = document.createElement('div');
    defaultTurn.className = 'user-query-bubble-with-background';
    defaultTurn.textContent = 'default turn';
    main.appendChild(defaultTurn);

    const staleTurn = document.createElement('div');
    staleTurn.className = 'stale-selector-target';
    staleTurn.textContent = 'stale turn';
    main.appendChild(staleTurn);

    document.body.appendChild(main);
    localStorage.setItem('geminiTimelineUserTurnSelectorAuto', '.stale-selector-target');

    const manager = new TimelineManager();
    const internal = manager as unknown as {
      findCriticalElements: () => Promise<boolean>;
      userTurnSelector: string;
    };

    const ok = await internal.findCriticalElements();
    expect(ok).toBe(true);
    expect(internal.userTurnSelector).toBe('.user-query-bubble-with-background');
    expect(localStorage.getItem('geminiTimelineUserTurnSelectorAuto')).toBe(
      '.user-query-bubble-with-background',
    );
  });

  it('keeps explicit user override as highest priority', async () => {
    const main = document.createElement('main');

    const defaultTurn = document.createElement('div');
    defaultTurn.className = 'user-query-bubble-with-background';
    defaultTurn.textContent = 'default turn';
    main.appendChild(defaultTurn);

    const customTurn = document.createElement('div');
    customTurn.className = 'custom-user-turn';
    customTurn.textContent = 'custom turn';
    main.appendChild(customTurn);

    document.body.appendChild(main);
    localStorage.setItem('geminiTimelineUserTurnSelector', '.custom-user-turn');

    const manager = new TimelineManager();
    const internal = manager as unknown as {
      findCriticalElements: () => Promise<boolean>;
      userTurnSelector: string;
    };

    const ok = await internal.findCriticalElements();
    expect(ok).toBe(true);
    expect(internal.userTurnSelector).toBe('.custom-user-turn');
  });
});
