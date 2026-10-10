/**
 * An in-process chain of storage turns. Each turn starts after the previous
 * one settles, whether it resolved or threw, so two owners that share a
 * queue never interleave their read-change-write turns. Nothing about the
 * queue is persisted: what survives a worker restart is storage itself.
 */
export type Serialize = <T>(turn: () => Promise<T>, readKeys?: readonly string[]) => Promise<T>;

/** A pre-read guard; absent readKeys means unknown reads, [] means no reads. A throw skips the turn. */
export type QueuePrelude = (readKeys: readonly string[] | undefined) => Promise<void>;

export interface WriteQueue extends Serialize {
  /** Registers or clears the prelude. With none, a turn runs exactly as it was given. */
  setPrelude(prelude: QueuePrelude | null): void;
}

export function createWriteQueue(): WriteQueue {
  let queue: Promise<unknown> = Promise.resolve();
  let prelude: QueuePrelude | null = null;
  const serialize = <T>(turn: () => Promise<T>, readKeys?: readonly string[]): Promise<T> => {
    const run = prelude ? withPrelude(prelude, turn, readKeys) : turn;
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };
  return Object.assign(serialize, {
    setPrelude(next: QueuePrelude | null) {
      prelude = next;
    },
  });
}

const withPrelude =
  <T>(prelude: QueuePrelude, turn: () => Promise<T>, readKeys?: readonly string[]) =>
  async (): Promise<T> => {
    await prelude(readKeys);
    return turn();
  };

/** The background's one queue, shared by the prompt-library and folder owners. */
export const backgroundWriteQueue: WriteQueue = createWriteQueue();
