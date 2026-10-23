import { readConversationStars } from '@/features/folder/model/conversationStars';
import {
  cloneFolderData,
  moveFolder,
  ownBucket,
  removeFolder,
  reorderConversations,
  setBucket,
} from '@/features/folder/model/folderData';
import { canCreateFolderUnder } from '@/features/folder/model/folderDepth';
import { placeConversations } from '@/features/folder/model/placeConversations';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';

import { type FolderStoreChange, folderDebug } from './FolderRepository';
import { FolderStoreState } from './FolderStoreState';
import { conversationKeys } from './folderConversationIdentity';
import {
  type ConversationActivityEntry,
  GeminiConversationActivity,
  raiseConversationActivity,
} from './gemini/activity';
import {
  type DroppedConversation,
  droppedConversation,
  droppedTitle,
  markOpened,
  openedConversation,
  removeEverywhere,
  setStarEverywhere,
  withConversationStars,
} from './gemini/conversationRecords';
import { tagGemConversations } from './gemini/gemTags';
import { GeminiNativeTitles } from './gemini/nativeTitles';
import { reloadForAccountRoute } from './session/geminiAccountRoute';
import type { ConversationReference, DragData, Folder } from './types';

export type { FolderStoreChange };
export type { FolderStoreOptions } from './FolderStoreState';

/**
 * Owns Gemini's folder edits over `FolderStoreState`; the Gemini-only parts
 * live in `gemini/` (activity, Gem tags, native titles, record edits) and
 * `session/geminiAccountRoute.ts`.
 */
export class FolderStore extends FolderStoreState {
  private readonly titles = new GeminiNativeTitles({
    data: () => this.data,
    canEdit: () => this.canEdit,
    sidebar: () => this.options.getContext().sidebar,
    binding: () => [this.repository.session, this.repository.activation],
    saveData: () => this.saveData(),
    onTitlesChanged: () => this.options.onChange('title'),
  });
  private readonly activity = new GeminiConversationActivity({
    data: () => this.data,
    isActive: () => !this.isDestroyed && this.options.getContext().enabled,
    isConversationInFolders: (id) => this.isConversationInFolders(id),
    apply: (entries) => this.applyConversationActivity(entries),
  });

  protected accountReleased(): void {
    this.titles.clear();
  }

  /** Resolves once the repository's accepted writes drained. */
  destroy(): Promise<void> {
    const drained = this.repository.destroy();
    this.teardownConversationActivityTracking();
    return drained;
  }

