/**
 * The lock loop that applies the starred model and thinking level to a new
 * chat, as explicit state for `startMachine`.
 *
 *   idle ──check──▶ checking ──planned──▶ locking ──▶ satisfied | gaveUp
 *     ▲                 │ (nothing to do)      │ (route left)
 *     └─────────────────┴──────────────────────┘
 *
 * `check` from any status except `checking` starts over, so a newer chat
 * always replaces the loop of an older one through a status change.
 *
 * `transition` is pure: every retry counter (attempts, failed picks, rejected
 * switches) changes only here. The effects own the timers and the picker;
 * `AutoApplyPorts` is the page they act on.
 */
import { logger } from '@/core/services/LoggerService';
import type { StateEffects, Stay } from '@/features/plugins/runtime/stateMachine';

import type { ModelPicker, PickerInteraction, ThinkingPickResult } from './modelPicker';
import type { DefaultModelSetting, DefaultThinkingLevel } from './preferences';

export const LOCK_TICK_MS = 1000;
/** Ticks one lock session may run before it stops quietly. */
export const MAX_LOCK_ATTEMPTS = 5;
/** Failed picks, or ignored clicks on one item, before the session gives up and warns. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export type ModelPickResult = Awaited<ReturnType<ModelPicker['selectModel']>>;

/** What one new chat is locked to. Its identity names the session. */
export interface LockSession {
  readonly lockPath: string;
  readonly model: DefaultModelSetting | null;
  /** Never the page-default level: enforcing it could only flash the picker. */
  readonly thinking: DefaultThinkingLevel | null;
}

/**
 * An item clicked on the previous tick. If the pill still does not show it on
 * the next tick, Gemini likely rejected the switch (for example an exhausted
 * quota), so the session backs off after a few confirmations (#761).
 */
export interface SwitchTrack {
  readonly pendingKey: string | null;
  readonly consecutiveRejected: number;
}

export type GiveUpReason = 'notFound' | 'rejected' | 'yielded' | 'exhausted';

export type LockingState = {
  readonly status: 'locking';
  readonly session: LockSession;
  /** Ticks started so far. */
  readonly attempt: number;
  /** Consecutive picks that could not find the menu or the row. */
  readonly failures: number;
  /** What the current tick is picking, decided from its pill read. */
  readonly pick: 'model' | 'thinking' | null;
  readonly model: SwitchTrack;
  readonly thinking: SwitchTrack;
};

export type AutoApplyState =
  | { readonly status: 'idle' }
  | { readonly status: 'checking' }
  | LockingState
  | { readonly status: 'satisfied'; readonly session: LockSession }
  | { readonly status: 'gaveUp'; readonly session: LockSession; readonly reason: GiveUpReason };

export type AutoApplyEvent =
  /** A new chat may need its defaults applied. */
  | { readonly type: 'check' }
  /** The check finished; null means nothing to enforce or already applied. */
  | { readonly type: 'planned'; readonly session: LockSession | null }
  | { readonly type: 'tick' }
  /** The page is no longer the chat this session locks. */
  | { readonly type: 'left' }
  /** The user is composing; opening the picker would steal focus. */
  | { readonly type: 'yielded' }
  | { readonly type: 'pillRead'; readonly modelOk: boolean; readonly thinkingOk: boolean }
  /** The picker could not find the menu or the row. */
  | { readonly type: 'pickFailed' }
  /** The picker reached the thinking row; earlier failures no longer count. */
  | { readonly type: 'pickRecovered' }
  | ({
      readonly type: 'picked';
      /** The picker asked the loop to stop: done, or nothing left it can do. */
      readonly stopRequested: boolean;
      readonly yielded: boolean;
    } & (
      | { readonly pick: 'model'; readonly result: ModelPickResult }
      | { readonly pick: 'thinking'; readonly result: ThinkingPickResult }
    ));

const IDLE: AutoApplyState = { status: 'idle' };
const NO_SWITCH: SwitchTrack = { pendingKey: null, consecutiveRejected: 0 };

export function modelSwitchKey(model: DefaultModelSetting): string {
  return model.kind === 'id' ? `id:${model.id}` : `name:${model.name.toLowerCase().trim()}`;
}

