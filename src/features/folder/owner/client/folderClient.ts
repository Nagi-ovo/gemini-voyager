/**
 * One tab's client of the folder owner for one key (DESIGN-v2 §7). Implemented
 * and tested, not selectable: nothing in production constructs it until a
 * site's authority is `owner` (P4).
 *
 * Ops move pending → accepted (their pending key is written, one `set` per op
 * in seq order, addendum P0 R1.3) → committed or rejected (an outcome was
 * delivered). The view is the last consistent base plus every op it does not
 * include yet. A run resolves only with a delivered outcome: a base whose
 * watermark covers an op takes it out of the overlay but never settles it, and
 * sends restart from `acked + 1`, so an op another turn drained answers with
 * its stored outcome (addendum P0 R2.2, R2.3).
 */
import type { FolderData } from '@/core/types/folder';
import {
  type EditOutcome,
  type FolderCommands,
  type FolderCommandsStatus,
  type OrdinaryOpBody,
  failed,
} from '@/features/folder/commands/folderCommands';

import { type StoredOutcome, isTerminal } from '../folderOps';
import { MAX_BATCH_OPS } from '../folderOwnerCore';
import type {
  FolderOwnerRequest,
  FolderOwnerResponse,
  PendingOpEntry,
} from '../folderOwnerMessages';
import type { FolderSitePolicy } from '../folderOwnerPolicy';
import { type FolderOwnerStorageArea, pendingOpKey } from '../folderOwnerState';
import {
  ALLOWANCE_BYTES,
  type Allowance,
  type AllowanceClocks,
  type SentAt,
  granted,
  isFresh,
  pendingKeyBytes,
  sentNow,
} from './clientAllowance';
import { type ClientBase, type StorageChange, classifyChange, overlay } from './clientBase';
import { type ClientOp, createBackoff, deliver, sendable, settledPrefix } from './clientOps';

export type StorageListener = (changes: Record<string, StorageChange>) => void;

export interface FolderClientOptions {
  key: string;
  policy: FolderSitePolicy;
  /** `chrome.storage.local`: pending keys only. */
  area: FolderOwnerStorageArea;
  /** A runtime message to the owner; throws on a transport error. */
  send(request: FolderOwnerRequest): Promise<FolderOwnerResponse>;
  subscribe(listener: StorageListener): () => void;
  now?: () => number;
  /** A monotonic clock (`performance.now`), checked with `now` for the allowance's age. */
  monotonic?: () => number;
  newId?: () => string;
  setTimer?: (run: () => void, ms: number) => () => void;
}

/** A reply that did not settle the base waits this long for its echo before asking for a snapshot. */
export const ECHO_WAIT_MS = 2000;

const TOO_LARGE: EditOutcome = {
  kind: 'rejected',
  reason: 'payload_too_large',
  messageKey: 'folder_save_error',
};
const UNOPENED_EPOCH = '00000000-0000-0000-0000-000000000000';

const defaultTimer = (run: () => void, ms: number) => {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
};

export class FolderClient implements FolderCommands {
  private clientId: string;
  private base: ClientBase | null = null;
  private ops: ClientOp[] = [];
  private nextSeq = 1;
  private acked = 0;
  private batchLimit = MAX_BATCH_OPS;
  private state: FolderCommandsStatus = 'loading';
  private publishing = false;
  private sending = false;
  private disposed = false;
  private subscribed = true;
  /** A pending-key `set` is failing: the status stays "Not saved" until one succeeds (§7.5). */
  private storageFailing = false;
  /** Set while detached (§7.7): resolves once no op is still pending. */
  private allAccepted: (() => void) | null = null;
  private readonly timers = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  private readonly retry = createBackoff();
  private readonly clocks: AllowanceClocks;
  /** The owner's pending allowance, dated from the request that granted it (R3.2). */
  private allowance: Allowance | null = null;
  private reopening = false;
  /** A re-open happened since the last pending-key `set` succeeded. */
  private reopened = false;

  constructor(private readonly options: FolderClientOptions) {
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.setTimer = options.setTimer ?? defaultTimer;
    this.clocks = { wall: this.now, monotonic: options.monotonic ?? (() => performance.now()) };
    this.clientId = this.newId();
    this.unsubscribe = options.subscribe((changes) => this.onStorageChange(changes));
  }

