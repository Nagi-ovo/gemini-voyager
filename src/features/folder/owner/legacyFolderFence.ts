import browser from 'webextension-polyfill';

import { createToaster } from '@/core/ui/toast/toaster';
import { getTranslationSync } from '@/utils/i18n';

import { authorityForSite, readAuthorityFence } from './authorityFence';
import { siteOfFolderKey } from './folderOwnerPolicy';

type FenceState = 'legacy' | 'unreadable' | 'reload_required';
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export class LegacyFolderWriteRefusedError extends Error {
  constructor() {
    super('Legacy folder storage is fenced');
    this.name = 'LegacyFolderWriteRefusedError';
  }
}

/** Owns write authority, bounded availability checks and the terminal reload notice. */
export class LegacyFolderFence {
  private readonly site;
  private state: FenceState = 'legacy';
  private readonly toaster = createToaster();
  private destroyed = false;
  private closing = false;
  private generation = 0;
  private readSequence = 0;
  private settledRead = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;

  constructor(
    key: string,
    private readonly onChange: () => void,
    private readonly retryUnavailable = true,
  ) {
    this.site = siteOfFolderKey(key);
  }

  get canWrite(): boolean {
    return !this.destroyed && this.state === 'legacy';
  }

  get reloadRequired(): boolean {
    return this.state === 'reload_required';
  }

  async check(): Promise<boolean> {
    if (this.destroyed || this.reloadRequired) return false;
    const generation = this.generation;
    const sequence = ++this.readSequence;
    try {
      const authority = await readAuthorityFence(browser.storage.local, this.site);
      if (generation !== this.generation || this.destroyed) return false;
      if (sequence < this.settledRead) return this.canWrite;
      this.settledRead = sequence;
      this.setState(authority === 'owner' ? 'reload_required' : 'legacy');
    } catch {
      if (generation === this.generation && sequence >= this.settledRead && !this.destroyed) {
        this.settledRead = sequence;
        this.setState('unreadable');
      }
    }
    return generation === this.generation && this.canWrite;
  }

  /** Check immediately before issuing a physical mutation; there is no await between them. */
  async write<T>(operation: () => T | Promise<T>): Promise<T> {
    if (!(await this.check()) || !this.canWrite) throw new LegacyFolderWriteRefusedError();
    return operation();
  }

  observe(value: unknown): void {
    this.generation += 1;
    try {
      this.setState(authorityForSite(value, this.site) === 'owner' ? 'reload_required' : 'legacy');
    } catch {
      this.setState('unreadable');
    }
  }

  private setState(state: FenceState): void {
    // A late legacy read must not reopen an old tab after it saw the owner fence.
    if (this.destroyed || this.reloadRequired) return;
    if (state === 'unreadable' && this.retryUnavailable && !this.closing) this.scheduleRetry();
    else {
      if (this.retry !== null) clearTimeout(this.retry);
      this.retry = null;
      this.retryAttempt = 0;
    }
    if (state === this.state) return;
    this.state = state;
    if (this.reloadRequired && !this.closing) {
      this.toaster.show({
        message: getTranslationSync('folder_reload_required'),
        tone: 'error',
        durationMs: null,
        dismissLabel: getTranslationSync('coachmarkClose'),
      });
    }
    this.onChange();
  }

  private scheduleRetry(): void {
    if (this.retry !== null) return;
    const delay = RETRY_DELAYS[Math.min(this.retryAttempt++, RETRY_DELAYS.length - 1)];
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.check();
    }, delay);
  }

  /** Stop background work while already accepted writes finish their fresh checks. */
  close(): void {
    this.closing = true;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.toaster.destroy();
  }

  destroy(): void {
    this.close();
    this.destroyed = true;
    this.generation += 1;
  }
}
