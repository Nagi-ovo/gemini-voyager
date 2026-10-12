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

    try {
      chrome.storage?.local?.set({ [key]: data }, () => {
        if (chrome.runtime.lastError) {
          console.warn(LOG_PREFIX, 'Failed to save draft:', chrome.runtime.lastError.message);
          return;
        }
        this.onSaved(path, sanitizedContent);
        // Prune old drafts periodically (not every save)
        this.saveCount++;
        if (this.saveCount % PRUNE_EVERY_N_SAVES === 0) {
          this.pruneOldDrafts();
        }
      });
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) return;
      console.warn(LOG_PREFIX, 'Failed to save draft:', error);
    }
  }

  /**
   * Remove a draft for a given path.
   */
  remove(path: string): void {
    if (!this.options.writable()) return;
    const key = this.storageKey(path);
    try {
      chrome.storage?.local?.remove(key);
      this.onSaved(path, '');
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) return;
      console.warn(LOG_PREFIX, 'Failed to remove draft:', error);
    }
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
    try {
      chrome.storage?.local?.get(null, (items) => {
        if (chrome.runtime.lastError) return;
        // Enterprise can surface while the read is out: it removes nothing either.
        if (!this.options.writable()) return;

        const draftEntries: { key: string; timestamp: number }[] = [];
        for (const [key, value] of Object.entries(items)) {
          if (key.startsWith(this.options.prefix) && value && typeof value === 'object') {
            const entry = value as { timestamp?: number };
            draftEntries.push({ key, timestamp: entry.timestamp ?? 0 });
          }
        }

        if (draftEntries.length <= MAX_DRAFTS) return;

        // Sort by timestamp ascending (oldest first)
        draftEntries.sort((a, b) => a.timestamp - b.timestamp);

        const toRemove = draftEntries.slice(0, draftEntries.length - MAX_DRAFTS).map((e) => e.key);
        chrome.storage?.local?.remove(toRemove);
      });
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) return;
    }
  }
}
