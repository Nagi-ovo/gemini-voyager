// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { showTimelineStyleCoachmark } from '@/features/timeline/timelineStyleCoachmark';

import { hasSeenCoachmark } from '../../coachmark';
import {
  maybeShowRulerTimelineCoachmark,
  rulerTimelineCoachmarkStep,
} from '../rulerTimelineCoachmark';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  listeners: new Set<(changes: Record<string, { newValue?: unknown }>, area: string) => void>(),
  get: vi.fn(async (defaults: Record<string, unknown>): Promise<Record<string, unknown>> => ({
    ...defaults,
    ...mocks.state,
  })),
  set: vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(mocks.state, values);
  }),
  initI18n: vi.fn(async (): Promise<void> => undefined),
}));
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: mocks.get, set: mocks.set },
      onChanged: {
        addListener: (
          listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
        ) => mocks.listeners.add(listener),
        removeListener: (
          listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
        ) => mocks.listeners.delete(listener),
      },
    },
  },
}));
vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  initI18n: mocks.initI18n,
}));

const GUIDES = [['ruler', maybeShowRulerTimelineCoachmark, rulerTimelineCoachmarkStep]] as const;
let page: AbortController;
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function flip(value: unknown): void {
  mocks.state[StorageKeys.GV_TIMELINE_ENABLED] = value;
  for (const listener of mocks.listeners)
    listener({ [StorageKeys.GV_TIMELINE_ENABLED]: { newValue: value } }, 'sync');
}
beforeEach(() => {
  vi.useFakeTimers();
  mocks.state = {};
  mocks.get.mockReset().mockImplementation(async (defaults) => ({ ...defaults, ...mocks.state }));
  mocks.set.mockClear();
  mocks.initI18n.mockReset().mockResolvedValue(undefined);
  page = new AbortController();
  document.body.innerHTML = '<div class="gemini-timeline-bar"></div>';
});
afterEach(async () => {
  page.abort();
  await vi.runAllTimersAsync();
  await flush();
  expect(mocks.listeners.size).toBe(0);
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe.each(GUIDES)('%s Gemini timeline guide lifetime', (_label, show, step) => {
  it('an off rail offers no guide, including the debug-force entry', async () => {
    flip(false);
    expect(await step.isEligible!()).toBe(false);
    const pending = show({ force: true, signal: page.signal });
    await flush();
    expect(document.querySelector('.gv-coach')).toBeNull();
    expect(document.querySelector('.gv-timeline-style-preview')).toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(await pending).toBe('skipped');
  });

  it('turning the rail off withdraws its shown guide without marking seen or allowing old toggle writes', async () => {
    const live = document.querySelector<HTMLElement>('.gemini-timeline-bar')!;
    const pending = show({ signal: page.signal });
    await flush();
    const toggle = document.querySelector<HTMLButtonElement>('.gv-coach-switch')!;
    expect(toggle).not.toBeNull();
    expect(live.classList.contains('gv-coach-timeline-hidden')).toBe(true);
    expect(mocks.set).toHaveBeenCalledTimes(1);
    flip(false);
    // The fading bubble still holds this callback; it must not change the saved style.
    toggle.click();
    await flush();
    expect(mocks.set).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(await pending).toBe('skipped');
    expect(await hasSeenCoachmark(step.id)).toBe(false);
    expect(document.querySelector('.gv-coach')).toBeNull();
    expect(document.querySelector('.gv-coach-scrim')).toBeNull();
    expect(document.querySelector('.gv-timeline-style-preview')).toBeNull();
    expect(live.classList.contains('gv-coach-timeline-hidden')).toBe(false);
    toggle.click();
    expect(mocks.set).toHaveBeenCalledTimes(1);
  });

  it('an off then on while the initial settings read is pending cannot resurrect that retired guide', async () => {
    let resolve!: (value: Record<string, unknown>) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((settle) => {
          resolve = settle;
        }),
    );
    const pending = show({ signal: page.signal });
    flip(false);
    flip(true);
    resolve({ [StorageKeys.GV_TIMELINE_ENABLED]: true });
    await flush();
    expect(document.querySelector('.gv-coach')).toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(await pending).toBe('skipped');
  });

  it('a newer on wins over an old off snapshot', async () => {
    let resolve!: (value: Record<string, unknown>) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((settle) => {
          resolve = settle;
        }),
    );
    const pending = show({ signal: page.signal });
    flip(true);
    resolve({ [StorageKeys.GV_TIMELINE_ENABLED]: false });
    await flush();
    expect(document.querySelector('.gv-coach')).not.toBeNull();
    page.abort();
    await vi.runAllTimersAsync();
    expect(await pending).toBe('skipped');
  });

  it('page teardown while translations are pending prevents late UI and style writes', async () => {
    let finish!: () => void;
    mocks.initI18n.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = show({ signal: page.signal });
    await flush();
    page.abort();
    finish();
    await flush();
    expect(document.querySelector('.gv-coach')).toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(await pending).toBe('skipped');
  });
});

it('Gemini’s off switch does not suppress a catalog guide using its own scope', async () => {
  flip(false);
  const onStyleChange = vi.fn();
  const pending = showTimelineStyleCoachmark({
    id: 'catalog-guide',
    enabled: false,
    signal: page.signal,
    onStyleChange,
  });
  await flush();
  expect(document.querySelector('.gv-coach')).not.toBeNull();
  expect(onStyleChange).toHaveBeenCalledExactlyOnceWith(true);
  page.abort();
  await vi.runAllTimersAsync();
  expect(await pending).toBe('skipped');
});