  status(): FolderCommandsStatus {
    return this.state;
  }

  view(): FolderData {
    const ops = this.ops.map((op) => ({ ...op, rejected: op.state === 'rejected' }));
    return overlay(this.base, ops, this.options.policy, this.now());
  }

  run(body: OrdinaryOpBody): Promise<EditOutcome> {
    if (this.state === 'reload_required' || this.disposed) {
      return Promise.resolve(failed('reload_required'));
    }
    const at = this.now();
    const bytes = pendingKeyBytes(
      pendingOpKey(this.clientId, this.nextSeq),
      this.pendingEntry(body, this.nextSeq, at),
    );
    // A single envelope must fit even with no held ops; reject before reserving its sequence.
    if (bytes > ALLOWANCE_BYTES) return Promise.resolve(TOO_LARGE);
    return new Promise((resolve) => {
      this.ops.push({ seq: this.nextSeq++, body, at, state: 'pending', waiters: [resolve] });
      queueMicrotask(() => void this.publish());
    });
  }

  /** Bulk ops go through a one-shot client of the owner (P3). */
  runBulk(): Promise<EditOutcome> {
    return Promise.resolve(failed('not_loaded'));
  }

  flush(): Promise<void> {
    const open = this.ops.filter((op) => !op.outcome);
    return Promise.all(open.map((op) => new Promise<void>((r) => op.waiters.push(() => r())))).then(
      () => undefined,
    );
  }

  async open(): Promise<void> {
    const sent = sentNow(this.clocks);
    const reply = await this.request({
      type: 'gv.folderOwner.open',
      key: this.options.key,
      clientId: this.clientId,
      ackedThrough: this.acked,
      ...(this.base ? { epoch: this.base.epoch } : {}),
    });
    if (!reply || this.stopped()) return;
    if (reply.kind === 'ready' || reply.kind === 'empty' || reply.kind === 'invalid') {
      const data = reply.kind === 'ready' ? reply.data : null;
      const dataHash = reply.kind === 'ready' ? reply.dataHash : (this.base?.dataHash ?? '');
      this.base = { data, epoch: reply.epoch, rev: reply.rev, dataHash, applied: reply.applied };
      this.grant(sent, 'allowanceTtlMs' in reply ? reply.allowanceTtlMs : undefined);
      // An invalid K waits for the recovery panel (P3); edits stay queued, never applied to it.
      this.state = reply.kind === 'invalid' ? 'read_only' : this.settledState();
      this.retry.reset();
      void this.publish();
      return;
    }
    this.onRefusal(reply, () => void this.open());
  }

  /**
   * Account switch (§7.7): the UI stops reading this client at once, and it
   * stays alive only until every op is accepted. The owner drains accepted
   * ops even if the tab never returns to this account.
   */
  async detach(): Promise<void> {
    this.release();
    if (this.base && this.nextPending()) {
      await new Promise<void>((resolve) => (this.allAccepted = resolve));
    }
    this.dispose();
  }

  dispose(): void {
    this.disposed = true;
    this.release();
    for (const cancel of this.timers) cancel();
    this.timers.clear();
  }

  private release(): void {
    if (this.subscribed) this.unsubscribe();
    this.subscribed = false;
  }

  private pendingEntry(body: OrdinaryOpBody, seq: number, at: number): PendingOpEntry {
    return {
      v: 1,
      key: this.options.key,
      // Before open, reserve the length of the UUID epoch the native owner creates.
      epoch: this.base?.epoch ?? UNOPENED_EPOCH,
      clientId: this.clientId,
      seq,
      at,
      op: body,
    };
  }

