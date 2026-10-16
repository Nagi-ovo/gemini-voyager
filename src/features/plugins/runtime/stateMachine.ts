/**
 * Explicit state for a feature with a lifecycle: phases that start and stop
 * timers, listeners, DOM or async work, and can be interrupted.
 *
 * A machine is two pieces of plain structure:
 *  - `transition(state, event)` is pure: it returns the next state, or the
 *    same object to ignore the event. No timers, DOM or storage in here, so it
 *    is tested as `state + event -> state` with no fixtures.
 *  - `effects` is keyed by `status`. The effect for a status runs when the
 *    machine enters that status, and everything it registers on `stay.scope`
 *    is torn down when the machine leaves it.
 *
 * Runtime guarantees:
 *  - Events are handled one at a time, in order. `send` from a transition's
 *    effect or a subscriber is queued, never re-entrant.
 *  - `stay.send` goes dead when its stay ends. A timer, listener or promise
 *    that fires after the machine moved on cannot steer it, so a module needs
 *    no generation counter or `destroyed` flag for that.
 *  - Effects restart only when `status` changes. A transition that keeps the
 *    status and updates data (an attempt counter) leaves the running effects
 *    alone; they read the current data through `stay.state()`.
 *  - A throwing transition drops that event; a throwing effect keeps what it
 *    registered until the stay ends. Both are logged and the queue goes on.
 *  - `stop()` ends the current stay and resolves once every stay's effects
 *    are torn down, so a feature's stop can await it.
 *
 * Declarative plugins will reuse this runtime by compiling a JSON transition
 * table into the same `transition` signature; see
 * `.github/docs/STATE_MACHINE_PLAN.md`.
 */
import { logger } from '@/core/services/LoggerService';

import { PluginScope } from './pluginScope';

export interface MachineState {
  readonly status: string;
}

export interface MachineEvent {
  readonly type: string;
}

type InStatus<S extends MachineState, K extends S['status']> = Extract<S, { readonly status: K }>;

/** What an effect owns while the machine stays in its status. */
export interface Stay<S extends MachineState, E extends MachineEvent> {
  /** Register timers, listeners, DOM and async work here; all of it ends with the stay. */
  readonly scope: PluginScope;
  /** Aborts when the stay ends. */
  readonly signal: AbortSignal;
  /** Feed an event back to the machine; ignored once the stay has ended. */
  send(event: E): void;
  /** The machine's state during this stay, including same-status data updates. */
  state(): S;
}

export type StateEffects<S extends MachineState, E extends MachineEvent> = {
  readonly [K in S['status']]?: (stay: Stay<InStatus<S, K>, E>) => void;
};

export interface MachineDefinition<S extends MachineState, E extends MachineEvent> {
  /** Names the machine in logs. */
  readonly id: string;
  readonly transition: (state: S, event: E) => S;
  readonly effects?: StateEffects<S, E>;
}

export interface Machine<S extends MachineState, E extends MachineEvent> {
  readonly state: S;
  readonly stopped: boolean;
  send(event: E): void;
  /** Called after every state change with the new and previous state. */
  subscribe(listener: (state: S, previous: S) => void): () => void;
  stop(): Promise<void>;
}

interface ActiveStay<S extends MachineState> {
  readonly scope: PluginScope;
  state: S;
}

export function startMachine<S extends MachineState, E extends MachineEvent>(
  definition: MachineDefinition<S, E>,
  initial: S,
): Machine<S, E> {
  let current = initial;
  let stay: ActiveStay<S> | null = null;
  let stopped = false;
  let draining = false;
  const queue: E[] = [];
  const listeners = new Set<(state: S, previous: S) => void>();
  const teardowns = new Set<Promise<void>>();

  const endStay = () => {
    const ending = stay;
    if (!ending) return;
    // Retire the stay before disposing: dispose fires its abort listeners synchronously,
    // and one that sends must not reach the next state.
    stay = null;
    const teardown = ending.scope.dispose();
    teardowns.add(teardown);
    void teardown.then(() => teardowns.delete(teardown));
  };

  const enter = (state: S) => {
    const entered: ActiveStay<S> = { scope: new PluginScope(), state };
    stay = entered;
    const effect = definition.effects?.[state.status as S['status']] as
      | ((stay: Stay<S, E>) => void)
      | undefined;
    if (!effect) return;
    try {
      effect({
        scope: entered.scope,
        signal: entered.scope.signal,
        send: (event) => {
          if (stay === entered) dispatch(event);
        },
        state: () => entered.state,
      });
    } catch (error) {
      logger.error('State effect failed', {
        machine: definition.id,
        status: state.status,
        error: String(error),
      });
    }
  };

  const step = (event: E) => {
    let next: S;
    try {
      next = definition.transition(current, event);
    } catch (error) {
      logger.error('State transition failed', {
        machine: definition.id,
        status: current.status,
        event: event.type,
        error: String(error),
      });
      return;
    }
    if (next === current) return;
    const previous = current;
    current = next;
    if (next.status !== previous.status) {
      endStay();
      // A teardown of the state just left may have stopped the machine.
      if (stopped) return;
      enter(next);
    } else if (stay) {
      stay.state = next;
    }
    for (const listener of listeners) {
      try {
        listener(next, previous);
      } catch (error) {
        logger.error('State listener failed', { machine: definition.id, error: String(error) });
      }
    }
  };

  // Everything runs inside one drain, so an effect that sends while it is
  // still registering queues its event instead of disposing its own scope.
  const drain = (run: () => void) => {
    draining = true;
    try {
      run();
      for (let next = queue.shift(); next && !stopped; next = queue.shift()) step(next);
    } finally {
      draining = false;
      queue.length = 0;
    }
  };

  const dispatch = (event: E) => {
    if (stopped) return;
    queue.push(event);
    if (!draining) drain(() => {});
  };

  drain(() => enter(initial));

  return {
    get state() {
      return current;
    },
    get stopped() {
      return stopped;
    },
    send: dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async stop() {
      if (!stopped) {
        stopped = true;
        queue.length = 0;
        listeners.clear();
        endStay();
      }
      await Promise.all(teardowns);
    },
  };
}
