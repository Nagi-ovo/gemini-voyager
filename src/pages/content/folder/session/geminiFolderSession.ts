/**
 * Gemini's folder data for one page: the folder store on Gemini's bucket (its
 * repository, account scope and Gemini edits), the commands that edit it, the
 * popup's cloud-sync and AI-structure answers, and the legacy sync-mode
 * migration. The content script's start point holds it for the page's
 * lifetime (`geminiFolderSessions.ts`), and Folder-as-Project files new chats
 * through it; the folder manager attaches as its view and draws the folders.
 *
 * Every read and edit from outside the folder UI goes through this object
 * (`commands`, `canEdit`, `data`, the Folder-as-Project port and the popup's
 * answers), so a check that the bound account is still the page's can sit here
 * once.
 */
import type { AccountScope } from '@/core/services/AccountIsolationService';
import { createToaster } from '@/core/ui/toast/toaster';
import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import type { ConversationSortMode } from '@/features/folder/model/folderData';

import { LEVEL_MS } from '../FolderFeedback';
import { FolderStore, type FolderStoreChange } from '../FolderStore';
import { migrateLegacySyncMode } from '../folderManagerSettings';
import { getFolderRecoveryNotice } from '../folderRecoveryNotice';
import { listenForFolderRuntimeMessages } from '../folderRuntimeMessages';
import { createLegacyFolderCommands } from '../legacyFolderCommands';
import type { Folder, FolderData } from '../types';

/** What the folders' view, while attached, tells the session and is told by it. */
export interface GeminiFolderView {
  /** Whether the folders are on, Gemini's sidebar, and the tree's conversation order. */
  context(): { enabled: boolean; sidebar: HTMLElement | null; sortMode: ConversationSortMode };
  onChange(reason: FolderStoreChange): void;
  /** A chat was filed from outside a folder for the first time. */
  onArchive(): void;
  onRecovery(result: 'recovered' | 'lost' | 'unreadable'): void;
  /** The folders reloaded after a cloud download: show them. */
  refresh(): void;
}

const DETACHED = { enabled: false, sidebar: null, sortMode: 'manual' } as const;

export class GeminiFolderSession {
  private view: GeminiFolderView | null = null;
  private closed = false;
  private stopListening: (() => void) | null = null;
  /** Shows notices while no view is attached; a view shows its own. */
  private toaster: ReturnType<typeof createToaster> | null = null;

  readonly store = new FolderStore({
    getContext: () => this.view?.context() ?? DETACHED,
    onChange: (reason) => this.view?.onChange(reason),
    onArchive: () => this.view?.onArchive(),
    onRecovery: (result) => this.recovered(result),
  });
  readonly commands: FolderCommands = createLegacyFolderCommands(this.store);

  get data(): FolderData {
    return this.store.data;
  }
  get canEdit(): boolean {
    return this.store.canEdit;
  }
  get accountScope(): AccountScope | null {
    return this.store.accountScope;
  }

  /** Binds the account and loads the folders, then answers the popup. */
  async init(): Promise<void> {
    await this.store.init();
    if (this.closed) return;
    this.listen();
    void migrateLegacySyncMode();
  }

  /** The view shows the folders from now on; the store reads its context. */
  attach(view: GeminiFolderView): void {
    if (!this.closed) this.view = view;
  }

  detach(view: GeminiFolderView): void {
    if (this.view === view) this.view = null;
  }

  /** Answers the popup's cloud sync and AI-structure requests; once. */
  listen(): void {
    if (this.closed || this.stopListening) return;
    this.stopListening = listenForFolderRuntimeMessages({
      store: this,
      refresh: () => this.view?.refresh(),
      getSidebarContext: () => ({
        sidebar: this.view?.context().sidebar ?? null,
        accountIsolationEnabled: this.store.accountIsolationEnabled,
        isDestroyed: this.closed,
      }),
    });
  }

  loadData(): Promise<void> {
    return this.store.loadData();
  }

  /** Follows the page's `/u/<n>/` route to that account's folders. */
  reloadForAccountRoute(): Promise<void> {
    return this.store.reloadScopedDataOnAccountRouteChange();
  }

  // Folder-as-Project's port: the folders to pick from, and filing the new chat.

  ensureDataLoaded(): Promise<void> {
    return this.store.ensureDataLoaded();
  }

  getFolders(): Folder[] {
    return this.data.folders;
  }

  addConversationToFolderFromNative(
    folderId: string,
    conversationId: string,
    title: string,
    url: string,
    isGem?: boolean,
    gemId?: string,
    lastTurnAt?: number,
  ): void {
    void this.commands.run({
      kind: 'addConversations',
      target: folderId,
      via: 'native-menu',
      seeds: [{ conversationId, title, url, isGem, gemId, lastTurnAt }],
    });
  }

  /** Stops everything; resolves once the store's accepted writes drained. */
  close(): Promise<void> {
    this.closed = true;
    this.view = null;
    this.stopListening?.();
    this.stopListening = null;
    this.toaster?.destroy();
    this.toaster = null;
    return this.store.destroy();
  }

  private recovered(result: 'recovered' | 'lost' | 'unreadable'): void {
    if (this.view) {
      this.view.onRecovery(result);
      return;
    }
    const { message, tone } = getFolderRecoveryNotice(result);
    this.toaster ??= createToaster();
    this.toaster.show({ message, tone, durationMs: LEVEL_MS[tone] });
  }
}
