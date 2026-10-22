import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { isSaved } from '@/features/folder/commands/folderCommands';
import { initI18n } from '@/utils/i18n';

import { geminiBatchDeleteService } from '../batchDelete/gemini';
import { FolderFeedback } from './FolderFeedback';
import { FolderNavigation } from './FolderNavigation';
import { FolderSelection } from './FolderSelection';
import { FolderSidebarRuntime } from './FolderSidebarRuntime';
import { FolderSidebarView } from './FolderSidebarView';
import type { FolderStore, FolderStoreChange } from './FolderStore';
import { FolderTransferController } from './FolderTransferController';
import { NativeConversationMenus } from './NativeConversationMenus';
import { NativeSidebarObserver } from './NativeSidebarObserver';
import { FloatingFolderUI } from './floatingFolderUI';
import { createFolderDialogs } from './folderDialogs';
import { folderDebug, folderDebugWarn } from './folderManagerDebug';
import {
  listenForFolderSettingChanges,
  readFloatingModeSetting,
  readFolderEnabled,
  readHideArchived,
} from './folderManagerSettings';
import { openNativeRename } from './gemini/nativeRename';
import { createFolderHeaderMenus } from './headerMenus';
import { HideArchivedNudgeState } from './hideArchivedNudgeState';
import { NativeArchivedRows } from './nativeArchivedRows';
import { createNativePaginationNudge } from './nativeListPagination';
import { getNativeConversationElements } from './nativeSidebarDom';
import { ligatureIcon } from './selectionToolbar';
import { GeminiFolderSession, type GeminiFolderView } from './session/geminiFolderSession';
import type { GeminiFolderLease } from './session/geminiFolderSessions';
import type { Folder } from './types';

/** Sets the session before the manager's fields, which are built on its store. */
abstract class GeminiFolderSessionView {
  constructor(protected readonly session: GeminiFolderSession) {}
}

/**
 * Draws Gemini's folders over Gemini's folder session: the page's leased one,
 * or, without a lease, one of its own that it starts and closes (a tab of its own).
 */
export class FolderManager extends GeminiFolderSessionView {
  private readonly store: FolderStore = this.session.store;
  private readonly commands = this.session.commands;
  private readonly transfer = new FolderTransferController({
    getContext: () => ({
      session: this.store.session,
      activation: this.store.activation,
      data: this.store.data,
    }),
    applyData: async (data) =>
      isSaved(await this.commands.runBulk({ kind: 'commitPreparedData', data })),
    refresh: () => this.refresh(),
    // One transfer notice at a time: a result replaces its "in progress" notice.
    notify: (message, type) => this.feedback.showNotification(message, type, 'transfer'),
  });
  private readonly dialogs = createFolderDialogs();
  private readonly feedback = new FolderFeedback();
  private readonly navigation = new FolderNavigation({
    getContext: () => ({
      container: this.sidebarRuntime.panel,
      sidebar: this.sidebarRuntime.sidebar,
      isDestroyed: this.isDestroyed,
      accountIsolationEnabled: this.store.accountIsolationEnabled,
    }),
    onRouteChange: () => {
      void this.session.reloadForAccountRoute();
    },
    onOpened: (id) => {
      void this.commands.run({
        kind: 'markConversationOpened',
        conversationId: id,
        at: Date.now(),
      });
    },
    onTitleChange: (id, title) => {
      void this.commands.run({
        kind: 'syncNativeTitles',
        entries: [{ conversationId: id, title }],
      });
    },
    onGemDetected: (id, gemId) => {
      void this.commands.run({ kind: 'setConversationGem', hexId: id, gemId });
    },
    onActiveChange: () => this.treeView.refreshSite(),
  });
  private folderEnabled: boolean = true;
  private hideArchivedConversations: boolean = false; // Whether to hide conversations in folders
  // Floating mode (a popup opt-in): never inject into Gemini's sidebar; mount the
  // body-level floating panel (or its FAB) and the native ⋮ menu observer instead.
  private floatingModeEnabled: boolean = false;
  private floatingOpenOnStart: boolean = true;
  private isDestroyed: boolean = false;
  private readonly lifetimeCleanup: Array<() => void> = [];
  private readonly floatingUI = new FloatingFolderUI({
    store: this.store,
    commands: this.commands,
    dialogs: this.dialogs,
    transfer: this.transfer,
    navigation: this.navigation,
    isActive: () => !this.isDestroyed && this.folderEnabled,
    isFloatingMode: () => this.sidebarRuntime.isFloatingMode,
    getSortMode: () => this.treeView.sortMode,
    removeFloatingHost: () => this.selection.removeFloatingHost(),
  });
  private readonly paginationNudge = createNativePaginationNudge();
  private readonly archivedRows = new NativeArchivedRows({
    getSidebar: () => this.sidebarRuntime.sidebar,
    isHidingArchived: () => this.hideArchivedConversations,
    isInFolders: (id, pass) => this.store.isConversationInFolders(id, pass),
    onRowHidden: (row) => this.paginationNudge.rowHidden(row),
  });
  private readonly hideArchivedNudge = new HideArchivedNudgeState({
    isHidingArchived: () => this.hideArchivedConversations,
    getPanel: () => this.sidebarRuntime.panel,
  });
  private readonly headerMenus = createFolderHeaderMenus();
  private readonly nativeSidebarObserver = new NativeSidebarObserver({
    isDestroyed: () => this.isDestroyed,
    enhanceConversation: (row, pass) => {
      this.selection.makeConversationDraggable(row);
      this.archivedRows.apply(row, pass);
    },
    hasStoredConversations: () => this.store.hasStoredConversations(),
    onTitlesChanged: async () => {
      await this.commands.run({ kind: 'syncNativeSidebarTitles' });
    },
  });
  private readonly nativeConversationMenus: NativeConversationMenus = new NativeConversationMenus({
    getContext: () => ({
      sidebar: this.sidebarRuntime.sidebar,
      storageKey: this.store.storageKey,
      accountIsolationEnabled: this.store.accountIsolationEnabled,
      isDestroyed: this.isDestroyed,
    }),
    onMoveToFolder: ({ id, title, url }, trigger) => {
      if (!this.store.canEdit) return;
      this.dialogs.openMove(
        this.store.data.folders,
        (folderId) => {
          this.addConversationToFolderFromNative(folderId, id, title, url);
        },
        trigger,
      );
    },
    onConfirmedDelete: (id) => {
      void this.commands.run({ kind: 'removeConversationEverywhere', conversationId: id });
    },
  });

