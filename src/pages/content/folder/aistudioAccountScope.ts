/**
 * Which AI Studio account the folders belong to. The repository owns the
 * session swap and its retry; this adds AI Studio's account fingerprint
 * (`/u/<n>` plus the signed-in email), so a poll for the same account never
 * rebinds and never closes open dialogs.
 */
import {
  type AccountContext,
  accountIsolationService,
  detectAccountContextFromDocument,
} from '@/core/services/AccountIsolationService';

import type { FolderRepository } from './FolderRepository';

const ACCOUNT_POLL_MS = 1200;

/** `null` while isolation is off, so any bound session satisfies the poller. */
function fingerprintFor(context: Pick<AccountContext, 'routeUserId' | 'email'> | null) {
  return context ? `${context.routeUserId || ''}::${context.email || ''}` : null;
}

export class AIStudioAccountScope {
  private lastFingerprint: string | null = null;
  private resolvingFingerprint: string | null = null;
  private poller: number | null = null;

  constructor(private readonly repository: FolderRepository) {}

  get polling(): boolean {
    return this.poller !== null;
  }

  /** The repository bound a session for `context`. */
  bound(context: AccountContext | null): void {
    this.lastFingerprint = fingerprintFor(context);
  }

  async loadIsolationSetting(): Promise<void> {
    try {
      this.repository.setAccountIsolationFlag(await this.readIsolationSetting());
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to load account isolation setting:', error);
      this.repository.setAccountIsolationFlag(false);
    }
  }

  readIsolationSetting(): Promise<boolean> {
    return accountIsolationService.isIsolationEnabled({
      platform: 'aistudio',
      pageUrl: window.location.href,
    });
  }

  /**
   * Rebinds persistence when the fingerprint changed (or `force`). Returns
   * whether a new session bound; a failed resolution stays unbound and the
   * repository retries it.
   */
  async refresh(force = false): Promise<boolean> {
    const fingerprint = this.repository.accountIsolationEnabled ? this.currentFingerprint() : null;
    const unchanged = this.repository.session && fingerprint === this.lastFingerprint;
    const resolving = fingerprint !== null && fingerprint === this.resolvingFingerprint;
    if (!force && (unchanged || resolving)) return false;
    this.resolvingFingerprint = fingerprint;
    const previous = this.repository.session;
    const refresh = this.repository.refreshAccountScope();
    const request = this.repository.activation;
    try {
      await refresh;
      const session = this.repository.session;
      return request === this.repository.activation && session !== null && session !== previous;
    } finally {
      if (request === this.repository.activation) this.resolvingFingerprint = null;
    }
  }

  /** Polls for an account switch; restarting replaces the previous poll. */
  startPolling(onPoll: () => void): void {
    if (this.poller) clearInterval(this.poller);
    this.poller = window.setInterval(onPoll, ACCOUNT_POLL_MS);
  }

  /** Stops polling and forgets a resolution in flight. */
  stop(): void {
    if (this.poller !== null) clearInterval(this.poller);
    this.poller = null;
    this.resolvingFingerprint = null;
  }

  private currentFingerprint(): string | null {
    return fingerprintFor(detectAccountContextFromDocument(window.location.href, document));
  }
}
