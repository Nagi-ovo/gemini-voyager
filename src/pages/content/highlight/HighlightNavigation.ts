import type { HighlightRecordV1 } from '@/core/types/highlight';

import { findHighlightTurn, isVisibleHighlightMark } from './dom';

const HIGHLIGHT_HASH_PREFIX = '#gv-highlight-';
export type HighlightNavigationResult = 'highlight' | 'turn' | 'missing';

/** Owns exact-mark focus and bounded hash retries, including the one-time turn fallback. */
export class HighlightNavigation {
  private activeTimer: number | null = null;
  private hashRetryTimer: number | null = null;
  private pendingHashId: string | null = null;
  private pendingHashDeadline = 0;
  private pendingTurnFallbackDone = false;

  constructor(
    private readonly marks: ReadonlyMap<string, readonly HTMLElement[]>,
    private readonly records: ReadonlyMap<string, HighlightRecordV1>,
    private readonly isDestroyed: () => boolean,
  ) {}

  navigate(
    id: string,
    behavior: ScrollBehavior = 'smooth',
    allowTurnFallback = true,
  ): HighlightNavigationResult {
    const mark = this.marks.get(id)?.find(isVisibleHighlightMark);
    if (mark) {
      mark.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
      mark.focus({ preventScroll: true });
      document.querySelectorAll('.gv-highlight-active').forEach((element) => {
        element.classList.remove('gv-highlight-active');
      });
      mark.classList.add('gv-highlight-active');
      if (this.activeTimer !== null) window.clearTimeout(this.activeTimer);
      this.activeTimer = window.setTimeout(() => {
        mark.classList.remove('gv-highlight-active');
        this.activeTimer = null;
      }, 1600);
      return 'highlight';
    }

    if (!allowTurnFallback) return 'missing';
    const record = this.records.get(id);
    const turn = record ? findHighlightTurn(record.turnId) : null;
    if (turn) {
      turn.userElement.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
      return 'turn';
    }
    return 'missing';
  }

  handleHash(): void {
    if (!location.hash.startsWith(HIGHLIGHT_HASH_PREFIX)) {
      if (this.hashRetryTimer !== null) window.clearTimeout(this.hashRetryTimer);
      this.hashRetryTimer = null;
      this.pendingHashId = null;
      this.pendingHashDeadline = 0;
      this.pendingTurnFallbackDone = false;
      return;
    }
    let id = '';
    try {
      id = decodeURIComponent(location.hash.slice(HIGHLIGHT_HASH_PREFIX.length));
    } catch {
      return;
    }
    if (!id) return;
    if (this.pendingHashId !== id) {
      this.pendingHashId = id;
      this.pendingHashDeadline = Date.now() + 5000;
      this.pendingTurnFallbackDone = false;
    }
    this.attemptPendingHashNavigation();
  }

  private attemptPendingHashNavigation(): void {
    const id = this.pendingHashId;
    if (!id || this.isDestroyed()) return;
    if (this.hashRetryTimer !== null) {
      window.clearTimeout(this.hashRetryTimer);
      this.hashRetryTimer = null;
    }
    const result = this.navigate(id, 'smooth', !this.pendingTurnFallbackDone);
    if (result === 'highlight') {
      this.pendingHashId = null;
      this.pendingHashDeadline = 0;
      this.pendingTurnFallbackDone = false;
      return;
    }
    if (result === 'turn') this.pendingTurnFallbackDone = true;
    if (Date.now() >= this.pendingHashDeadline) {
      this.pendingHashId = null;
      this.pendingHashDeadline = 0;
      this.pendingTurnFallbackDone = false;
      return;
    }
    // The turn can exist before Gemini mounts its response. Keep a bounded
    // precise-navigation retry even after the one-time turn fallback.
    this.hashRetryTimer = window.setTimeout(() => {
      this.hashRetryTimer = null;
      this.attemptPendingHashNavigation();
    }, 300);
  }

  retryPending(): void {
    if (this.pendingHashId) this.attemptPendingHashNavigation();
  }

  destroy(): void {
    if (this.activeTimer !== null) window.clearTimeout(this.activeTimer);
    if (this.hashRetryTimer !== null) window.clearTimeout(this.hashRetryTimer);
    this.pendingHashId = null;
  }
}