  private readonly sidebarRuntime: FolderSidebarRuntime = new FolderSidebarRuntime({
    createPanel: () => this.treeView.createPanel(),
    onPanelMount: () => {
      this.treeView.mount();
      this.selection.mount();
      this.batchDelete?.refresh();
      this.navigation.highlightActiveConversation();
      this.navigation.bind();
    },
    onPanelUnmount: (reason) => {
      this.selection.unmount();
      this.batchDelete?.unmount();
      this.treeView.unmount();
      this.navigation.unbind();
      this.feedback.hideTooltip();
      this.headerMenus.close();
      this.transfer.closeImportDialog();
      // A remount rebuilds the panel under the user; the folder instructions
      // editor and the move-to-folder picker are body-level and hold unsaved
      // input, so they stay. Everything else is anchored to a sidebar row that
      // no longer exists and would be stranded at stale coordinates.
      if (reason === 'stop') this.dialogs.closeAll();
      else this.dialogs.closeTransient();
    },
    nativeSidebar: this.nativeSidebarObserver,
    nativeMenus: this.nativeConversationMenus,
    floating: {
      isOpen: () => this.floatingUI.isOpen,
      open: async (openPanel) => {
        this.navigation.bind();
        if (openPanel) await this.floatingUI.openPanel();
        else await this.floatingUI.showFab();
      },
      close: () => this.floatingUI.close(),
    },
  });

  private readonly selection: FolderSelection = new FolderSelection({
    store: this.store,
    commands: this.commands,
    runtime: this.sidebarRuntime,
    navigation: this.navigation,
    feedback: this.feedback,
    toolbar: {
      host: () => this.sidebarRuntime.panel,
      placement: 'floating',
      icon: ligatureIcon,
    },
    nativeSelection: () => this.batchDelete?.selection() ?? null,
    onFinishNativeDrop: () => this.batchDelete?.exit(),
    onFolderSelectionChange: () => this.treeView.refreshSite(),
    getContext: () => ({
      accountIsolationEnabled: this.store.accountIsolationEnabled,
      isDestroyed: this.isDestroyed,
    }),
  });
  private batchDelete: ReturnType<typeof geminiBatchDeleteService.register> | null = null;

  private attachBatchDelete(): void {
    this.batchDelete ??= geminiBatchDeleteService.register({
      runtime: this.sidebarRuntime,
      toolbar: { host: () => this.sidebarRuntime.panel, placement: 'floating', icon: ligatureIcon },
      activation: () => this.store.activation,
      menus: this.nativeConversationMenus,
      feedback: this.feedback,
      getContext: () => ({
        isDestroyed: this.isDestroyed,
        accountIsolationEnabled: this.store.accountIsolationEnabled,
      }),
      onEnter: () => this.selection.reset(),
      onExit: () => this.navigation.highlightActiveConversation(),
    });
  }

