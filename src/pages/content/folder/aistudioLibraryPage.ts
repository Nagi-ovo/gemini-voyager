/**
 * Folder features on AI Studio's /library page: table rows as drag sources,
 * and the floating drop zone. The manager
 * attaches it on /library and detaches it on the way out.
 */
import type { ToastTone } from '@/core/ui/toast/types';
import type { FolderCommands } from '@/features/folder/commands/folderCommands';

import { aistudioBatchDeleteService } from '../batchDelete/aistudio';
import { mountLibraryDropZone, type LibraryDropZone } from './aistudioLibraryDropZone';
import { bindLibraryRows, watchLibraryTable } from './aistudioLibraryTable';
import { newFolderId } from './aistudioTree';
import type { Folder, FolderData } from './types';

export type LibraryPageHost = {
  t: (key: string) => string;
  canEdit: () => boolean;
  data: () => FolderData;
  commands: FolderCommands;
  /** Changes on every account rebind, including a return to the same account. */
  activation: () => number;
  save: () => Promise<boolean>;
  /** Moves a dropped prompt into `folderId` (null: Uncategorized); false when it carries none. */
  placeDrop: (event: DragEvent, folderId: string | null) => boolean;
  /** Re-syncs which rows hide as archived. */
  applyHideArchived: () => void;
  notify: (message: string, tone: ToastTone) => void;
};

export class LibraryPage {
  private stopTableWatch: (() => void) | null = null;
  private dropZone: LibraryDropZone | null = null;

  constructor(private readonly host: LibraryPageHost) {}

  /** Binds the table (now and as it changes) and mounts the drop zone. Idempotent. */
  attach(): void {
    this.stopTableWatch ??= watchLibraryTable(() => this.bindRows());
    this.bindRows();
    this.mountDropZone();
    this.host.applyHideArchived();
    aistudioBatchDeleteService.attach(this);
  }

  /** Leaving /library stops the body-wide table watch. */
  detach(): void {
    aistudioBatchDeleteService.detach(this);
    this.stopTableWatch?.();
    this.stopTableWatch = null;
  }

  /** Another account's prompts must not stay selected or listed as targets. */
  releaseAccount(): void {
    aistudioBatchDeleteService.reset();
    document.querySelector('.gv-library-folder-list')?.replaceChildren();
  }

  mountDropZone(): void {
    this.dropZone ??= mountLibraryDropZone({
      t: this.host.t,
      canEdit: this.host.canEdit,
      data: this.host.data,
      ensureFolder: () => this.ensureFolder(),
      onDrop: (event, folder) => void this.drop(event, folder),
    });
  }

  destroy(): void {
    aistudioBatchDeleteService.detach(this);
    this.stopTableWatch?.();
    this.stopTableWatch = null;
    this.dropZone?.destroy();
    this.dropZone = null;
  }

  private bindRows(): void {
    bindLibraryRows();
    aistudioBatchDeleteService.refresh();
    // New rows pick up the current hide-archived state.
    this.host.applyHideArchived();
  }

  /** The drop zone lists folders, so an empty library gets its first one. */
  private ensureFolder(): void {
    const data = this.host.data();
    if (data.folders.length > 0) return;
    const name = this.host.t('folder_default_name');
    void this.host.commands.run({
      kind: 'ensureDefaultAIStudioFolder',
      folderId: newFolderId(),
      name,
      at: Date.now(),
    });
    void this.host.save();
  }

  private async drop(event: DragEvent, folder: Folder | null): Promise<void> {
    const activation = this.host.activation();
    if (!this.host.placeDrop(event, folder?.id ?? null)) return;
    const saved = await this.host.save();
    if (!saved || this.host.activation() !== activation) return;
    const { t } = this.host;
    const message = folder
      ? t('conversation_added_to_folder').replace('{folder}', () => folder.name)
      : t('conversation_saved_to_root');
    this.host.notify(message, 'info');
  }
}
