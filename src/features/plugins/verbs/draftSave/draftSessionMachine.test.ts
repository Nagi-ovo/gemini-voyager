import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Machine } from '../../runtime/stateMachine';
import {
  DRAFT_RESTORE_DELAY_MS,
  DRAFT_RESTORE_RETRIES,
  type DraftRestoreEvent,
  type DraftRestorePort,
  type DraftRestoreState,
  type DraftWriteResult,
  draftRestoreEffects,
  draftRestoreTransition,
  initialDraftRestoreState,
  startDraftRestore,
} from './draftSessionMachine';

const run = (state: DraftRestoreState, ...events: DraftRestoreEvent[]): DraftRestoreState =>
  events.reduce(draftRestoreTransition, state);

const loading: DraftRestoreState = { status: 'loading', key: 'k', touched: false };
const loaded = (content: string): DraftRestoreEvent => ({
  type: 'loaded',
  identity: 'me',
  content,
});
const missed: DraftRestoreEvent = { type: 'missed' };

describe('draftRestoreTransition', () => {
  it('input while the navigated-to composer mounts does not cancel its restore', () => {
    const state = run(
      initialDraftRestoreState('k', 'afterDelay'),
      { type: 'touched' },
      { type: 'delayElapsed' },
      loaded('draft'),
    );
    expect(state).toMatchObject({ status: 'writing', content: 'draft' });
  });

  it('a draft that loads after the person touched the composer is not written', () => {
    expect(run(loading, { type: 'touched' }, loaded('draft'))).toEqual({
      status: 'settled',
      outcome: 'superseded',
    });
    expect(run(loading, loaded('draft'), { type: 'touched' })).toEqual({
      status: 'settled',
      outcome: 'superseded',
    });
  });

  it('a page without a draft key or without a stored draft settles at once', () => {
    expect(initialDraftRestoreState(null, 'now')).toEqual({
      status: 'settled',
      outcome: 'ineligible',
    });
    expect(run(loading, loaded(''))).toEqual({ status: 'settled', outcome: 'empty' });
  });

  it('keeps the account the load started under for every write attempt', () => {
    expect(run(loading, loaded('draft'), missed)).toEqual({
      status: 'writing',
      key: 'k',
      identity: 'me',
      content: 'draft',
      retriesLeft: DRAFT_RESTORE_RETRIES - 1,
    });
  });

  it('gives a missing composer the retry budget, then settles exhausted', () => {
    const misses = Array.from({ length: DRAFT_RESTORE_RETRIES }, () => missed);
    expect(run(loading, loaded('draft'), ...misses)).toMatchObject({
      status: 'writing',
      retriesLeft: 0,
    });
    expect(run(loading, loaded('draft'), ...misses, missed)).toEqual({
      status: 'settled',
      outcome: 'exhausted',
    });
  });

  it.each([
    ['written', 'restored'],
    ['occupied', 'occupied'],
    ['moved', 'left'],
  ] as const)('a write attempt that reports %s settles %s', (type, outcome) => {
    expect(run(loading, loaded('draft'), { type })).toEqual({ status: 'settled', outcome });
  });

  it('leaving the route or account while the draft loads settles left', () => {
    expect(run(loading, { type: 'moved' })).toEqual({ status: 'settled', outcome: 'left' });
  });

  it('a settled restore ignores every later event', () => {
    const state: DraftRestoreState = { status: 'settled', outcome: 'exhausted' };
    expect(
      run(state, { type: 'delayElapsed' }, loaded('draft'), { type: 'written' }, missed, {
        type: 'touched',
      }),
    ).toBe(state);
  });
});

describe('draft restore effects', () => {
  let machine: Machine<DraftRestoreState, DraftRestoreEvent> | null = null;

  afterEach(async () => {
    await machine?.stop();
    machine = null;
    vi.useRealTimers();
  });

  function port(overrides: Partial<DraftRestorePort> = {}): DraftRestorePort {
    return {
      identity: () => 'me',
      matches: () => true,
      load: async () => 'draft',
      stored: () => {},
      write: (): DraftWriteResult => 'missed',
      ...overrides,
    };
  }

  it('tries once at once and once per delay for the retry budget, then stops trying', async () => {
    vi.useFakeTimers();
    const write = vi.fn((): DraftWriteResult => 'missed');
    machine = startDraftRestore(
      draftRestoreEffects(port({ write })),
      initialDraftRestoreState('k', 'now'),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS * (DRAFT_RESTORE_RETRIES + 5));

    expect(write).toHaveBeenCalledTimes(DRAFT_RESTORE_RETRIES + 1);
    expect(machine.state).toEqual({ status: 'settled', outcome: 'exhausted' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('records what storage held even when the restore was superseded', async () => {
    let resolveLoad!: (content: string) => void;
    const stored = vi.fn();
    const write = vi.fn((): DraftWriteResult => 'written');
    machine = startDraftRestore(
      draftRestoreEffects(
        port({ stored, write, load: () => new Promise((resolve) => (resolveLoad = resolve)) }),
      ),
      initialDraftRestoreState('k', 'now'),
    );
    machine.send({ type: 'touched' });
    resolveLoad('old draft');
    await Promise.resolve();

    expect(stored).toHaveBeenCalledWith('old draft');
    expect(write).not.toHaveBeenCalled();
    expect(machine.state).toEqual({ status: 'settled', outcome: 'superseded' });
  });

  it('a load that finishes after the restore was stopped records and writes nothing', async () => {
    let resolveLoad!: (content: string) => void;
    const stored = vi.fn();
    const write = vi.fn((): DraftWriteResult => 'written');
    machine = startDraftRestore(
      draftRestoreEffects(
        port({ stored, write, load: () => new Promise((resolve) => (resolveLoad = resolve)) }),
      ),
      initialDraftRestoreState('k', 'now'),
    );
    await machine.stop();
    resolveLoad('old draft');
    await Promise.resolve();

    expect(stored).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