export function thinkingSwitchKey(thinking: DefaultThinkingLevel): string {
  return `thinking:${thinking.mode ?? 'legacy'}:${thinking.index}:${thinking.label.toLowerCase().trim()}`;
}

/** The session a state belongs to, if any. */
export function sessionOf(state: AutoApplyState): LockSession | null {
  return 'session' in state ? state.session : null;
}

function startLocking(session: LockSession): LockingState {
  return {
    status: 'locking',
    session,
    attempt: 0,
    failures: 0,
    pick: null,
    model: NO_SWITCH,
    thinking: NO_SWITCH,
  };
}

function giveUp(state: LockingState, reason: GiveUpReason): AutoApplyState {
  return { status: 'gaveUp', session: state.session, reason };
}

/** Counts a click that the pill did not confirm since the previous tick. */
function confirmPending(track: SwitchTrack, key: string): SwitchTrack {
  return track.pendingKey === key
    ? { pendingKey: key, consecutiveRejected: track.consecutiveRejected + 1 }
    : track;
}

function onPillRead(state: LockingState, modelOk: boolean, thinkingOk: boolean): AutoApplyState {
  if (modelOk && thinkingOk) return { status: 'satisfied', session: state.session };
  const { session } = state;
  const model = modelOk ? NO_SWITCH : state.model;

  // The model goes first: a thinking level belongs to the model it was set on.
  if (!modelOk && session.model) {
    const track = confirmPending(model, modelSwitchKey(session.model));
    if (track.consecutiveRejected >= MAX_CONSECUTIVE_FAILURES) return giveUp(state, 'rejected');
    return { ...state, model: track, pick: 'model' };
  }
  if (!thinkingOk && session.thinking) {
    const track = confirmPending(state.thinking, thinkingSwitchKey(session.thinking));
    if (track.consecutiveRejected >= MAX_CONSECUTIVE_FAILURES) return giveUp(state, 'rejected');
    return { ...state, model, thinking: track, pick: 'thinking' };
  }
  return { status: 'satisfied', session };
}

function onPicked(
  state: LockingState,
  event: Extract<AutoApplyEvent, { type: 'picked' }>,
): AutoApplyState {
  if (state.pick !== event.pick) return state;
  const { session } = state;
  let next: LockingState = { ...state, pick: null };
  if (event.pick === 'model' && session.model) {
    if (event.result === 'switched') {
      next = { ...next, model: { ...next.model, pendingKey: modelSwitchKey(session.model) } };
    } else if (event.result === 'already-selected' || event.result === 'failed') {
      next = { ...next, model: NO_SWITCH };
    }
  } else if (event.pick === 'thinking' && session.thinking) {
    if (event.result === 'switched') {
      next = {
        ...next,
        thinking: { ...next.thinking, pendingKey: thinkingSwitchKey(session.thinking) },
      };
    } else if (event.result === 'unchanged') {
      next = { ...next, thinking: NO_SWITCH };
    }
  }

  if (event.yielded) return giveUp(next, 'yielded');
  // An already-selected model ends the session even when the picker did not say
  // so; the tick has already tried the thinking level once on top of it.
  if (event.stopRequested || (event.pick === 'model' && event.result === 'already-selected')) {
    return { status: 'satisfied', session };
  }
  return next;
}

export function autoApplyTransition(state: AutoApplyState, event: AutoApplyEvent): AutoApplyState {
  if (event.type === 'check') return state.status === 'checking' ? state : { status: 'checking' };
  if (event.type === 'planned') {
    if (state.status !== 'checking') return state;
    return event.session ? startLocking(event.session) : IDLE;
  }
  if (state.status !== 'locking') return state;

  switch (event.type) {
    case 'tick':
      return state.attempt >= MAX_LOCK_ATTEMPTS
        ? giveUp(state, 'exhausted')
        : { ...state, attempt: state.attempt + 1, pick: null };
    case 'left':
      return IDLE;
    case 'yielded':
      return giveUp(state, 'yielded');
    case 'pillRead':
      return onPillRead(state, event.modelOk, event.thinkingOk);
    case 'pickFailed':
      return state.failures + 1 >= MAX_CONSECUTIVE_FAILURES
        ? giveUp(state, 'notFound')
        : { ...state, failures: state.failures + 1 };
    case 'pickRecovered':
      return state.failures === 0 ? state : { ...state, failures: 0 };
    case 'picked':
      return onPicked(state, event);
  }
}

