import type { EditOutcome, OrdinaryOpBody } from '@/features/folder/commands/folderCommands';

export interface ClientOp {
  seq: number;
  body: OrdinaryOpBody;
  at: number;
  /** pending: in memory only; accepted: its pending key is stored; then settled by an outcome. */
  state: 'pending' | 'accepted' | 'committed' | 'rejected';
  outcome?: EditOutcome;
  /** Bytes its stored pending key holds, counted against the allowance until it is applied. */
  bytes?: number;
  waiters: Array<(outcome: EditOutcome) => void>;
}

/** Settles `op` with `outcome` and resolves everyone waiting on it. */
export function deliver(op: ClientOp, outcome: EditOutcome): void {
  op.outcome = outcome;
  if (outcome.kind === 'rejected') op.state = 'rejected';
  else if (outcome.kind !== 'failed') op.state = 'committed';
  for (const resolve of op.waiters.splice(0)) resolve(outcome);
}

/** Accepted ops without an outcome, contiguous from `acked + 1`, at most `limit`. */
export function sendable(ops: readonly ClientOp[], acked: number, limit: number): ClientOp[] {
  const batch: ClientOp[] = [];
  for (let seq = acked + 1; batch.length < limit; seq += 1) {
    const op = ops.find((candidate) => candidate.seq === seq);
    if (!op || op.state === 'pending' || op.outcome) break;
    batch.push(op);
  }
  return batch;
}

/** The highest seq up to which every op has an outcome from the owner, from `acked` on. */
export function settledPrefix(ops: readonly ClientOp[], acked: number): number {
  let through = acked;
  for (;;) {
    const op = ops.find((candidate) => candidate.seq === through + 1);
    if (!op?.outcome || op.outcome.kind === 'failed') return through;
    through += 1;
  }
}

/** 1 s doubling to 30 s, reset on success (§7.5). */
export function createBackoff(first = 1000, max = 30_000) {
  let attempt = 0;
  return {
    next: (): number => Math.min(max, first * 2 ** attempt++),
    reset: (): void => {
      attempt = 0;
    },
  };
}
