import { describe, expect, it } from 'vitest';

import {
  type AutoApplyEvent,
  type AutoApplyState,
  type LockSession,
  type LockingState,
  MAX_LOCK_ATTEMPTS,
  autoApplyTransition,
} from '../autoApplyMachine';

const session: LockSession = {
  lockPath: '/app',
  model: { kind: 'id', id: 'pro-id', name: 'Pro' },
  thinking: { index: 1, label: 'Extended' },
};

function run(state: AutoApplyState, ...events: AutoApplyEvent[]): AutoApplyState {
  return events.reduce(autoApplyTransition, state);
}

function locking(): LockingState {
  const state = run({ status: 'checking' }, { type: 'planned', session });
  if (state.status !== 'locking') throw new Error('expected locking');
  return state;
}

const pill = (modelOk: boolean, thinkingOk = true): AutoApplyEvent => ({
  type: 'pillRead',
  modelOk,
  thinkingOk,
});
const modelSwitched: AutoApplyEvent = {
  type: 'picked',
  pick: 'model',
  result: 'switched',
  stopRequested: false,
  yielded: false,
};
const thinkingSwitched: AutoApplyEvent = {
  type: 'picked',
  pick: 'thinking',
  result: 'switched',
  stopRequested: false,
  yielded: false,
};
/** One tick whose model click the pill never confirms. */
const ignoredModelClick: AutoApplyEvent[] = [{ type: 'tick' }, pill(false), modelSwitched];

