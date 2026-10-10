import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import { folderDebug } from './folderManagerDebug';
import {
  mountHideArchivedNudge,
  shouldShowHideArchivedNudge,
  unmountHideArchivedNudge,
} from './hideArchivedNudge';

type HideArchivedNudgeOptions = {
  /** The hide-archived setting, owned by the folder manager. */
  isHidingArchived(): boolean;
  getPanel(): HTMLElement | null;
};

function persistSync(items: Record<string, boolean>, failure: string): void {
  browser.storage.sync.set(items).catch((error) => {
    console.error(failure, error);
  });
}

/** The one-time onboarding nudge offering hide-archived after the first archive. */
export class HideArchivedNudgeState {
  private shown = false;

  constructor(private readonly options: HideArchivedNudgeOptions) {}

  async load(): Promise<void> {
    try {
      const result = await browser.storage.sync.get({
        [StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN]: false,
      });
      this.shown = !!result[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN];
      folderDebug('Loaded hide-archived nudge shown flag:', this.shown);
    } catch (error) {
      console.error('[FolderManager] Failed to load hide-archived nudge flag:', error);
      this.shown = false;
    }
  }

  /**
   * If the user has (or ever had) hide-archived turned on, they already know
   * the feature exists. Mark the nudge as shown so we never surface it again
   * even if they later turn the feature off.
   */
  markShownIfFeatureKnown(): void {
    if (!this.options.isHidingArchived() || this.shown) return;
    this.shown = true;
    persistSync(
      { [StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN]: true },
      '[FolderManager] Failed to persist nudge-shown flag after observing hide-archived=true:',
    );
  }

  /** The hide-archived setting changed in storage (e.g. from the popup). */
  onHideArchivedChanged(): void {
    // If user enabled hide-archived from the popup while the nudge is still
    // visible, remove it — the nudge's purpose is already served.
    const panel = this.options.getPanel();
    if (this.options.isHidingArchived() && panel) unmountHideArchivedNudge(panel);
    // Persist that the user knows this feature, so turning it off later
    // won't cause the nudge to reappear on the next archive.
    this.markShownIfFeatureKnown();
  }

  /** The shown flag changed in storage, e.g. from another tab. */
  onShownChanged(shown: boolean): void {
    this.shown = shown;
    const panel = this.options.getPanel();
    if (shown && panel) unmountHideArchivedNudge(panel);
  }

  maybeShow(): void {
    const nudgeShown = this.shown;
    const hideArchivedAlreadyOn = this.options.isHidingArchived();
    if (!shouldShowHideArchivedNudge({ nudgeShown, hideArchivedAlreadyOn })) return;
    const panel = this.options.getPanel();
    if (!panel || !document.body.contains(panel)) return;

    mountHideArchivedNudge({
      container: panel,
      onEnable: () => {
        this.shown = true;
        persistSync(
          {
            [StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS]: true,
            [StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN]: true,
          },
          '[FolderManager] Failed to enable hide-archived from nudge:',
        );
      },
      onDismiss: () => {
        this.shown = true;
        persistSync(
          { [StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN]: true },
          '[FolderManager] Failed to persist nudge-dismissed flag:',
        );
      },
    });
  }
}
