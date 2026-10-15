/**
 * The restore axis of a draft session: putting one conversation's saved
 * draft back into its composer. A session runs one machine per opened
 * conversation and stops it on navigation, so a timer, load or retry from
 * the conversation left behind cannot act in the next one.
 *
 *   waiting ──delayElapsed──▶ loading ──loaded──▶ writing ──written──▶ settled
 *                                │                   │ missed (retries left): stays
 *                                └───────────────────┴──▶ settled (empty, occupied,
 *                                                          superseded, exhausted, left)
 *
 * Saving (a debounce restarted by every input) and send intents (re-armed
 * with fresh timers) are separate axes kept in `session.ts`: a same-status
 * update here keeps its effects running, which is the opposite of what both
 * need, and every combination of the three is legal.
 */
import {
  type Machine,
  type StateEffects,
  startMachine,
} from '@/features/plugins/runtime/stateMachine';

/** Same delay and retry budget as Gemini's restore while a navigated-to composer mounts. */
export const DRAFT_RESTORE_DELAY_MS = 500;
/** Write attempts after the first, one per delay, before the restore gives up. */
export const DRAFT_RESTORE_RETRIES = 5;

export type DraftRestoreOutcome =
  /** The draft is in the composer. */
  | 'restored'
  /** Nothing stored for this conversation. */
  | 'empty'
  /** The composer already held text, which is the user's. */
  | 'occupied'
  /** The person typed, cleared or sent after the restore began. */
  | 'superseded'
  /** The composer never took the draft within the retry budget. */
  | 'exhausted'
  /** The live route or account no longer names this draft. */
  | 'left'
  /** Nothing on this page may hold a draft. */
  | 'ineligible';

export type DraftRestoreState =
  /** After a navigation, letting the new composer mount. Input here does not count: hosts fire it while mounting. */
  | { readonly status: 'waiting'; readonly key: string }
  /** Reading the stored draft; `touched` records input that arrived meanwhile. */
  | { readonly status: 'loading'; readonly key: string; readonly touched: boolean }
  /** Writing into the composer, once now and then once per delay. */
  | {
      readonly status: 'writing';
      readonly key: string;
      /** The account the load started under; a write under another one is dropped. */
      readonly identity: string;
      readonly content: string;
      readonly retriesLeft: number;
    }
  | { readonly status: 'settled'; readonly outcome: DraftRestoreOutcome };

export type DraftRestoreEvent =
  | { readonly type: 'delayElapsed' }
  /** `content` is the cleaned stored draft, `''` when there is none. */
  | { readonly type: 'loaded'; readonly identity: string; readonly content: string }
  | { readonly type: 'written' }
  | { readonly type: 'occupied' }
  /** The composer is not there yet, or did not take the text. */
  | { readonly type: 'missed' }
  /** The person typed, cleared or sent. */
  | { readonly type: 'touched' }
  /** Seen before the route watcher reports it, or an account change on the same route. */
  | { readonly type: 'moved' };

/** One attempt to put the draft into the composer. */
export type DraftWriteResult = 'written' | 'occupied' | 'missed';

/** What the restore effects need from the page and storage. */
export interface DraftRestorePort {
  /** The page's account identity right now. */
  identity(): string;
  /** Whether the live route and account still name `key` under `identity`. */
  matches(key: string, identity: string): boolean;
  /** The stored draft, cleaned for the composer; `''` when there is none. */
  load(key: string): Promise<string>;
  /** What storage holds for the current conversation, recorded before any restore decision. */
  stored(content: string): void;
  /** Writes into an empty composer; never over text already there. */
  write(content: string): DraftWriteResult;
}

const settled = (outcome: DraftRestoreOutcome): DraftRestoreState => ({
  status: 'settled',
  outcome,
});

/** Where a conversation's restore begins: right away at startup, after the delay on navigation. */
export function initialDraftRestoreState(
  key: string | null,
  start: 'now' | 'afterDelay',
): DraftRestoreState {
  if (key === null) return settled('ineligible');
  return start === 'now' ? { status: 'loading', key, touched: false } : { status: 'waiting', key };
}

export function draftRestoreTransition(
  state: DraftRestoreState,
  event: DraftRestoreEvent,
): DraftRestoreState {
  switch (state.status) {
    case 'waiting':
      return event.type === 'delayElapsed'
        ? { status: 'loading', key: state.key, touched: false }
        : state;
    case 'loading':
      switch (event.type) {
        case 'touched':
          return state.touched ? state : { ...state, touched: true };
        case 'moved':
          return settled('left');
        case 'loaded':
          // A late load must not refill an input that was typed into and then sent or cleared.
          if (state.touched) return settled('superseded');
          if (!event.content) return settled('empty');
          return {
            status: 'writing',
            key: state.key,
            identity: event.identity,
            content: event.content,
            retriesLeft: DRAFT_RESTORE_RETRIES,
          };
        default:
          return state;
      }
    case 'writing':
      switch (event.type) {
        case 'written':
          return settled('restored');
        case 'occupied':
          return settled('occupied');
        case 'touched':
          return settled('superseded');
        case 'moved':
          return settled('left');
        case 'missed':
          return state.retriesLeft > 0
            ? { ...state, retriesLeft: state.retriesLeft - 1 }
            : settled('exhausted');
        default:
          return state;
      }
    case 'settled':
      return state;
  }
}

export function draftRestoreEffects(
  port: DraftRestorePort,
): StateEffects<DraftRestoreState, DraftRestoreEvent> {
  return {
    waiting: (stay) => {
      stay.scope.timer(() => stay.send({ type: 'delayElapsed' }), DRAFT_RESTORE_DELAY_MS);
    },
    loading: (stay) => {
      const { key } = stay.state();
      const identity = port.identity();
      void port.load(key).then((content) => {
        // The record below is a side effect, so a load the restore outlived stops here, not at send.
        if (stay.signal.aborted) return;
        if (!port.matches(key, identity)) {
          stay.send({ type: 'moved' });
          return;
        }
        // Track what storage holds even when the restore is skipped: a host that refills its own
        // draft first, or a clear typed before the load, would otherwise look unchanged and keep it.
        port.stored(content);
        stay.send({ type: 'loaded', identity, content });
      });
    },
    writing: (stay) => {
      const attempt = (): void => {
        if (stay.signal.aborted) return;
        const { key, identity, content } = stay.state();
        if (!port.matches(key, identity)) {
          stay.send({ type: 'moved' });
          return;
        }
        stay.send({ type: port.write(content) });
      };
      attempt();
      stay.scope.timer(attempt, DRAFT_RESTORE_DELAY_MS, { repeat: true });
    },
  };
}

/** Starts the restore for one conversation; the session stops it when the conversation changes. */
export function startDraftRestore(
  effects: StateEffects<DraftRestoreState, DraftRestoreEvent>,
  initial: DraftRestoreState,
): Machine<DraftRestoreState, DraftRestoreEvent> {
  return startMachine<DraftRestoreState, DraftRestoreEvent>(
    { id: 'draft-restore', transition: draftRestoreTransition, effects },
    initial,
  );
}
