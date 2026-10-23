/**
 * Mounts the sidebar section with its multi-select and its drops: what the
 * section's effect starts, and what its disposer takes down again.
 */
import type { ConversationReference } from '@/core/types/folder';
import type { ToastTone } from '@/core/ui/toast/types';
import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import { FolderSelection } from '@/pages/content/folder/FolderSelection';
import type { SiteFolderStore } from '@/pages/content/folder/SiteFolderStore';
import {
  DROP_FOLDER_ATTR,
  DROP_TARGET_CLASS,
} from '@/pages/content/folder/floatingTree/dropTargets';
import type { TreeActions } from '@/pages/content/folder/floatingTree/shared';
import type { FolderHeaderActionsOptions } from '@/pages/content/folder/folderHeader/folderHeaderActions';
import type { SidebarActivityListOptions } from '@/pages/content/folder/sidebarActivityList';
import {
  type SidebarDropContext,
  acceptsSidebarDrag,
  bindRootDropZone,
  dropOnSidebar,
} from '@/pages/content/folder/sidebarDrops';

import { SiteFolderSection } from './folderSection';
import { sectionToolbarIcon } from './sectionHeader';
import type { SiteFolderSectionPrefs } from './sectionPrefs';
import type { SectionSite } from './types';

export interface SiteSectionMountOptions {
  readonly site: SectionSite;
  readonly store: SiteFolderStore;
  readonly commands: FolderCommands;
  readonly rootBucketId: string;
  /** What both the panel and the section do on a tree gesture. */
  readonly treeActions: TreeActions;
  /** Opens the site's own rename for a filed conversation. */
  readonly renameNative: (conversation: ConversationReference) => void;
  /** The Activity view, where the page records send times; `null` hides it. */
  readonly activity: Pick<SidebarActivityListOptions, 'navigation' | 'dialogs'> | null;
  readonly transfer: FolderHeaderActionsOptions['transfer'];
  readonly cloud: FolderHeaderActionsOptions['cloud'];
  readonly prefs: SiteFolderSectionPrefs;
  readonly savePrefs: (prefs: SiteFolderSectionPrefs) => void;
  readonly notify: (message: string, tone: ToastTone) => void;
  readonly isDisposed: () => boolean;
}

export interface MountedSiteSection {
  readonly section: SiteFolderSection;
  readonly selection: FolderSelection;
  dispose(): void;
}

export function mountSiteSection(options: SiteSectionMountOptions): MountedSiteSection {
  const { store, commands, rootBucketId } = options;
  const feedback = {
    showNotification: (message: string, tone: ToastTone = 'info') => options.notify(message, tone),
  };
  const selection: FolderSelection = new FolderSelection({
    store,
    commands,
    runtime: {
      get panel(): HTMLElement {
        return section.element;
      },
      // The site's own rows never join; a press on them ends the selection.
      sidebar: null,
    },
    // The section marks the open chat as it draws its rows.
    navigation: { highlightActiveConversation: () => {} },
    feedback,
    toolbar: {
      host: () => section.selectionBar,
      placement: 'inline',
      icon: sectionToolbarIcon,
    },
    getContext: () => ({ accountIsolationEnabled: false, isDestroyed: options.isDisposed() }),
    onFolderSelectionChange: () => section.refreshSelection(),
  });
  const drops: SidebarDropContext = {
    store,
    commands,
    rootBucketId,
    feedback,
    sortMode: () => section.sortMode,
    conversationIdentity: options.site.policy,
    finish: () => selection.finishDrop(),
  };
  const section: SiteFolderSection = new SiteFolderSection({
    site: options.site,
    data: store.data,
    rootBucketId,
    actions: {
      ...options.treeActions,
      ...selection.treeActions(),
      onDrop: (e, folderId, placement) => dropOnSidebar(drops, e, folderId, placement),
      acceptsDrag: acceptsSidebarDrag,
      // The section sits in the sidebar, next to the row the site renames in.
      onRenameConversation: options.renameNative,
    },
    prefs: options.prefs,
    onPrefsChange: options.savePrefs,
    activity: options.activity
      ? { ...options.activity, commands, onRenameNative: options.renameNative }
      : undefined,
    selection: {
      toolbar: selection.createMultiSelectIndicator(),
      isConversationSelected: (conversation, bucketId) =>
        selection.isFolderConversationSelected(conversation.conversationId, bucketId),
    },
    transfer: options.transfer,
    cloud: options.cloud,
  });
  section.setDataReady(store.ready);
  // The heading files at the root, as Gemini's does: tree drags, and the site's row drags.
  section.header.setAttribute(DROP_FOLDER_ATTR, rootBucketId);
  const unbindRootDrop = bindRootDropZone(section.header, drops, DROP_TARGET_CLASS);
  return {
    section,
    selection,
    dispose: () => {
      selection.reset();
      unbindRootDrop();
      section.destroy();
    },
  };
}
