import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTranslationSync: vi.fn((key: string) => key),
  initI18n: vi.fn(async () => undefined),
  promptStorageGet: vi.fn(),
  showCoachmark: vi.fn(async (_config: unknown) => 'dismissed'),
}));

vi.mock('@/core/services/StorageService', () => ({
  promptStorageService: { get: mocks.promptStorageGet },
}));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: mocks.getTranslationSync,
  initI18n: mocks.initI18n,
}));

vi.mock('../../coachmark', () => ({
  showCoachmark: mocks.showCoachmark,
}));

import {
  PROMPT_REORDER_COACHMARK_ID,
  isPromptReorderCoachmarkEligible,
  maybeShowPromptReorderCoachmark,
} from '../promptReorderCoachmark';

const prompts = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    text: 'body',
    tags: [],
    createdAt: 0,
  }));

function mountTrigger(): HTMLElement {
  const trigger = document.createElement('button');
  trigger.id = 'gv-pm-trigger';
  document.body.appendChild(trigger);
  return trigger;
}

function storedPrompts(count: number): void {
  mocks.promptStorageGet.mockResolvedValue({ success: true, data: prompts(count) });
}

beforeEach(() => {
  document.body.innerHTML = '';
  mocks.showCoachmark.mockClear();
  mocks.promptStorageGet.mockReset();
});

describe('prompt reorder coachmark', () => {
  it('waits until the list is long enough to be worth ordering', async () => {
    mountTrigger();
    storedPrompts(2);

    expect(await isPromptReorderCoachmarkEligible()).toBe(false);
    expect(await maybeShowPromptReorderCoachmark()).toBe('skipped');
    expect(mocks.showCoachmark).not.toHaveBeenCalled();

    storedPrompts(3);
    expect(await isPromptReorderCoachmarkEligible()).toBe(true);
  });

  it('stays away when the panel is not on the page', async () => {
    storedPrompts(9);

    expect(await isPromptReorderCoachmarkEligible()).toBe(false);
    expect(await maybeShowPromptReorderCoachmark()).toBe('skipped');
  });

  it('anchors to the panel trigger and records itself once', async () => {
    const trigger = mountTrigger();
    storedPrompts(5);

    await maybeShowPromptReorderCoachmark();

    const config = mocks.showCoachmark.mock.calls[0][0] as {
      id: string;
      once: boolean;
      anchor: () => HTMLElement | null;
    };
    expect(config.id).toBe(PROMPT_REORDER_COACHMARK_ID);
    expect(config.once).toBe(true);
    expect(config.anchor()).toBe(trigger);
  });

  it('forces past both gates for the debug trigger, without recording seen state', async () => {
    mountTrigger();
    storedPrompts(1);

    await maybeShowPromptReorderCoachmark({ force: true });

    expect(mocks.showCoachmark).toHaveBeenCalledTimes(1);
    expect((mocks.showCoachmark.mock.calls[0][0] as { once: boolean }).once).toBe(false);
  });

  it('survives storage that fails to read', async () => {
    mountTrigger();
    mocks.promptStorageGet.mockResolvedValue({ success: false });

    expect(await isPromptReorderCoachmarkEligible()).toBe(false);
  });
});
