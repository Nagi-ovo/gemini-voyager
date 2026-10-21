/** What `FolderRepository` reports to its owner, and its debug logging. */
import type { AccountContext } from '@/core/services/AccountIsolationService';

import { GEMINI_FOLDER_CONFIG, type PlatformFolderConfig } from './platformFolderConfig';

const IS_DEBUG = false;

export type FolderStoreChange =
  | 'account'
  | 'data'
  | 'title'
  | 'activity'
  | 'loaded'
  | 'saved'
  | 'availability';

export interface FolderRepositoryHooks {
  onChange: (reason: FolderStoreChange) => void;
  /**
   * A failed load restored backup data, kept in-memory data, or reset to empty;
   * or storage could not be read before any load, which leaves editing disabled.
   */
  onRecovery: (result: 'recovered' | 'kept' | 'lost' | 'unreadable') => void;
  /**
   * Reload the active bucket: another context wrote it, or a failed read is retried.
   * Resolved at call time by the owner.
   */
  onExternalChange: () => void;
  /** The active account was released; runs before the `account` change. */
  onAccountReleased: () => void;
  /** Whether the folder feature is enabled, which gates the isolation-switch repaint. */
  isEnabled: () => boolean;
  /** The final write of a save chain failed while its session is current. */
  onSaveFailed?: () => void;
  /** A write settled, either way, for the current session outside a draft replacement. */
  onPersistSettled?: () => void;
  /** A session was bound for `context`, which is `null` while isolation is off. */
  onAccountBound?: (context: AccountContext | null) => void;
}

function isDebugEnabled(flag: string): boolean {
  try {
    // Enable by setting localStorage.<debugFlag> = '1'
    return IS_DEBUG || localStorage.getItem(flag) === '1';
  } catch {
    // Ignore - localStorage may not be available in some contexts (e.g. incognito mode)
    return IS_DEBUG;
  }
}

export function createDebugLog(config: PlatformFolderConfig, write: 'log' | 'warn') {
  return (...args: unknown[]): void => {
    if (isDebugEnabled(config.debugFlag)) {
      console[write](config.logPrefix, ...args);
    }
  };
}

export const folderDebug = createDebugLog(GEMINI_FOLDER_CONFIG, 'log');
export const folderDebugWarn = createDebugLog(GEMINI_FOLDER_CONFIG, 'warn');
