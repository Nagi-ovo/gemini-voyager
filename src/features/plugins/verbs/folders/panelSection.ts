/**
 * The folder section in its panel mode, for a site whose folders sit as a
 * panel in its own nav (AI Studio): the shared folder header in the page's
 * light DOM, under the site's own container class so its page stylesheet
 * reaches it, and the shared folder tree in a shadow host below it. The tree
 * reuses the floating panel's sheet in a shadow root, which keeps the page's
 * Material styles out; drags from the page's own rows still arrive, since drag
 * events cross the shadow boundary.
 *
 * Which orders, root heading and controls the tree shows comes from the core
 * table's `tree` (`treeSite.ts`); the site adds its header buttons and look.
 */
import type { FolderData } from '@/core/types/folder';
import type { ConversationSortMode } from '@/features/folder/model/folderData';
import { FLOATING_PANEL_CSS as panelCss } from '@/pages/content/folder/floatingPanelCss';
import {
  FLOATING_PANEL_CLASS,
  type TreeActions,
  type TreeSiteOptions,
} from '@/pages/content/folder/floatingTree/shared';
import { mountFolderTree } from '@/pages/content/folder/floatingTree/treeController';
import { INLINE_TREE_ATTR } from '@/pages/content/folder/floatingTree/treeStyle';
import {
  type FolderHeaderAction,
  createFolderHeader,
  ensureFolderHeaderStyle,
} from '@/pages/content/folder/folderHeader/folderHeader';
import { attachShadowSurface } from '@/pages/content/folder/shadowHost';

export interface PanelSectionOptions {
  /** The panel's classes: the site's own, which its page stylesheet and plugins target. */
  readonly containerClass: string;
  readonly title: { readonly tag: 'h2'; readonly labelKey: string; readonly className: string };
  readonly actions: readonly FolderHeaderAction[];
  readonly tree: {
    /** The shadow host's class. */
    readonly hostClass: string;
    /** The tree's sheet, after the floating panel's. */
    readonly css: string;
    readonly data: FolderData;
    readonly rootBucketId: string;
    readonly conversationSortMode: ConversationSortMode;
    readonly actions: TreeActions;
    /** Everything but the open conversation, which `setActiveConversation` keeps. */
    readonly site: TreeSiteOptions;
    readonly activeConversationId: string | null;
  };
}

export interface PanelSection {
  /** The panel to insert in the nav; `destroy` removes it. */
  readonly container: HTMLElement;
  /** New data; waits while a folder name is being typed. */
  update(data: FolderData): void;
  /** Another account's data: drops open name forms and the folder menu. */
  reset(data: FolderData): void;
  setActiveConversation(conversationId: string | null): void;
  /** Opens the name form for a new top-level folder. */
  startCreateFolder(): void;
  destroy(): void;
}

export function mountPanelSection(options: PanelSectionOptions): PanelSection {
  ensureFolderHeaderStyle();
  const container = document.createElement('div');
  container.className = options.containerClass;
  container.appendChild(
    createFolderHeader({ title: options.title, actions: [...options.actions] }),
  );

  const { tree: treeOptions } = options;
  const host = document.createElement('div');
  host.className = treeOptions.hostClass;
  host.setAttribute(INLINE_TREE_ATTR, '');
  const surface = attachShadowSurface(host, `${panelCss}\n${treeOptions.css}`);
  const body = document.createElement('div');
  body.className = `${FLOATING_PANEL_CLASS}__body`;
  surface.root.appendChild(body);
  container.appendChild(host);

  let activeConversationId = treeOptions.activeConversationId;
  const tree = mountFolderTree({
    body,
    boundary: host,
    focusRoot: surface.root,
    data: treeOptions.data,
    rootBucketId: treeOptions.rootBucketId,
    conversationSortMode: treeOptions.conversationSortMode,
    actions: treeOptions.actions,
    site: { ...treeOptions.site, activeConversationId },
    // The nav may transform or clip the tree; the menu must not be.
    popoverLayer: { css: panelCss },
  });

  return {
    container,
    update: (data) => tree.update(data),
    reset: (data) => tree.reset(data),
    setActiveConversation: (conversationId) => {
      if (conversationId === activeConversationId) return;
      activeConversationId = conversationId;
      tree.setSite({ ...treeOptions.site, activeConversationId });
    },
    startCreateFolder: () =>
      tree.apply({ inlineEditor: { mode: 'create', parentId: null }, contextMenu: null }),
    destroy: () => {
      tree.destroy();
      surface.disconnect();
      container.remove();
    },
  };
}
