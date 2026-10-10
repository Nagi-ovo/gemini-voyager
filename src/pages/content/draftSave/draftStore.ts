import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { stripInstructionBlock } from '../folderProject/instructionBlock';

const LOG_PREFIX = '[DraftSave]';

/** Storage key prefix for draft entries in chrome.storage.local */
const DRAFT_STORAGE_PREFIX = 'gvDraft_';

/** Maximum number of drafts to keep (oldest are pruned) */
const MAX_DRAFTS = 5;

/** Only run pruneOldDrafts every N saves to avoid reading all storage too often */
const PRUNE_EVERY_N_SAVES = 10;

/**
 * Get the storage key for a conversation path.
 */
function getDraftStorageKey(path: string): string {
  return `${DRAFT_STORAGE_PREFIX}${path}`;
}

export class DraftStore {
  private saveCount = 0;

  constructor(private readonly onSaved: (path: string, content: string) => void) {}

  /**
   * Save a draft for the current conversation.
   */
  save(path: string, content: string): void {
    const sanitizedContent = stripInstructionBlock(content).trim();

    if (!sanitizedContent) {
      // Remove draft if content is empty
      this.remove(path);
      return;
    }

    const key = getDraftStorageKey(path);
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
    const key = getDraftStorageKey(path);
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
    const key = getDraftStorageKey(path);
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
    try {
      chrome.storage?.local?.get(null, (items) => {
        if (chrome.runtime.lastError) return;

        const draftEntries: { key: string; timestamp: number }[] = [];
        for (const [key, value] of Object.entries(items)) {
          if (key.startsWith(DRAFT_STORAGE_PREFIX) && value && typeof value === 'object') {
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