  private readonly treeView: FolderSidebarView = new FolderSidebarView({
    store: this.store,
    commands: this.commands,
    runtime: this.sidebarRuntime,
    selection: this.selection,
    navigation: this.navigation,
    feedback: this.feedback,
    dialogs: this.dialogs,
    transfer: this.transfer,
    headerMenus: this.headerMenus,
    getContext: () => ({
      enabled: this.folderEnabled,
      hideArchivedConversations: this.hideArchivedConversations,
      isDestroyed: this.isDestroyed,
    }),
    onRefresh: () => this.refresh(),
    onRenameNative: (conversation) =>
      openNativeRename(conversation, {
        sidebar: this.sidebarRuntime.sidebar,
        archivedRows: this.archivedRows,
        menus: this.nativeConversationMenus,
        commands: this.commands,
      }),
    onSortModeChange: (mode) => this.floatingUI.handle?.update(this.store.data, mode),
  });

  private readonly view: GeminiFolderView = {
    context: () => ({
      sidebar: this.sidebarRuntime.sidebar,
      sortMode: this.treeView.sortMode,
      enabled: this.folderEnabled,
    }),
    onChange: (reason) => this.handleStoreChange(reason),
    onArchive: () => this.hideArchivedNudge.maybeShow(),
    onRecovery: (result) => this.feedback.showRecoveryNotification(result),
    refresh: () => this.refresh(),
  };

  constructor(private readonly lease?: GeminiFolderLease) {
    super(lease?.session ?? new GeminiFolderSession());
    this.session.attach(this.view);
    // Initialize i18n system
    initI18n().catch((e) => {
      folderDebugWarn('Failed to initialize i18n:', e);
    });
  }

  async init(): Promise<void> {
    try {
      // The leased session starts on its own; one of the manager's own starts here.
      await (this.lease ? this.lease.ready : this.session.init());
      if (this.isDestroyed) return;

      await this.loadSettings();
      if (this.isDestroyed) return;

      // Set up storage change listener (always needed to respond to setting changes)
      this.setupStorageListener();

      // If folder feature is disabled, skip initialization
      if (!this.folderEnabled) {
        folderDebug('Folder feature is disabled, skipping initialization');
        return;
      }

      this.attachBatchDelete();

      // Two mounting strategies:
      //  - Floating mode (opt-in): body-level floating panel, skip sidebar.
      //  - Default: inject the folder panel into Gemini's sidebar.
      if (this.floatingModeEnabled) {
        await this.sidebarRuntime.start('floating', this.floatingOpenOnStart);
      } else {
        await this.sidebarRuntime.start('sidebar');
      }

      folderDebug('Initialized successfully');
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        return;
      }
      console.error('[FolderManager] Initialization error:', error);
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.batchDelete?.destroy();
    this.batchDelete = null;
    for (const cleanup of this.lifetimeCleanup.splice(0)) cleanup();
    this.selection.reset();
    this.treeView.unmount();
    this.navigation.destroy();
    this.sidebarRuntime.stop();
    this.paginationNudge.cancel();
    this.session.detach(this.view);
    // A leased session outlives the manager: its holder closes it.
    if (this.lease) this.store.teardownConversationActivityTracking();
    else void this.session.close();
    this.feedback.destroy();
  }

  private async loadSettings(): Promise<void> {
    this.folderEnabled = await readFolderEnabled();
    if (this.folderEnabled) {
      await this.store.initializeConversationActivityTracking();
    }

    // Load the opt-in "always use floating window" mode. Off by default —
    // users flip it from the popup when they want to skip sidebar injection
    // entirely and work with folders in a floating panel.
    const floatingMode = await readFloatingModeSetting();
    if (floatingMode) {
      this.floatingModeEnabled = floatingMode.enabled;
      this.floatingOpenOnStart = floatingMode.openOnStart;
    }

    // Load hide-archived onboarding nudge flag first, so the hide-archived
    // setting can mark it "shown" if the user already has the feature enabled.
    await this.hideArchivedNudge.load();
    this.hideArchivedConversations = await readHideArchived();
    this.hideArchivedNudge.markShownIfFeatureKnown();

    // Load folder anchor preference (which native section to sit above)
    await this.sidebarRuntime.loadAnchor();
    await this.treeView.loadSettings();
  }

  private teardownMountedFolderRuntime(): void {
    this.batchDelete?.destroy();
    this.batchDelete = null;
    this.selection.reset();
    this.treeView.unmount();
    this.navigation.destroy();
    this.store.flushPendingSaveData();
    this.store.teardownConversationActivityTracking();
    this.sidebarRuntime.stop();
    this.paginationNudge.cancel();
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
    this.session.addConversationToFolderFromNative(
      folderId,
      conversationId,
      title,
      url,
      isGem,
      gemId,
      lastTurnAt,
    );
  }