  /** Writes pending keys one at a time in seq order, then sends. */
  private async publish(): Promise<void> {
    if (this.publishing || !this.base || this.state === 'read_only' || this.stopped()) return;
    this.publishing = true;
    try {
      for (let op = this.nextPending(); op; op = this.nextPending()) {
        const entry = this.pendingEntry(op.body, op.seq, op.at);
        const pendingKey = pendingOpKey(this.clientId, op.seq);
        const bytes = pendingKeyBytes(pendingKey, entry);
        // Over the allowance the op stays pending ("Not saved") until applied ops free room.
        if (this.heldBytes() + bytes > ALLOWANCE_BYTES) return this.holdPending();
        // Checked right before each `set`: an expired allowance re-opens first (R3.2).
        if (!isFresh(this.allowance, this.clocks)) return this.reopen();
        try {
          await this.options.area.set({ [pendingKey]: entry });
        } catch {
          // Quota or storage failure: the op stays pending and visible; "Not saved" (§7.5).
          this.storageFailing = true;
          this.state = 'delayed';
          this.later(() => void this.publish(), this.retry.next());
          return;
        }
        if (this.stopped()) return;
        op.state = 'accepted';
        op.bytes = bytes;
        this.reopened = false;
        this.storageFailing = false;
        if (this.state === 'delayed') this.state = 'ready';
      }
    } finally {
      this.publishing = false;
    }
    if (this.allAccepted) return this.allAccepted();
    void this.sendBatch();
  }

  /** Pending-key bytes of accepted ops with no outcome yet: the owner removes a key as it applies it. */
  private heldBytes(): number {
    return this.ops.reduce((sum, op) => (op.state === 'accepted' ? sum + (op.bytes ?? 0) : sum), 0);
  }

  private holdPending(): void {
    this.state = 'delayed';
    void this.sendBatch();
  }

  /** Re-opens for a fresh allowance; again only after a back-off if that one was not fresh either. */
  private reopen(): void {
    if (this.reopening) return;
    this.reopening = true;
    const run = () => void this.open().finally(() => (this.reopening = false));
    if (this.reopened) this.later(run, this.retry.next());
    else run();
    this.reopened = true;
  }

  private grant(sent: SentAt, ttlMs: unknown): void {
    this.allowance = granted(sent, ttlMs, this.allowance);
  }

  /** The next op to publish; one that already failed (for example after a stop) never is. */
  private nextPending(): ClientOp | undefined {
    if (this.disposed) return undefined;
    return this.ops.find((op) => op.state === 'pending' && !op.outcome);
  }

  private stopped(): boolean {
    return this.disposed || this.state === 'reload_required';
  }

  /** `ready`, unless a pending-key write is still failing. */
  private settledState(): FolderCommandsStatus {
    return this.storageFailing ? 'delayed' : 'ready';
  }

  private async sendBatch(): Promise<void> {
    if (this.sending || !this.base || this.stopped()) return;
    const batch = sendable(this.ops, this.acked, this.batchLimit);
    if (batch.length === 0) return;
    this.sending = true;
    const sent = sentNow(this.clocks);
    const reply = await this.request({
      type: 'gv.folderOwner.apply',
      key: this.options.key,
      clientId: this.clientId,
      epoch: this.base.epoch,
      ops: batch.map((op) => ({ seq: op.seq, body: op.body })),
      ackedThrough: this.acked,
    });
    this.sending = false;
    if (!reply || this.stopped()) return;
    if (reply.kind === 'ok') {
      this.grant(sent, reply.allowanceTtlMs);
      // Applied ops free allowance room and refresh it for ops still pending.
      if (this.nextPending()) void this.publish();
      // An op inside an open bundle has no outcome yet: ask again later, not at once.
      if (this.onOutcomes(reply.outcomes, reply.rev)) void this.sendBatch();
      else this.later(() => void this.sendBatch(), this.retry.next());
      return;
    }
    if (reply.kind === 'bad_batch') return this.onBadBatch(batch);
    if (reply.kind === 'seq_gap') return void this.snapshot();
    this.onRefusal(reply, () => void this.sendBatch());
  }

  /** Delivers terminal outcomes; `false` when an op is still `bundle_pending` (R4.1). */
  private onOutcomes(outcomes: Record<number, StoredOutcome>, rev: number): boolean {
    let settled = true;
    for (const op of this.ops) {
      const outcome = outcomes[op.seq];
      if (!outcome || op.outcome) continue;
      if (isTerminal(outcome)) deliver(op, outcome);
      else settled = false;
    }
    this.acked = settledPrefix(this.ops, this.acked);
    this.batchLimit = MAX_BATCH_OPS;
    if (this.state === 'delayed') this.state = this.settledState();
    if (settled) this.retry.reset();
    this.prune();
    if (this.base && this.base.rev < rev) this.awaitEcho(rev);
    return settled;
  }