  createFolder(name: string, parentId: string | null = null): Folder | null {
    if (!this.canEdit) return null;
    if (!canCreateFolderUnder(this.data, parentId)) return null;
    const maxSortIndex = this.data.folders
      .filter((folder) => folder.parentId === parentId)
      .reduce((max, folder) => Math.max(max, folder.sortIndex ?? -1), -1);
    const folder: Folder = {
      id: this.generateId(),
      name,
      parentId,
      isExpanded: true,
      sortIndex: maxSortIndex + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.data.folders.push(folder);
    setBucket(this.data.folderContents, folder.id, []);
    void this.saveData();
    this.options.onChange('data');
    return folder;
  }

  renameFolder(folderId: string, name: string): void {
    if (!this.canEdit) return;
    const folder = this.data.folders.find((item) => item.id === folderId);
    if (!folder || folder.name === name) return;
    folder.name = name;
    folder.updatedAt = Date.now();
    void this.saveData();
    this.options.onChange('data');
  }

  removeFolder(folderId: string): void {
    if (!this.canEdit) return;
    this.data = removeFolder(this.data, folderId);
    void this.saveData();
    this.options.onChange('data');
  }

  removeConversationsFromFolder(folderId: string, ids: ReadonlySet<string>): void {
    if (!this.canEdit) return;
    const conversations = ownBucket(this.data.folderContents, folderId);
    if (!conversations) return;
    setBucket(
      this.data.folderContents,
      folderId,
      conversations.filter((item) => !ids.has(item.conversationId)),
    );
    void this.saveData();
    this.options.onChange('data');
  }

  async setFolderInstructions(
    folderId: string,
    instructions: string | undefined,
  ): Promise<boolean> {
    if (!this.canEdit) return false;
    const data = cloneFolderData(this.data);
    const folder = data.folders.find((item) => item.id === folderId);
    if (!folder) return false;
    folder.instructions = instructions;
    folder.updatedAt = Date.now();
    return this.replaceData(data);
  }

  bufferTitleUpdate(conversation: ConversationReference, title: string): void {
    this.titles.buffer(conversation, title);
  }

  flushTitleUpdates(): void {
    this.titles.flush();
  }

  toggleFolder(folderId: string): void {
    if (!this.canEdit) return;
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    folder.isExpanded = !folder.isExpanded;
    folder.updatedAt = Date.now();
    // Pure UI state — debounce the full persistence pipeline instead of
    // running stringify/verify/mirror/backup on every expand/collapse click.
    this.scheduleSaveData();
    this.options.onChange('data');
  }

  togglePinFolder(folderId: string): void {
    if (!this.canEdit) return;
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    folder.pinned = !folder.pinned;
    folder.updatedAt = Date.now();
    this.saveData();
    this.options.onChange('data');
  }

  reorderFolder(folderId: string, targetParentId: string, insertIndex: number): void {
    if (!this.canEdit) return;
    const targetParent = targetParentId === '__root__' ? null : targetParentId;
    const nextData = moveFolder(this.data, folderId, targetParent, Date.now(), insertIndex);
    if (nextData === this.data) return;
    this.data = nextData;
    void this.saveData();
    this.options.onChange('data');
  }

  ensureConversationsInFolder(folderId: string, dragData: DragData): void {
    if (!this.canEdit) return;
    const items = dragData.conversations?.length
      ? dragData.conversations
      : dragData.conversationId
        ? [{ ...dragData, conversationId: dragData.conversationId }]
        : [];
    const records = withConversationStars(
      this.data,
      items.map((item) => this.droppedRecord(item)),
    );
    this.data = placeConversations(this.data, records, {
      target: folderId,
      placement: 'append',
      keysOf: conversationKeys,
    }).data;
  }

  private droppedRecord(item: DroppedConversation): ConversationReference {
    return droppedConversation(
      item,
      this.getKnownConversationLastTurnAt(item.conversationId, item.url),
    );
  }

  reorderOrMoveConversations(
    conversationIds: string[],
    sourceParentId: string,
    targetParentId: string,
    insertIndex: number,
  ): void {
    if (!this.canEdit) return;
    const nextData = reorderConversations(
      this.data,
      conversationIds,
      sourceParentId,
      targetParentId,
      insertIndex,
      this.options.getContext().sortMode,
      // The groups the tree drew: a row shows starred when any copy of its chat is.
      readConversationStars(this.data, FOLDER_SITE_POLICIES.gemini),
    );
    if (nextData === this.data) return;
    this.data = nextData;
    void this.saveData();
    this.options.onChange('data');
  }

  addConversationToFolder(
    folderId: string,
    dragData: DragData & { sourceFolderId?: string },
  ): void {
    if (!this.canEdit) return;
    const conversationId = dragData.conversationId;
    if (!conversationId) return;
    const sourceFolderId =
      dragData.sourceFolderId !== folderId ? dragData.sourceFolderId : undefined;
    const { data, added } = placeConversations(
      this.data,
      withConversationStars(this.data, [this.droppedRecord({ ...dragData, conversationId })]),
      {
        target: folderId,
        placement: 'append',
        keysOf: conversationKeys,
        removeFrom: sourceFolderId ? { bucket: sourceFolderId } : undefined,
      },
    );
    if (added.length === 0) {
      folderDebug('Conversation already in folder:', conversationId);
      return;
    }

    this.data = data;
    this.saveData();
    this.options.onChange('data');
    // Folder→folder move is not a "first archive"; skip the nudge.
    if (!sourceFolderId) this.options.onArchive();
  }

  addConversationsToFolder(
    folderId: string,
    conversations: ConversationReference[],
    sourceFolderId?: string,
  ): void {
    if (!this.canEdit) return;
    folderDebug('Adding multiple conversations to folder:', {
      folderId,
      count: conversations.length,
      sourceFolderId,
    });

    const records = withConversationStars(
      this.data,
      conversations.map((conv) => ({
        ...conv,
        title: sourceFolderId ? conv.title : droppedTitle(conv.conversationId, conv.title),
        addedAt: Date.now(),
        lastTurnAt:
          conv.lastTurnAt ?? this.getKnownConversationLastTurnAt(conv.conversationId, conv.url),
      })),
    );
    const { data, added } = placeConversations(this.data, records, {
      target: folderId,
      placement: 'append',
      keysOf: conversationKeys,
      // Ids the target already held stay in the source.
      removeFrom:
        sourceFolderId && sourceFolderId !== folderId ? { bucket: sourceFolderId } : undefined,
    });
    this.data = data;
    folderDebug(`Added ${added.length} conversations to ${folderId}`);

    this.saveData();
    this.options.onChange('data');
    // A batch from another folder is a folder→folder move, not a "first archive".
    if (added.length > 0 && !sourceFolderId) {
      this.options.onArchive();
    }
  }

  addFolderToFolder(targetFolderId: string, dragData: DragData): void {
    if (!this.canEdit) return;
    const draggedFolderId = dragData.folderId;
    if (!draggedFolderId) return;

    folderDebug('Moving folder to folder:', {
      draggedFolderId,
      targetFolderId,
    });

    const nextData = moveFolder(this.data, draggedFolderId, targetFolderId, Date.now());
    if (nextData === this.data) {
      folderDebug('Folder move rejected');
      return;
    }
    this.data = nextData;
    void this.saveData();
    this.options.onChange('data');
  }

  moveFolderToRoot(dragData: DragData): void {
    if (!this.canEdit) return;
    const draggedFolderId = dragData.folderId;
    if (!draggedFolderId) return;

    folderDebug('Moving folder to root level:', draggedFolderId);

    const nextData = moveFolder(this.data, draggedFolderId, null, Date.now());
    if (nextData === this.data) {
      folderDebug('Folder move to root rejected');
      return;
    }
    this.data = nextData;
    void this.saveData();
    this.options.onChange('data');
  }

  toggleConversationStar(folderId: string, conversationId: string): void {
    if (!this.canEdit) return;
    const conversations = this.data.folderContents[folderId];
    if (!conversations) return;

    const conv = conversations.find((c) => c.conversationId === conversationId);
    if (!conv) return;

    conv.starred = !conv.starred;
    this.saveData();
    // Refresh the folder UI to update the star icon and re-sort
    this.options.onChange('data');

    folderDebug('Toggled star for conversation:', conversationId, 'starred:', conv.starred);
  }

  setConversationStarAcrossFolders(conversationId: string, starred: boolean): void {
    if (!this.canEdit) return;
    if (!setStarEverywhere(this.data.folderContents, conversationId, starred)) return;
    this.saveData();
    this.options.onChange('data');
  }

  removeConversationFromFolder(folderId: string, conversationId: string): void {
    if (!this.canEdit) return;
    const conversations = ownBucket(this.data.folderContents, folderId);
    if (!conversations) return;
    setBucket(
      this.data.folderContents,
      folderId,
      conversations.filter((c) => c.conversationId !== conversationId),
    );

    this.saveData();
    this.options.onChange('data');
  }

  changeFolderColor(folderId: string, colorId: string): void {
    if (!this.canEdit) return;
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    folder.color = colorId;
    folder.updatedAt = Date.now();

    this.saveData();
    this.options.onChange('data');
  }

  moveConversationToFolder(
    sourceFolderId: string,
    targetFolderId: string,
    conv: ConversationReference,
  ): void {
    if (!this.canEdit) return;
    // The record goes after the target's last row, like a drop, and leaves the
    // source even when the target already holds it.
    this.data = placeConversations(this.data, [{ ...conv, addedAt: Date.now() }], {
      target: targetFolderId,
      placement: 'append',
      keysOf: conversationKeys,
      removeFrom: { bucket: sourceFolderId },
      removeWhenPresent: true,
    }).data;
    this.saveData();
    this.options.onChange('data');
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
    if (!this.canEdit) return;
    // Guard: ensure the target folder still exists (it may have been deleted
    // from the sidebar or another tab between selection and message send)
    const folderExists = this.data.folders.some((f) => f.id === folderId);
    if (!folderExists) return;

    const record = openedConversation(
      { conversationId, title, url, isGem, gemId },
      lastTurnAt ?? this.getKnownConversationLastTurnAt(conversationId, url),
    );
    const { data, added } = placeConversations(
      this.data,
      withConversationStars(this.data, [record]),
      {
        target: folderId,
        placement: 'top',
        keysOf: conversationKeys,
      },
    );
    this.data = data;

    this.saveData();
    this.options.onChange('data');
    if (added.length > 0) {
      this.options.onArchive();
    }
  }

  syncConversationTitlesFromNative(): Promise<void> {
    return this.titles.syncSidebar();
  }

  updateConversationTitle(conversationId: string, newTitle: string): void {
    this.titles.update(conversationId, newTitle);
  }

  restoreNativeTitleSync(conversationId: string, nativeTitle: string | null): Promise<void> {
    return this.titles.restore(conversationId, nativeTitle);
  }

  /** The conversation was deleted in Gemini: it leaves every folder. */
  removeConversationFromAllFolders(conversationId: string): void {
    if (!this.canEdit) return;
    if (!removeEverywhere(this.data.folderContents, conversationId)) return;
    this.saveData();
    // Re-render folders to reflect the removal
    this.options.onChange('title');
  }

  initializeConversationActivityTracking(): Promise<void> {
    return this.activity.start();
  }

  teardownConversationActivityTracking(): void {
    this.activity.stop();
  }

  getKnownConversationLastTurnAt(conversationId: string, url?: string): number | undefined {
    return this.activity.knownLastTurnAt(conversationId, url);
  }

  backfillKnownConversationActivity(): void {
    this.activity.backfill();
  }

  applyHistoryActivityTimestamps(cids: string[]): void {
    this.activity.applyHistory(cids);
  }

  markConversationLastTurnAt(conversationId: string, timestamp: number): void {
    this.applyConversationActivity([{ conversationId, lastTurnAt: timestamp }]);
  }

  /** Raises `lastTurnAt` on every record each entry's id or saved route names, as the op does. */
  private applyConversationActivity(entries: ConversationActivityEntry[]): void {
    if (!this.canEdit) return;
    const data = raiseConversationActivity(this.data, entries);
    if (!data) return;
    this.data = data;
    this.scheduleSaveData();
    this.options.onChange('activity');
  }

  async reloadFoldersFromStorage(): Promise<void> {
    try {
      await this.loadData();
      this.backfillKnownConversationActivity();
      this.options.onChange('title');
      folderDebug('Folders reloaded from storage');
    } catch (error) {
      console.error('[FolderStore] Failed to reload folders:', error);
    }
  }

  private generateId(): string {
    return `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  markConversationAsRecentlyOpened(conversationId: string): void {
    if (!this.canEdit) return;
    if (!markOpened(this.data.folderContents, conversationId, Date.now())) return;
    // Keep the visible row stable during navigation; the saved time affects
    // the next natural render. Debounced: rapid navigation shouldn't run the
    // full save pipeline per click.
    this.scheduleSaveData();
  }

  updateConversationGem(hexId: string, gemId: string): void {
    if (!this.canEdit) return;
    if (!tagGemConversations(this.data.folderContents, hexId, gemId)) return;
    this.saveData();
    // Re-render folders to show correct icon
    this.options.onChange('title');
  }

  /** Binds the page's account again, whatever the route says, and loads its folders. */
  async rebindAccount(): Promise<void> {
    await this.refreshAccountScope();
    if (this.isDestroyed || !this.session) return;
    await this.loadData();
    this.backfillKnownConversationActivity();
    this.options.onChange('title');
  }

  async reloadScopedDataOnAccountRouteChange(): Promise<void> {
    if (!(await reloadForAccountRoute(this))) return;
    this.backfillKnownConversationActivity();
    this.options.onChange('title');
    folderDebug('Switched account-scoped folder storage:', this.storageKey);
  }
}