describe('autoApplyTransition', () => {
  it('a new chat check replaces whatever session ran before', () => {
    for (const state of [
      { status: 'idle' },
      locking(),
      { status: 'satisfied', session },
      { status: 'gaveUp', session, reason: 'rejected' },
    ] satisfies AutoApplyState[]) {
      expect(run(state, { type: 'check' })).toEqual({ status: 'checking' });
    }
    const checking: AutoApplyState = { status: 'checking' };
    expect(run(checking, { type: 'check' })).toBe(checking);
  });

  it('a check with nothing to enforce leaves the loop idle', () => {
    expect(run({ status: 'checking' }, { type: 'planned', session: null })).toEqual({
      status: 'idle',
    });
  });

  it('a plan that arrives after the check was replaced starts no session', () => {
    const satisfied: AutoApplyState = { status: 'satisfied', session };
    expect(run(satisfied, { type: 'planned', session })).toBe(satisfied);
  });

  it('a new session starts with no attempts, failures or pending clicks', () => {
    expect(locking()).toMatchObject({
      attempt: 0,
      failures: 0,
      model: { pendingKey: null, consecutiveRejected: 0 },
      thinking: { pendingKey: null, consecutiveRejected: 0 },
    });
  });

  it('a pill that already shows both targets ends the session', () => {
    expect(run(locking(), { type: 'tick' }, pill(true, true))).toEqual({
      status: 'satisfied',
      session,
    });
  });

  it('picks the model before the thinking level', () => {
    expect(run(locking(), { type: 'tick' }, pill(false, false))).toMatchObject({ pick: 'model' });
    expect(run(locking(), { type: 'tick' }, pill(true, false))).toMatchObject({
      pick: 'thinking',
    });
  });

  it('gives up and warns after three model clicks the pill ignores (#761)', () => {
    const afterTwo = run(locking(), ...ignoredModelClick, ...ignoredModelClick);
    expect(afterTwo).toMatchObject({ status: 'locking', model: { consecutiveRejected: 1 } });
    expect(run(afterTwo, ...ignoredModelClick, { type: 'tick' }, pill(false))).toEqual({
      status: 'gaveUp',
      session,
      reason: 'rejected',
    });
  });

  it('gives up after three thinking clicks the pill ignores', () => {
    const ignoredThinkingClick: AutoApplyEvent[] = [
      { type: 'tick' },
      pill(true, false),
      thinkingSwitched,
    ];
    expect(
      run(
        locking(),
        ...ignoredThinkingClick,
        ...ignoredThinkingClick,
        ...ignoredThinkingClick,
        { type: 'tick' },
        pill(true, false),
      ),
    ).toEqual({ status: 'gaveUp', session, reason: 'rejected' });
  });

  it('a model the pill confirms clears its rejected-click count', () => {
    const state = run(locking(), ...ignoredModelClick, ...ignoredModelClick, {
      type: 'tick',
    });
    expect(run(state, pill(true, false))).toMatchObject({
      model: { pendingKey: null, consecutiveRejected: 0 },
    });
  });

  it('a model pick that fails without a click clears the pending click', () => {
    const state = run(locking(), ...ignoredModelClick, ...ignoredModelClick, { type: 'tick' });
    expect(
      run(state, pill(false), {
        type: 'picked',
        pick: 'model',
        result: 'failed',
        stopRequested: false,
        yielded: false,
      }),
    ).toMatchObject({ status: 'locking', model: { pendingKey: null, consecutiveRejected: 0 } });
  });

  it('a pick result for a pick this tick did not start changes nothing', () => {
    const state = run(locking(), { type: 'tick' }, pill(true, false));
    expect(run(state, modelSwitched)).toBe(state);
  });

  it('a cancelled pick keeps the pending click', () => {
    const state = run(locking(), ...ignoredModelClick, { type: 'tick' }, pill(false), {
      type: 'picked',
      pick: 'model',
      result: 'cancelled',
      stopRequested: false,
      yielded: false,
    });
    expect(state).toMatchObject({ model: { pendingKey: 'id:pro-id', consecutiveRejected: 1 } });
  });

  it('an already-selected model ends the session', () => {
    expect(
      run(locking(), { type: 'tick' }, pill(false, false), {
        type: 'picked',
        pick: 'model',
        result: 'already-selected',
        stopRequested: false,
        yielded: false,
      }),
    ).toEqual({ status: 'satisfied', session });
  });

  it('a pick the picker stopped ends the session, as yielded when the user was composing', () => {
    const picking = run(locking(), { type: 'tick' }, pill(false));
    const stopped = { type: 'picked', pick: 'model', result: 'failed' } as const;
    expect(run(picking, { ...stopped, stopRequested: true, yielded: false })).toEqual({
      status: 'satisfied',
      session,
    });
    expect(run(picking, { ...stopped, stopRequested: true, yielded: true })).toEqual({
      status: 'gaveUp',
      session,
      reason: 'yielded',
    });
  });

  it('yields to a user composing before the tick opens the picker', () => {
    expect(run(locking(), { type: 'tick' }, { type: 'yielded' })).toEqual({
      status: 'gaveUp',
      session,
      reason: 'yielded',
    });
  });

  it('gives up and warns after three picks that cannot find the menu or row', () => {
    const fail: AutoApplyEvent = { type: 'pickFailed' };
    expect(run(locking(), fail, fail)).toMatchObject({ status: 'locking', failures: 2 });
    expect(run(locking(), fail, fail, fail)).toEqual({
      status: 'gaveUp',
      session,
      reason: 'notFound',
    });
    expect(run(locking(), fail, fail, { type: 'pickRecovered' }, fail)).toMatchObject({
      status: 'locking',
      failures: 1,
    });
  });

  it('stops quietly after five ticks', () => {
    const ticks = Array.from({ length: MAX_LOCK_ATTEMPTS }, () => ({ type: 'tick' }) as const);
    expect(run(locking(), ...ticks)).toMatchObject({
      status: 'locking',
      attempt: MAX_LOCK_ATTEMPTS,
    });
    expect(run(locking(), ...ticks, { type: 'tick' })).toEqual({
      status: 'gaveUp',
      session,
      reason: 'exhausted',
    });
  });

  it('ends the session when the page is no longer its chat', () => {
    expect(run(locking(), { type: 'left' })).toEqual({ status: 'idle' });
  });

  it('ignores lock events outside a lock session', () => {
    const satisfied: AutoApplyState = { status: 'satisfied', session };
    for (const event of [
      { type: 'tick' },
      { type: 'left' },
      { type: 'yielded' },
      pill(false),
      { type: 'pickFailed' },
      modelSwitched,
    ] satisfies AutoApplyEvent[]) {
      expect(run(satisfied, event)).toBe(satisfied);
    }
  });
});
