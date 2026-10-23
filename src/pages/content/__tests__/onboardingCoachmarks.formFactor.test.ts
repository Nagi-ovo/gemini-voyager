import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoachmarkSequenceStep } from '../coachmark';

const shown = vi.hoisted(() => [] as string[]);

/** A guide that is always eligible and records that it opened. */
function guide(id: string): CoachmarkSequenceStep {
  return {
    id,
    isEligible: () => true,
    show: () => {
      shown.push(id);
      return 'advanced' as const;
    },
  };
}

// No guide has been seen yet.
vi.mock('webextension-polyfill', () => ({
  default: { storage: { sync: { get: async () => ({}), set: async () => {} } } },
}));
vi.mock('../timeline/rulerTimelineCoachmark', () => ({
  rulerTimelineCoachmarkStep: { id: 'ruler-timeline' },
  maybeShowRulerTimelineCoachmark: async () => {
    shown.push('ruler-timeline');
    return 'advanced';
  },
}));
vi.mock('../folder/activityCoachmark', () => ({
  folderActivityCoachmarkStep: guide('folder-activity'),
}));
vi.mock('../folder/folderSearchCoachmark', () => ({
  folderSearchCoachmarkStep: guide('folder-search'),
}));
vi.mock('../folder/conversationSortCoachmark', () => ({
  conversationSortCoachmarkStep: guide('conversation-sort'),
}));
vi.mock('../usageStatus/usageCoachmark', () => ({ usageCoachmarkStep: guide('usage') }));
vi.mock('../prompt/slashPromptCoachmark', () => ({ slashPromptCoachmarkStep: guide('slash') }));
vi.mock('../prompt/promptReorderCoachmark', () => ({
  promptReorderCoachmarkStep: guide('prompt-reorder'),
}));

import { createOnboardingCoachmarks } from '../onboardingCoachmarks';

async function run(runsHere: (pluginId: string) => Promise<boolean>): Promise<readonly string[]> {
  shown.length = 0;
  createOnboardingCoachmarks(new AbortController().signal, runsHere)();
  await vi.waitFor(() => expect(shown).toContain('prompt-reorder'));
  return [...shown];
}

describe('onboarding coachmarks by device', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('leaves out the folder and usage guides on a phone and keeps the rest', async () => {
    expect(await run(async () => false)).toEqual(['ruler-timeline', 'slash', 'prompt-reorder']);
  });

  it('keeps every guide where those plugins run', async () => {
    expect(await run(async () => true)).toEqual([
      'ruler-timeline',
      'folder-activity',
      'usage',
      'folder-search',
      'conversation-sort',
      'slash',
      'prompt-reorder',
    ]);
  });
});
