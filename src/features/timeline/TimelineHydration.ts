/** One store's readiness, read lifetime and ordering against complete external snapshots. */
export class TimelineHydration {
  private status: 'idle' | 'reading' | 'failed' | 'ready' = 'idle';
  private pending: Promise<void> | null = null;
  private revision = 0;

  constructor(private readonly isCurrent: () => boolean) {}

  get ready(): boolean {
    return this.isCurrent() && this.status === 'ready';
  }

  changed(): void {
    this.revision += 1;
  }

  invalidate(): void {
    this.changed();
    this.status = 'failed';
    this.pending = null;
  }

  snapshot(apply: () => void): void {
    if (!this.isCurrent()) return;
    this.changed();
    this.status = 'ready';
    apply();
  }

  read(load: (accept: (apply: () => void) => boolean) => Promise<void>): Promise<void> {
    if (this.ready || !this.isCurrent()) return Promise.resolve();
    if (this.pending) return this.pending;
    const revision = this.revision;
    this.status = 'reading';
    // Settled failures must release the read so a later edit can recover without a remount.
    const pending = load((apply) => {
      if (!this.isCurrent() || revision !== this.revision) return false;
      this.status = 'ready';
      apply();
      return true;
    }).finally(() => {
      // An invalidated read cannot release a newer recovery read.
      if (this.pending !== pending) return;
      this.pending = null;
      if (this.status === 'reading') this.status = 'failed';
    });
    this.pending = pending;
    return pending;
  }

  edit(retry: () => Promise<void>, apply: () => void): void | Promise<void> {
    if (this.ready) {
      this.changed();
      apply();
    } else if (this.isCurrent() && this.status === 'failed') {
      const revision = this.revision;
      return retry().then(() => {
        // A newer accepted choice wins over an older edit waiting for recovery.
        if (this.ready && revision === this.revision) {
          this.changed();
          apply();
        }
      });
    }
    // Edits during the initial/pending read are refused, never queued over an unknown outline.
  }
}
