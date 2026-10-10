/**
 * Gemini's sidebar folder panel (`FolderSidebarView`), composed from the
 * production owners the way the content script composes them, over in-memory
 * storage. Mirrors `src/pages/content/folder/__tests__/folderViewHarness.ts`
 * without vitest.
 */
import type { FolderData } from '@/core/types/folder';
import { FolderFeedback } from '@/pages/content/folder/FolderFeedback';
import { FolderNavigation } from '@/pages/content/folder/FolderNavigation';
import { FolderSelection } from '@/pages/content/folder/FolderSelection';
import { FolderSidebarRuntime } from '@/pages/content/folder/FolderSidebarRuntime';
import { FolderSidebarView } from '@/pages/content/folder/FolderSidebarView';
import { FolderStore, type FolderStoreChange } from '@/pages/content/folder/FolderStore';
import { FolderTransferController } from '@/pages/content/folder/FolderTransferController';
import { NativeConversationMenus } from '@/pages/content/folder/NativeConversationMenus';
import { NativeSidebarObserver } from '@/pages/content/folder/NativeSidebarObserver';
import { createFolderDialogs } from '@/pages/content/folder/folderDialogs';
import { createFolderHeaderMenus } from '@/pages/content/folder/headerMenus';
import type { IFolderStorageAdapter } from '@/pages/content/folder/storage/FolderStorageAdapter';

/** The parts of Gemini's sidebar the folder runtime looks for. */
function mountGeminiSidebar(): { host: HTMLElement; sidebar: HTMLElement } {
  const host = document.createElement('chat-app');
  host.className = 'side-nav-open';
  host.style.cssText = 'display:block;width:308px;height:100vh;';
  const sidebar = document.createElement('div');
  sidebar.setAttribute('data-test-id', 'overflow-container');
  sidebar.style.cssText = 'width:308px;height:100vh;overflow:auto;';
  const sectionParent = document.createElement('div');
  const notebooks = document.createElement('expandable-section');
  notebooks.setAttribute('data-test-id', 'notebooks-expandable-section');
  const recents = document.createElement('expandable-section');
  recents.setAttribute('data-test-id', 'chats-expandable-section');
  sectionParent.append(notebooks, recents);
  sidebar.appendChild(sectionParent);
  host.appendChild(sidebar);
  document.body.appendChild(host);
  return { host, sidebar };
}

export interface GeminiSidebar {
  readonly store: FolderStore;
  readonly treeView: FolderSidebarView;
  readonly runtime: FolderSidebarRuntime;
  /** Mounts the panel into the sidebar: the timed part of a page load. */
  start(): Promise<void>;
  /** What the content script runs on a `data` change. */
  refresh(): void;
  destroy(): void;
}

/** Builds and loads everything up to, but not including, mounting the panel. */
export async function createGeminiSidebar(data: FolderData): Promise<GeminiSidebar> {
  let saved = structuredClone(data);
  let destroyed = false;
  const context = { enabled: true, hideArchivedConversations: false, isDestroyed: false };
  const adapter: IFolderStorageAdapter = {
    init: async () => {},
    loadData: async () => structuredClone(saved),
    saveData: async (_key, value) => {
      saved = structuredClone(value);
      return true;
    },
    removeData: async () => {
      saved = { folders: [], folderContents: {} };
    },
    getBackendName: () => 'bench-memory',
  };
  // Assigned below: the owners reference each other.
  let treeView: FolderSidebarView;
  let runtime: FolderSidebarRuntime;
  let selection: FolderSelection;
  const refresh = () => {
    if (!runtime.panel) return;
    treeView.render();
    store.flushTitleUpdates();
  };
  const onChange = (reason: FolderStoreChange) => {
    if (destroyed) return;
    treeView.updateAvailability();
    if (reason === 'data') refresh();
    else if (reason === 'title') treeView.render();
  };
  const store = new FolderStore(
    {
      getContext: () => ({
        sidebar: runtime.sidebar,
        sortMode: treeView.sortMode,
        enabled: context.enabled,
      }),
      onChange,
      onArchive: () => {},
      onRecovery: () => {},
    },
    adapter,
  );
  const dialogs = createFolderDialogs();
  const feedback = new FolderFeedback();
  const headerMenus = createFolderHeaderMenus();
  const navigation = new FolderNavigation({
    getContext: () => ({
      container: runtime.panel,
      sidebar: runtime.sidebar,
      isDestroyed: destroyed,
      accountIsolationEnabled: store.accountIsolationEnabled,
    }),
    onRouteChange: () => {},
    onOpened: (id) => store.markConversationAsRecentlyOpened(id),
    onTitleChange: (id, title) => store.updateConversationTitle(id, title),
    onGemDetected: (id, gemId) => store.updateConversationGem(id, gemId),
    onActiveChange: () => treeView.refreshSite(),
  });
  const nativeMenus = new NativeConversationMenus({
    getContext: () => ({
      sidebar: runtime.sidebar,
      storageKey: store.storageKey,
      accountIsolationEnabled: store.accountIsolationEnabled,
      isDestroyed: destroyed,
    }),
    onMoveToFolder: () => {},
    onConfirmedDelete: (id) => store.removeConversationFromAllFolders(id),
  });
  const nativeSidebar = new NativeSidebarObserver({
    isDestroyed: () => destroyed,
    enhanceConversation: (row) => selection.makeConversationDraggable(row),
    hasStoredConversations: () => store.hasStoredConversations(),
    onTitlesChanged: () => store.syncConversationTitlesFromNative(),
  });
  const floating = { isOpen: () => false, open: async () => {}, close: () => {} };
  runtime = new FolderSidebarRuntime({
    createPanel: () => treeView.createPanel(),
    onPanelMount: () => {
      treeView.mount();
      selection.mount();
      navigation.highlightActiveConversation();
      navigation.bind();
    },
    onPanelUnmount: () => {
      treeView.unmount();
      selection.unmount();
      navigation.unbind();
      feedback.hideTooltip();
      dialogs.closeAll();
      headerMenus.close();
      transfer.closeImportDialog();
    },
    nativeSidebar,
    nativeMenus,
    floating,
  });
  selection = new FolderSelection({
    store,
    runtime,
    navigation,
    feedback,
    nativeMenus,
    onFolderSelectionChange: () => treeView.refreshSite(),
    getContext: () => ({
      sortMode: treeView.sortMode,
      accountIsolationEnabled: store.accountIsolationEnabled,
      isDestroyed: destroyed,
    }),
  });
  const transfer = new FolderTransferController({
    getContext: () => ({ session: store.session, activation: store.activation, data: store.data }),
    applyData: async (next) => {
      if (!store.canEdit) return false;
      store.data = next;
      return store.saveData();
    },
    refresh,
    notify: (message, type) => feedback.showNotification(message, type),
  });
  treeView = new FolderSidebarView({
    store,
    runtime,
    selection,
    navigation,
    feedback,
    dialogs,
    transfer,
    headerMenus,
    getContext: () => context,
    onRefresh: refresh,
    onRenameNative: async () => true,
    onSortModeChange: () => {},
  });
  await store.init();
  await treeView.loadSettings();
  const { host } = mountGeminiSidebar();

  return {
    store,
    treeView,
    runtime,
    start: () => runtime.start('sidebar'),
    refresh,
    destroy: () => {
      if (destroyed) return;
      destroyed = context.isDestroyed = true;
      runtime.stop();
      selection.reset();
      navigation.destroy();
      dialogs.closeAll();
      transfer.closeImportDialog();
      headerMenus.close();
      feedback.destroy();
      store.destroy();
      host.remove();
    },
  };
}
