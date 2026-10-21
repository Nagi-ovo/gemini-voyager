/**
 * HealthMonitor — the "no effect on this page" signal (plan D12, §4.4).
 *
 * A mounted plugin that touches the page (DOM ops or a primitive) is expected
 * to find at least one target once the conversation has rendered. The monitor
 * waits until the DOM has been QUIET for a while (no childList mutations),
 * then compares the site's user-turn count with the plugin's target count:
 *
 *   userTurns > 0 && targets === 0  →  no effect (yellow in the popup)
 *   targets > 0                      →  cleared immediately on the next check
 *   userTurns === 0                  →  never flagged (empty conversation)
 *
 * The same verdict also names the ops that found nothing although the page
 * shows what they need (`missingOps` in `opDiagnostics.ts`): a `sidebar` op
 * that stopped matching after a redesign, say, while another op on `body`
 * keeps the plugin-wide count above zero. Those ops are reported beside the
 * flag, never instead of it, and `page` keys are judged on an empty chat too.
 *
 * Quiet detection drives the timing so a slow network never produces a false
 * positive; a fixed deadline only caps how long the first verdict may wait.
 * Pure-CSS plugins are never tracked (they have no countable targets). The
 * engine's own MutationObserver feeds `noteMutation`; the monitor installs
 * none of its own.
 */
import { type OpDiagnostic, missingOps } from './opDiagnostics';

export interface HealthMonitorOptions {
  /** Elements the site adapter recognises as user turns; 0 means "empty page". */
  readonly countUserTurns: () => number;
  readonly onChange?: (id: string, noEffect: boolean, zeroOps: readonly number[]) => void;
  /** DOM silence required before a verdict. */
  readonly quietMs?: number;
  /** Upper bound on the wait for the first verdict after a plugin is tracked. */
  readonly maxWaitMs?: number;
}

export const HEALTH_QUIET_MS = 1_500;
export const HEALTH_MAX_WAIT_MS = 10_000;

/** One look at a plugin's targets. */
export interface HealthSample {
  /** Elements its ops and primitive counters found, page-root targets included. */
  readonly targets: number;
  /** Its targeted ops, each with its own count. */
  readonly ops: readonly OpDiagnostic[];
}

interface Tracked {
  readonly sample: () => HealthSample;
  noEffect: boolean | undefined;
  zeroOps: readonly number[];
}

const EMPTY_SAMPLE: HealthSample = { targets: 0, ops: [] };

export class HealthMonitor {
  private readonly countUserTurns: () => number;
  private readonly onChange?: HealthMonitorOptions['onChange'];
  private readonly quietMs: number;
  private readonly maxWaitMs: number;
  private readonly tracked = new Map<string, Tracked>();
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMutationAt = 0;
  private disposed = false;

  constructor(options: HealthMonitorOptions) {
    this.countUserTurns = options.countUserTurns;
    this.onChange = options.onChange;
    this.quietMs = options.quietMs ?? HEALTH_QUIET_MS;
    this.maxWaitMs = options.maxWaitMs ?? HEALTH_MAX_WAIT_MS;
  }

  /** Start watching a plugin. Its first verdict arrives after the next quiet period. */
  track(id: string, sample: () => HealthSample): void {
    if (this.disposed) return;
    this.tracked.set(id, { sample, noEffect: undefined, zeroOps: [] });
    this.armQuietTimer();
    this.armDeadline();
  }

  forget(id: string): void {
    this.tracked.delete(id);
    if (this.tracked.size === 0) this.stopWatching();
  }

  /** True while at least one plugin awaits or holds a verdict (the owner keeps observing). */
  hasTracked(): boolean {
    return this.tracked.size > 0;
  }

  /**
   * The owner's MutationObserver reports childList mutations here; the
   * monitor shares that observer instead of installing a second one.
   */
  noteMutation(): void {
    if (this.disposed || this.tracked.size === 0) return;
    this.lastMutationAt = Date.now();
    this.armQuietTimer();
  }

  /** `true` = flagged as having no effect; `false` = healthy; `undefined` = no verdict yet. */
  get(id: string): boolean | undefined {
    return this.tracked.get(id)?.noEffect;
  }

  /** `domOps` indexes the last verdict found nothing for (see the class doc); `[]` before one. */
  zeroOps(id: string): readonly number[] {
    return this.tracked.get(id)?.zeroOps ?? [];
  }

  /** Evaluate every tracked plugin now (tests, and the quiet/deadline timers). */
  evaluateNow(): void {
    if (this.disposed || this.tracked.size === 0) return;
    this.clearDeadline();
    const userTurns = this.countUserTurns();
    for (const [id, entry] of this.tracked) {
      let sample = EMPTY_SAMPLE;
      try {
        sample = entry.sample();
      } catch {
        // A throwing sample reports nothing.
      }
      const noEffect = userTurns > 0 && sample.targets === 0;
      const zeroOps = missingOps(sample.ops, userTurns);
      if (entry.noEffect !== noEffect || !sameIndexes(entry.zeroOps, zeroOps)) {
        entry.noEffect = noEffect;
        entry.zeroOps = zeroOps;
        this.onChange?.(id, noEffect, zeroOps);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.tracked.clear();
    this.stopWatching();
  }

  private armQuietTimer(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      this.quietTimer = null;
      if (Date.now() - this.lastMutationAt < this.quietMs) {
        this.armQuietTimer();
        return;
      }
      this.evaluateNow();
    }, this.quietMs);
  }

  private armDeadline(): void {
    if (this.deadlineTimer) return;
    this.deadlineTimer = setTimeout(() => {
      this.deadlineTimer = null;
      this.evaluateNow();
    }, this.maxWaitMs);
  }

  private clearDeadline(): void {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
  }

  private stopWatching(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = null;
    this.clearDeadline();
  }
}

function sameIndexes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