  /** Halves the batch; a single op the owner refuses means this client is out of step. */
  private onBadBatch(batch: ClientOp[]): void {
    if (batch.length === 1) return this.stop();
    this.batchLimit = Math.max(1, Math.floor(batch.length / 2));
    void this.sendBatch();
  }

  /** A refused or failed request: retry later, or stop when this build cannot edit (§7.5). */
  private onRefusal(reply: FolderOwnerResponse, again: () => void): void {
    const reason = 'reason' in reply ? reply.reason : reply.kind;
    if (
      reason === 'not_owner' ||
      reason === 'sender_not_allowed' ||
      reply.kind === 'unknown_client'
    ) {
      // Hook: unknown_client re-registers and offers the old id's accepted ops as held (P3, §7.5).
      this.stop();
      return;
    }
    // An invalid K waits for recovery and a fresh open; anything else (a read or write failure,
    // a transport error) is transient, and publishing pending keys never depends on it.
    if (reason === 'invalid_state') {
      this.state = 'read_only';
      this.later(() => void this.open(), this.retry.next());
      return;
    }
    this.state = 'delayed';
    this.later(again, this.retry.next());
  }

  private stop(): void {
    this.state = 'reload_required';
    for (const op of this.ops) if (!op.outcome) deliver(op, failed('reload_required'));
    this.allAccepted?.();
  }

  /** The reply's commit should arrive as an event; ask for a snapshot if it does not. */
  private awaitEcho(rev: number): void {
    this.later(() => {
      if (this.base && this.base.rev < rev) void this.snapshot();
    }, ECHO_WAIT_MS);
  }

  private async snapshot(): Promise<void> {
    if (this.stopped()) return;
    if (this.state === 'ready') this.state = 'reconciling';
    const reply = await this.request({
      type: 'gv.folderOwner.snapshot',
      key: this.options.key,
      clientId: this.clientId,
    });
    if (!reply || this.stopped() || !this.base) return;
    if (reply.kind !== 'ready' && reply.kind !== 'empty' && reply.kind !== 'invalid') {
      this.onRefusal(reply, () => void this.snapshot());
      return;
    }
    if (reply.epoch !== this.base.epoch) return this.stop();
    if (reply.rev >= this.base.rev) {
      const data = reply.kind === 'ready' ? reply.data : null;
      const dataHash = reply.kind === 'ready' ? reply.dataHash : this.base.dataHash;
      this.adopt({ data, epoch: reply.epoch, rev: reply.rev, dataHash, applied: reply.applied });
    }
    if (reply.kind === 'invalid') this.state = 'read_only';
    else if (this.state === 'reconciling' || this.state === 'read_only') {
      this.state = this.settledState();
      void this.publish();
    }
  }

  private onStorageChange(changes: Record<string, StorageChange>): void {
    if (!this.base || this.stopped()) return;
    const change = classifyChange(this.base, this.options.key, this.clientId, changes);
    if (change.kind === 'adopt') this.adopt(change.base);
    else if (change.kind === 'reconcile') void this.snapshot();
    else if (change.kind === 'epoch_changed') this.stop();
  }

  private adopt(base: ClientBase): void {
    this.base = base;
    this.prune();
  }

  /** Drops ops that are settled and either rejected or included in the base. */
  private prune(): void {
    const applied = this.base?.applied ?? 0;
    this.ops = this.ops.filter(
      (op) => !op.outcome || (op.state !== 'rejected' && op.seq > applied),
    );
  }

  /** The reply, or `null` after a transport error, which retries the same request later. */
  private async request(message: FolderOwnerRequest): Promise<FolderOwnerResponse | null> {
    try {
      return await this.options.send(message);
    } catch {
      if (this.stopped()) return null;
      this.state = this.state === 'loading' ? 'loading' : 'delayed';
      this.later(() => void this.retryRequest(message), this.retry.next());
      return null;
    }
  }

  private retryRequest(message: FolderOwnerRequest): void {
    if (message.type === 'gv.folderOwner.open') void this.open();
    else if (message.type === 'gv.folderOwner.apply') void this.sendBatch();
    else if (message.type === 'gv.folderOwner.snapshot') void this.snapshot();
  }

  private later(run: () => void, ms: number): void {
    if (this.disposed) return;
    const cancel = this.setTimer(() => {
      this.timers.delete(cancel);
      if (!this.disposed) run();
    }, ms);
    this.timers.add(cancel);
  }
}
