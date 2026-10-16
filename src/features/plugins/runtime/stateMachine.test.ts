import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Machine, type MachineDefinition, startMachine } from './stateMachine';

type State =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly attempt: number }
  | { readonly status: 'ready'; readonly value: string };

type Event =
  | { readonly type: 'load' }
  | { readonly type: 'retry' }
  | { readonly type: 'loaded'; readonly value: string }
  | { readonly type: 'reset' };

function transition(state: State, event: Event): State {
  switch (event.type) {
    case 'load':
      return state.status === 'idle' ? { status: 'loading', attempt: 1 } : state;
    case 'retry':
      return state.status === 'loading' ? { ...state, attempt: state.attempt + 1 } : state;
    case 'loaded':
      return state.status === 'loading' ? { status: 'ready', value: event.value } : state;
    case 'reset':
      return state.status === 'idle' ? state : { status: 'idle' };
  }
}

let machine: Machine<State, Event> | null = null;

function start(
  effects: MachineDefinition<State, Event>['effects'] = {},
  initial: State = { status: 'idle' },
) {
  machine = startMachine<State, Event>({ id: 'test', transition, effects }, initial);
  return machine;
}

afterEach(async () => {
  await machine?.stop();
  machine = null;
  vi.useRealTimers();
});

describe('startMachine', () => {
  it('a timer from a state the machine already left cannot move it', () => {
    vi.useFakeTimers();
    const m = start({
      loading: (stay) => {
        // Survives the stay only if the scope fails to clear it.
        setTimeout(() => stay.send({ type: 'loaded', value: 'late' }), 100);
      },
    });
    m.send({ type: 'load' });
    m.send({ type: 'reset' });
    m.send({ type: 'load' });
    m.send({ type: 'reset' });
    vi.advanceTimersByTime(200);
    expect(m.state).toEqual({ status: 'idle' });
  });

  it('a promise that settles after its state ended is ignored', async () => {
    let resolveLoad!: (value: string) => void;
    const m = start({
      loading: (stay) => {
        void new Promise<string>((resolve) => (resolveLoad = resolve)).then((value) =>
          stay.send({ type: 'loaded', value }),
        );
      },
    });
    m.send({ type: 'load' });
    const staleResolve = resolveLoad;
    m.send({ type: 'reset' });
    m.send({ type: 'load' });
    staleResolve('stale');
    await Promise.resolve();
    expect(m.state).toEqual({ status: 'loading', attempt: 1 });
    resolveLoad('fresh');
    await Promise.resolve();
    expect(m.state).toEqual({ status: 'ready', value: 'fresh' });
  });

  it('leaving a state tears down what its effect registered', () => {
    const removed = vi.fn();
    const m = start({ loading: (stay) => void stay.scope.effect(() => removed) });
    m.send({ type: 'load' });
    expect(removed).not.toHaveBeenCalled();
    m.send({ type: 'loaded', value: 'x' });
    expect(removed).toHaveBeenCalledOnce();
  });

  it('an effect that sends while entering queues the event after its own entry', () => {
    const seen: string[] = [];
    const m = start({
      loading: (stay) => {
        stay.send({ type: 'loaded', value: 'sync' });
        // Still registering: the scope must not be disposed under us.
        stay.scope.effect(() => () => void seen.push('loading torn down'));
        seen.push('loading entered');
      },
      ready: () => void seen.push('ready entered'),
    });
    m.send({ type: 'load' });
    expect(m.state).toEqual({ status: 'ready', value: 'sync' });
    expect(seen).toEqual(['loading entered', 'loading torn down', 'ready entered']);
  });

  it('an effect of the initial state may send while entering', () => {
    const m = start(
      { loading: (stay) => stay.send({ type: 'loaded', value: 'boot' }) },
      { status: 'loading', attempt: 1 },
    );
    expect(m.state).toEqual({ status: 'ready', value: 'boot' });
  });

  it('a same-status update keeps effects running and shows them the new data', () => {
    const entered = vi.fn();
    let read: (() => State) | null = null;
    const m = start({
      loading: (stay) => {
        entered();
        read = stay.state;
      },
    });
    m.send({ type: 'load' });
    m.send({ type: 'retry' });
    m.send({ type: 'retry' });
    expect(entered).toHaveBeenCalledOnce();
    expect(read!()).toEqual({ status: 'loading', attempt: 3 });
  });

  it('ignored events do not notify subscribers', () => {
    const m = start();
    const listener = vi.fn();
    m.subscribe(listener);
    m.send({ type: 'retry' });
    m.send({ type: 'reset' });
    expect(listener).not.toHaveBeenCalled();
    m.send({ type: 'load' });
    expect(listener).toHaveBeenCalledWith({ status: 'loading', attempt: 1 }, { status: 'idle' });
  });

  it('events sent by a subscriber run after the current event, in order', () => {
    const m = start();
    const statuses: string[] = [];
    m.subscribe((state) => {
      statuses.push(state.status);
      if (state.status === 'loading') {
        m.send({ type: 'loaded', value: 'a' });
        m.send({ type: 'reset' });
      }
    });
    m.send({ type: 'load' });
    expect(statuses).toEqual(['loading', 'ready', 'idle']);
  });

  it('a throwing effect leaves the machine in the state it entered', () => {
    const m = start({
      loading: () => {
        throw new Error('boom');
      },
    });
    m.send({ type: 'load' });
    expect(m.state).toEqual({ status: 'loading', attempt: 1 });
    m.send({ type: 'loaded', value: 'ok' });
    expect(m.state).toEqual({ status: 'ready', value: 'ok' });
  });

  it('a throwing transition drops only that event', () => {
    machine = startMachine<State, Event>(
      {
        id: 'test',
        transition: (state, event) => {
          if (event.type === 'retry') throw new Error('boom');
          return transition(state, event);
        },
      },
      { status: 'idle' },
    );
    machine.send({ type: 'retry' });
    machine.send({ type: 'load' });
    expect(machine.state).toEqual({ status: 'loading', attempt: 1 });
  });

  it('a send from the abort of the state being left does not reach the next state', () => {
    const m = start({
      loading: (stay) => stay.signal.addEventListener('abort', () => stay.send({ type: 'load' })),
    });
    m.send({ type: 'load' });
    m.send({ type: 'reset' });
    expect(m.state).toEqual({ status: 'idle' });
  });

  it('a stop from the teardown of the state being left starts no later state', () => {
    const readyEntered = vi.fn();
    const m = start({
      loading: (stay) => stay.signal.addEventListener('abort', () => void m.stop()),
      ready: readyEntered,
    });
    m.send({ type: 'load' });
    m.send({ type: 'loaded', value: 'x' });
    expect(readyEntered).not.toHaveBeenCalled();
  });

  it('stop awaits async teardown of every stay and ignores later events', async () => {
    let finishTeardown!: () => void;
    const m = start({
      loading: (stay) =>
        void stay.scope.effect(
          () => () => new Promise<void>((resolve) => (finishTeardown = resolve)),
        ),
    });
    m.send({ type: 'load' });
    let stopped = false;
    const stopping = m.stop().then(() => (stopped = true));
    await Promise.resolve();
    expect(stopped).toBe(false);
    finishTeardown();
    await stopping;
    expect(stopped).toBe(true);
    m.send({ type: 'reset' });
    expect(m.state).toEqual({ status: 'loading', attempt: 1 });
    expect(m.stopped).toBe(true);
  });
});
