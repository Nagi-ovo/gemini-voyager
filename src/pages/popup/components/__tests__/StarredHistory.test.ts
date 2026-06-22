import { describe, expect, it } from 'vitest';

import { shouldOpenStarredMessageInCurrentTab } from '../StarredHistory';

describe('shouldOpenStarredMessageInCurrentTab', () => {
  it('allows same-tab starred navigation on Claude', () => {
    expect(
      shouldOpenStarredMessageInCurrentTab(
        'https://claude.ai/chat/current',
        'https://claude.ai/chat/target#gv-turn-c-1',
      ),
    ).toBe(true);
  });

  it('keeps cross-site starred navigation in a new tab', () => {
    expect(
      shouldOpenStarredMessageInCurrentTab(
        'https://gemini.google.com/app/1',
        'https://claude.ai/chat/target#gv-turn-c-1',
      ),
    ).toBe(false);
  });
});