/** The page the lock loop acts on. */
export interface AutoApplyPorts {
  /** Loads the defaults and returns the session this chat needs, or null. */
  planLock(): Promise<LockSession | null>;
  currentPath(): string;
  shouldYield(): boolean;
  readPill(session: LockSession): { modelOk: boolean; thinkingOk: boolean };
  selectModel(
    target: DefaultModelSetting,
    interaction: PickerInteraction,
  ): Promise<ModelPickResult>;
  selectThinking(
    target: DefaultThinkingLevel,
    interaction: PickerInteraction,
  ): Promise<ThinkingPickResult>;
  /** Refocuses the composer shortly, unless `session` has been replaced by then. */
  focusInput(session: LockSession): void;
  notifyFailure(): void;
}

async function runTick(stay: Stay<LockingState, AutoApplyEvent>, ports: AutoApplyPorts) {
  stay.send({ type: 'tick' });
  if (stay.signal.aborted) return;
  const { session } = stay.state();
  if (ports.currentPath() !== session.lockPath) {
    stay.send({ type: 'left' });
    return;
  }
  if (ports.shouldYield()) {
    stay.send({ type: 'yielded' });
    return;
  }

  const pill = ports.readPill(session);
  stay.send({ type: 'pillRead', ...pill });
  const { pick } = stay.state();
  if (stay.signal.aborted || !pick) return;

  const report = { stopRequested: false, yielded: false };
  const isCurrent = () => !stay.signal.aborted && ports.currentPath() === session.lockPath;
  const interaction: PickerInteraction = {
    isCurrent,
    shouldYield: () => {
      const yielded = ports.shouldYield();
      if (yielded) report.yielded = true;
      return yielded;
    },
    // Recorded, not sent: an already-selected model still gets its thinking
    // level picked in this same tick, which a finished session would cancel.
    stop: () => {
      report.stopRequested = true;
    },
    failed: () => stay.send({ type: 'pickFailed' }),
    resetFailures: () => stay.send({ type: 'pickRecovered' }),
    focusInput: () => ports.focusInput(session),
  };

  if (pick === 'model' && session.model) {
    let result = await ports.selectModel(session.model, interaction);
    if (!isCurrent()) result = 'cancelled';
    if (result === 'already-selected' && !pill.thinkingOk && session.thinking) {
      await ports.selectThinking(session.thinking, interaction);
    }
    stay.send({ type: 'picked', pick, result, ...report });
  } else if (pick === 'thinking' && session.thinking) {
    let result = await ports.selectThinking(session.thinking, interaction);
    if (!isCurrent()) result = 'cancelled';
    stay.send({ type: 'picked', pick, result, ...report });
  }
}

export function createAutoApplyEffects(
  ports: AutoApplyPorts,
): StateEffects<AutoApplyState, AutoApplyEvent> {
  return {
    checking: (stay) => {
      void ports.planLock().then(
        (session) => stay.send({ type: 'planned', session }),
        (error: unknown) => {
          logger.warn('Default model check failed', { error: String(error) });
          stay.send({ type: 'planned', session: null });
        },
      );
    },
    locking: (stay) => {
      // One-shot and re-armed only after the tick settles: a pick can wait
      // 1.5s for the menu, and an interval tick overlapping it would hit the
      // picker's lock, read 'failed' and wipe the #761 rejected-switch count.
      const arm = () => {
        if (!stay.signal.aborted) stay.scope.timer(tick, LOCK_TICK_MS);
      };
      const tick = () => {
        void runTick(stay, ports)
          .catch((error: unknown) => {
            logger.warn('Default model lock tick failed', { error: String(error) });
          })
          .finally(arm);
      };
      arm();
    },
    gaveUp: (stay) => {
      const { reason } = stay.state();
      if (reason === 'notFound' || reason === 'rejected') ports.notifyFailure();
    },
  };
}