  getFolders(): Folder[] {
    return this.session.getFolders();
  }

  ensureDataLoaded(): Promise<void> {
    return this.session.ensureDataLoaded();
  }

  private handleStoreChange(reason: FolderStoreChange): void {
    if (this.isDestroyed) return;
    this.treeView.updateAvailability();
    this.floatingUI.handle?.setDataReady(this.store.canEdit);
    if (reason === 'account') {
      this.resetForAccountChange();
    } else if (reason === 'data') {
      this.refresh();
      this.floatingUI.handle?.update(this.store.data, this.treeView.sortMode);
    } else if (reason === 'title') {
      this.treeView.render();
    } else if (reason === 'activity') {
      if (this.treeView.viewMode === 'activity') this.refresh();
    } else {
      this.floatingUI.handle?.update(this.store.data, this.treeView.sortMode);
    }
  }

  private resetForAccountChange(): void {
    this.batchDelete?.reset();
    this.nativeSidebarObserver.clearTitleSync();
    this.treeView.clearRenderContext();
    this.navigation.cancel();
    this.dialogs.closeAll();
    this.headerMenus.close();
    this.transfer.closeImportDialog();
    this.selection.reset();
    this.treeView.render();
    this.floatingUI.handle?.reset(this.store.data, this.treeView.sortMode);
    this.applyHideArchivedSetting();
  }

  private refresh(): void {
    if (!this.sidebarRuntime.panel) return;
    this.treeView.render();
    this.applyHideArchivedSetting();
    void this.commands.run({ kind: 'flushNativeTitles' });
  }

  private setupStorageListener(): void {
    const removeListener = listenForFolderSettingChanges({
      isDestroyed: () => this.isDestroyed,
      onAnyChange: (changes, areaName) => this.treeView.applySettings(changes, areaName),
      onFolderEnabled: (enabled) => {
        this.folderEnabled = enabled;
        folderDebug('Folder enabled setting changed:', enabled);
        this.applyFolderEnabledSetting();
      },
      onFloatingOpenOnStart: (openOnStart) => {
        this.floatingOpenOnStart = openOnStart;
        folderDebug('Floating-mode startup panel setting changed:', openOnStart);
      },
      onFloatingMode: (enabled) => this.applyFloatingModeSetting(enabled),
      onHideArchived: (hide) => {
        this.hideArchivedConversations = hide;
        folderDebug('Hide archived setting changed:', hide);
        this.applyHideArchivedSetting();
        this.hideArchivedNudge.onHideArchivedChanged();
      },
      onHideArchivedNudgeShown: (shown) => this.hideArchivedNudge.onShownChanged(shown),
      // Re-anchor the panel without a full reinit. Mirrors `toggleFolderAnchor`
      // for the cross-tab case.
      onAnchor: (value) => this.sidebarRuntime.setAnchor(value),
    });
    this.lifetimeCleanup.push(removeListener);
    // The popup's messages and the legacy sync-mode migration belong to the session.
  }

  private applyFloatingModeSetting(enabled: boolean): void {
    if (enabled === this.floatingModeEnabled) return;
    this.floatingModeEnabled = enabled;
    folderDebug('Floating-mode toggle changed:', enabled);
    // With the folder feature off there is nothing to swap in or out; the
    // setting is remembered for when the user turns folders back on.
    if (!this.folderEnabled) return;
    void this.sidebarRuntime.start(enabled ? 'floating' : 'sidebar', this.floatingOpenOnStart);
  }

  private applyFolderEnabledSetting(): void {
    if (!this.folderEnabled) {
      folderDebug('Folder feature disabled, tearing down mounted runtime');
      this.teardownMountedFolderRuntime();
      return;
    }
    folderDebug('Folder feature enabled');
    this.attachBatchDelete();
    void this.store.initializeConversationActivityTracking();

    if (this.floatingModeEnabled) {
      void this.sidebarRuntime.start('floating', this.floatingOpenOnStart).catch((error) => {
        console.error('[FolderManager] Failed to initialize floating folder UI:', error);
      });
      return;
    }

    if (!this.sidebarRuntime.panel) {
      folderDebug('Folder feature enabled, initializing sidebar UI');
      void this.sidebarRuntime.start('sidebar').catch((error) => {
        console.error('[FolderManager] Failed to initialize folder UI:', error);
      });
    } else {
      this.sidebarRuntime.panel.style.display = '';
    }
  }

  private applyHideArchivedSetting(): void {
    this.archivedRows.applyAll(getNativeConversationElements(this.sidebarRuntime.sidebar));
  }
}
