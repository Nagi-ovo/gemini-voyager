const LAYOUT_SETTLE_MS = 800;
const RECOVERY_POLL_MS = 2000;
const LAYOUT_EVENTS = ['resize', 'gv-print-cleanup', 'afterprint'] as const;

interface SidebarRecoveryCallbacks {
  /** Runs once layout events (resize, print cleanup) have been quiet for a moment. */
  onLayoutSettled: () => void;
  /** Runs on a fixed poll while the watchers are installed. */
  onPoll: () => void;
}

/** Owns the window listeners, debounce timer and poll that drive folder sidebar recovery. */
export class SidebarRecoveryWatchers {
  private interval: number | null = null;
  private debounce: number | null = null;
  private handler: (() => void) | null = null;

  constructor(private readonly callbacks: SidebarRecoveryCallbacks) {}

  /** Idempotent: install whichever watcher is not already running. */
  ensure(): void {
    if (!this.handler) {
      this.handler = () => {
        if (this.debounce !== null) window.clearTimeout(this.debounce);
        this.debounce = window.setTimeout(() => {
          this.debounce = null;
          this.callbacks.onLayoutSettled();
        }, LAYOUT_SETTLE_MS);
      };
      for (const type of LAYOUT_EVENTS) window.addEventListener(type, this.handler);
    }
    if (this.interval === null) {
      this.interval = window.setInterval(() => this.callbacks.onPoll(), RECOVERY_POLL_MS);
    }
  }

  teardown(): void {
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    this.debounce = null;
    if (this.handler) {
      for (const type of LAYOUT_EVENTS) window.removeEventListener(type, this.handler);
      this.handler = null;
    }
    if (this.interval !== null) window.clearInterval(this.interval);
    this.interval = null;
  }
}
