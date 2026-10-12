import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { type DraftPolicy, sanitizeDraftAt } from '@/features/plugins/verbs/draftSave/draftPolicy';

const LOG_PREFIX = '[DraftSave]';

/** Maximum number of drafts to keep (oldest are pruned) */
const MAX_DRAFTS = 5;

/** Only run pruneOldDrafts every N saves to avoid reading all storage too often */
const PRUNE_EVERY_N_SAVES = 10;

export interface DraftStoreOptions {
  /** Every key is `<prefix><path>`; pruning only ever counts and removes keys under it. */
  readonly prefix: string;
  /** Text cleanup before the trim; Gemini strips Voyager's folder project instructions. */
  readonly sanitize: (content: string) => string;
  /** Checked before every save or removal; a page that may not hold drafts writes nothing. */
  readonly writable: () => boolean;
}

/** The store a draft policy describes: its prefix, its store-stage sanitizer and its eligibility. */
export function draftStoreOptions(policy: DraftPolicy, doc: Document): DraftStoreOptions {
  return {
    prefix: policy.store.prefix,
    sanitize: (content) => sanitizeDraftAt(policy, 'store', content),
    // Re-checked per write: Enterprise can surface after startup through a URL or DOM hint.
    writable: () => policy.eligible(location, doc),
  };
}

export class DraftStore {
  /** All owners of one prefix share write/prune ordering within this page. */
  private static readonly operations = new Map<
    string,
    { write: boolean; run: (done: () => void) => void }[]
  >();
  private saveCount = 0;

  constructor(
    private readonly onSaved: (path: string, content: string) => void,
    private readonly options: DraftStoreOptions,
  ) {}

  /**
   * Get the storage key for a conversation path.
   */
  private storageKey(path: string): string {
    return `${this.options.prefix}${path}`;
  }

  private enqueue(write: boolean, run: (done: () => void) => void): void {
    const prefix = this.options.prefix;
    const waiting = DraftStore.operations.get(prefix);
    if (waiting) {
      waiting.push({ write, run });
      return;
    }
    const queue = [{ write, run }];
    DraftStore.operations.set(prefix, queue);
    const next = (): void => {
      const operation = queue.shift();
      if (!operation) {
        DraftStore.operations.delete(prefix);
        return;
      }
      let finished = false;
      operation.run(() => {
        if (finished) return;
        finished = true;
        next();
      });
    };
    // An idle save starts its storage call now, including the unload flush.
    next();
  }

  /**
   * Save a draft for the current conversation.
   */
  save(path: string, content: string): void {
    if (!this.options.writable()) return;
    const sanitizedContent = this.options.sanitize(content).trim();

    if (!sanitizedContent) {
      // Remove draft if content is empty
      this.remove(path);
      return;
    }

    const key = this.storageKey(path);
    const data = {
      content: sanitizedContent,
      timestamp: Date.now(),
      path,
    };

    this.enqueue(true, (done) => {
      if (!this.options.writable() || !chrome.storage?.local?.set) {
        done();
        return;
      }
      try {
        chrome.storage.local.set({ [key]: data }, () => {
          try {
            if (chrome.runtime.lastError) {
              console.warn(LOG_PREFIX, 'Failed to save draft:', chrome.runtime.lastError.message);
              return;
            }
            this.onSaved(path, sanitizedContent);
            this.saveCount++;
            if (this.saveCount % PRUNE_EVERY_N_SAVES === 0) this.pruneOldDrafts();
          } finally {
            done();
          }
        });
      } catch (error) {
        done();
        if (isExtensionContextInvalidatedError(error)) return;
        console.warn(LOG_PREFIX, 'Failed to save draft:', error);
      }
    });
  }

  /**
   * Remove a draft for a given path.
   */
  remove(path: string): void {
    if (!this.options.writable()) return;
    const key = this.storageKey(path);
    this.enqueue(true, (done) => {
      if (!this.options.writable()) {
        done();
        return;
      }
      try {
        const removal = chrome.storage?.local?.remove(key);
        this.onSaved(path, '');
        void Promise.resolve(removal).then(done, done);
      } catch (error) {
        done();
        if (isExtensionContextInvalidatedError(error)) return;
        console.warn(LOG_PREFIX, 'Failed to remove draft:', error);
      }
    });
  }

  /**
   * Load a draft for a given path.
   */
  async load(path: string): Promise<string | null> {
    const key = this.storageKey(path);
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.get(key, (result) => {
          const data = result?.[key] as { content?: string } | undefined;
          resolve(data?.content ?? null);
        });
      } catch (error) {
        if (isExtensionContextInvalidatedError(error)) {
          resolve(null);
          return;
        }
        console.warn(LOG_PREFIX, 'Failed to load draft:', error);
        resolve(null);
      }
    });
  }

  /**
   * Prune old drafts to keep storage usage bounded.
   */
  private pruneOldDrafts(): void {
    if (!this.options.writable()) return;
    this.enqueue(false, (done) => {
      if (!this.options.writable() || !chrome.storage?.local?.get) {
        done();
        return;
      }
      try {
        chrome.storage.local.get(null, (items) => {
          if (chrome.runtime.lastError || !this.options.writable()) {
            done();
            return;
          }
          // A queued rewrite can turn an old prune candidate into the newest draft.
          if (
            DraftStore.operations.get(this.options.prefix)?.some((operation) => operation.write)
          ) {
            this.pruneOldDrafts();
            done();
            return;
          }

          const draftEntries: { key: string; timestamp: number }[] = [];
          for (const [key, value] of Object.entries(items)) {
            if (key.startsWith(this.options.prefix) && value && typeof value === 'object') {
              const entry = value as { timestamp?: number };
              draftEntries.push({ key, timestamp: entry.timestamp ?? 0 });
            }
          }

          if (draftEntries.length <= MAX_DRAFTS) {
            done();
            return;
          }

          // Sort by timestamp ascending (oldest first)
          draftEntries.sort((a, b) => a.timestamp - b.timestamp);

          const toRemove = draftEntries
            .slice(0, draftEntries.length - MAX_DRAFTS)
            .map((e) => e.key);
          try {
            const removal = chrome.storage.local.remove(toRemove);
            void Promise.resolve(removal).then(done, done);
          } catch {
            done();
          }
        });
      } catch {
        done();
      }
    });
  }
}
