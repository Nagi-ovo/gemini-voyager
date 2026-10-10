import { createCircleCheckIcon, createTrashIcon, createXIcon } from '@/core/icons/folderIcons';
/**
 * The folder tree as a section of ChatGPT's own sidebar, just above Recents. It
 * reuses the floating panel's tree and sheet inside its own shadow host. ChatGPT
 * (React) may drop it on any re-render or remount the whole sidebar; `place`
 * puts it back and is called after every sidebar change. While the sidebar or
 * Recents is missing it stays out of the page and the plugin offers the
 * floating panel's button instead.
 */
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import type { ConversationSortMode } from '@/features/folder/model/folderData';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';
import { hasSeenCoachmark } from '@/pages/content/coachmark';
import panelCss from '@/pages/content/folder/floatingPanel.css?raw';
import {
  type FolderDropTarget,
  folderDropTargetAt,
} from '@/pages/content/folder/floatingTree/dropTargets';
import {
  FLOATING_PANEL_CLASS,
  FOLDER_TOGGLE_DELAY_MS,
  type TreeActions,
  type TreeSiteOptions,
} from '@/pages/content/folder/floatingTree/shared';
import {
  type FolderTreeController,
  mountFolderTree,
} from '@/pages/content/folder/floatingTree/treeController';
import { applyFolderDisplay } from '@/pages/content/folder/folderDisplay';
import {
  FOLDER_HEADER_CSS,
  createFolderHeader,
  setFolderHeaderAction,
  setFolderHeaderCollapsed,
  setFolderHeaderDisabled,
} from '@/pages/content/folder/folderHeader/folderHeader';
import {
  type FolderHeaderActionsOptions,
  folderHeaderActions,
} from '@/pages/content/folder/folderHeader/folderHeaderActions';
import { closeFolderHeaderMenu } from '@/pages/content/folder/folderHeader/folderHeaderMenu';
import { openFolderSettingsPopover } from '@/pages/content/folder/folderSettings/folderSettings';
import type { SelectionToolbarIcon } from '@/pages/content/folder/selectionToolbar';
import { type ShadowSurface, attachShadowSurface } from '@/pages/content/folder/shadowHost';
import {
  ACTIVITY_LIST_CSS,
  SidebarActivityList,
  type SidebarActivityListOptions,
} from '@/pages/content/folder/sidebarActivityList';
import {
  type FolderSearchCriteria,
  createSidebarFilter,
  searchAndSortOptions,
  searchCriteriaOf,
} from '@/pages/content/folder/sidebarFilter';
import { FOLDER_ONLY_SEARCH_HINT_ID } from '@/pages/content/folder/sidebarPrefs';
import { type FolderSearchBox, createFolderSearch } from '@/pages/content/folder/sidebarSearch';
import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

import sectionCss from './chatgptFolderSection.css?raw';
import { readChatGptConversation } from './chatgptIdentity';
import { findHistoryAnchor } from './chatgptSidebarDom';
import type { ChatGptFolderSectionPrefs } from './sectionPrefs';

export const FOLDER_SECTION_CLASS = 'gv-chatgpt-folder-section';
const ACTIVITY_TOGGLE_CLASS = `${FOLDER_SECTION_CLASS}__activity`;
const SETTINGS_CLASS = 'gv-folder-settings-btn';

/** Header icons, at the size of Gemini's folder header icons. */
export const SECTION_ICON_SIZE = 18;

/**
 * What the settings show for a display setting the user never stored: the
 * section's own 14px rows with no gap. Its sheet keeps those until one is set.
 */
const DISPLAY_DEFAULTS = {
  [StorageKeys.GV_FOLDER_ITEM_FONT_SIZE]: 14,
  [StorageKeys.GV_FOLDER_SPACING]: 0,
};

/** The multi-select toolbar's icons, in the header's line style. */
export const sectionToolbarIcon: SelectionToolbarIcon = (name) => {
  if (name === 'check_circle') return createCircleCheckIcon(SECTION_ICON_SIZE);
  return name === 'delete' ? createTrashIcon(SECTION_ICON_SIZE) : createXIcon(SECTION_ICON_SIZE);
};

/**
 * Gemini's folder sidebar drawn in ChatGPT's line-icon style: chevrons, tinted
 * folder icons, a menu button on each folder, and the same drags.
 */
const SITE: TreeSiteOptions = {
  lineIcons: true,
  folderMenuButton: { labelKey: 'folder_settings' },
  folderBodyDrop: true,
  folderDrag: true,
  conversationHref: (conversation) => readChatGptConversation(conversation.url)?.url ?? '',
  folderToggleDelayMs: FOLDER_TOGGLE_DELAY_MS,
  conversationIdentity: FOLDER_SITE_POLICIES.chatgpt,
};

export type ChatGptFolderSectionOptions = {
  data: FolderData;
  rootBucketId: string;
  actions: TreeActions;
  /** The header's import/export and cloud menus. */
  transfer: FolderHeaderActionsOptions['transfer'];
  cloud: FolderHeaderActionsOptions['cloud'];
  prefs: ChatGptFolderSectionPrefs;
  /** The section was collapsed, its conversation order changed, or it switched views. */
  onPrefsChange: (prefs: ChatGptFolderSectionPrefs) => void;
  /** Long-press multi-select: its toolbar, shown atop the tree, and the rows it holds. */
  selection?: {
    toolbar: HTMLElement;
    isConversationSelected: NonNullable<TreeSiteOptions['isConversationSelected']>;
  };
  /**
   * The Activity view (recent chats by last send) and its bell, offered only
   * where the page records when chats were last sent to.
   */
  activity?: Omit<SidebarActivityListOptions, 'store' | 'onExpire'>;
};

export class ChatGptFolderSection {
  readonly element: HTMLElement;
  /** The header row with the section's title: what the one-time guide points at. */
  readonly header: HTMLElement;
  /** Holds the multi-select toolbar and carries the mode class while selecting. */
  readonly selectionBar: HTMLElement;
  private readonly surface: ShadowSurface;
  private readonly body: HTMLElement;
  /** The search box and the tree, hidden while the section is collapsed. */
  private readonly content: HTMLElement;
  private readonly search: FolderSearchBox;
  private readonly tree: FolderTreeController;
  /** The Activity view's rows, shown in place of the tree. */
  private readonly activityBody: HTMLElement;
  private readonly activity: SidebarActivityList | null;
  private readonly onPrefsChange: (prefs: ChatGptFolderSectionPrefs) => void;
  private readonly isConversationSelected: TreeSiteOptions['isConversationSelected'];
  private readonly stopDisplay: () => void;
  private activeConversationId: string | null = null;
  private data: FolderData;
  private prefs: ChatGptFolderSectionPrefs;
  private searchQuery = '';
  private searchHintSeen = false;
  private filter: TreeSiteOptions['filter'];
  private pointerInside = false;
  /** `data` holds open times the tree has not laid out yet. */
  private layoutHeld = false;

  constructor({
    data,
    rootBucketId,
    actions,
    transfer,
    cloud,
    prefs,
    onPrefsChange,
    selection,
    activity,
  }: ChatGptFolderSectionOptions) {
    this.data = data;
    this.isConversationSelected = selection?.isConversationSelected;
    this.prefs = { ...prefs };
    this.onPrefsChange = onPrefsChange;
    this.element = document.createElement('div');
    this.element.className = FOLDER_SECTION_CLASS;
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', t('floatingPanelTitle'));
    this.element.addEventListener('pointerenter', () => (this.pointerInside = true));
    this.element.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      if (this.layoutHeld) this.update(this.data);
    });

    // ChatGPT's own sections collapse from their heading; its name stays the button's name.
    const header = createFolderHeader({
      className: `${FOLDER_SECTION_CLASS}__header`,
      title: {
        tag: 'h2',
        labelKey: 'floatingPanelTitle',
        className: `${FOLDER_SECTION_CLASS}__title`,
      },
      collapse: {
        byTitle: true,
        onToggle: () => this.setPrefs({ collapsed: !this.prefs.collapsed }),
      },
      containClicks: true,
      // Gemini's header buttons, in its order; all but "create" and a pressed bell show only
      // while the header is in use.
      actions: folderHeaderActions({
        activity: activity && {
          className: ACTIVITY_TOGGLE_CLASS,
          pressed: this.prefs.viewMode === 'activity',
          onClick: () =>
            this.prefs.viewMode === 'activity'
              ? this.setPrefs({ viewMode: 'folders' })
              : this.setPrefs({ viewMode: 'activity', collapsed: false }),
        },
        transfer,
        cloud,
        settings: (event) =>
          openFolderSettingsPopover(event.currentTarget as HTMLButtonElement, {
            sortMode: this.prefs.sortMode,
            onSortModeChange: (sortMode) => this.setPrefs({ sortMode }),
            displayDefaults: DISPLAY_DEFAULTS,
          }),
        create: {
          className: `${FOLDER_SECTION_CLASS}__create`,
          labelKey: 'floatingPanelCreateFolder',
          onClick: () => {
            // The new folder's name is typed into the tree.
            if (this.prefs.collapsed || this.activityMode)
              this.setPrefs({ collapsed: false, viewMode: 'folders' });
            this.tree.apply({
              inlineEditor: { mode: 'create', parentId: null },
              contextMenu: null,
            });
          },
        },
        reveal: true,
        iconSize: SECTION_ICON_SIZE,
      }),
    });
    this.header = header;

    this.search = createFolderSearch({
      query: () => this.searchQuery,
      setQuery: (query) => (this.searchQuery = query),
      folderOnly: () => this.searchCriteria()?.mode === 'folder',
      hintSeen: () => this.searchHintSeen,
      markHintSeen: () => (this.searchHintSeen = true),
      onSearch: () => this.applySearch(),
    });
    void hasSeenCoachmark(FOLDER_ONLY_SEARCH_HINT_ID).then((seen) => {
      this.searchHintSeen ||= seen;
      this.search.refreshLanguage();
    });

    this.body = document.createElement('div');
    this.body.className = `${FLOATING_PANEL_CLASS}__body`;
    this.content = document.createElement('div');
    this.content.className = `${FOLDER_SECTION_CLASS}__content`;
    this.selectionBar = document.createElement('div');
    this.selectionBar.className = `${FOLDER_SECTION_CLASS}__selection`;
    if (selection) this.selectionBar.append(selection.toolbar);
    this.activityBody = document.createElement('div');
    this.activityBody.className = 'gv-folder-activity-list';
    this.content.append(this.search.element, this.selectionBar, this.body, this.activityBody);
    const currentData = () => this.data;
    this.activity = activity
      ? new SidebarActivityList({
          ...activity,
          store: {
            get data() {
              return currentData();
            },
          },
          onExpire: () => this.showView(),
        })
      : null;

    const css = `${panelCss}\n${FOLDER_HEADER_CSS}\n${ACTIVITY_LIST_CSS}\n${sectionCss}`;
    this.surface = attachShadowSurface(this.element, css);
    this.surface.root.append(header, this.content);
    // Gemini's font size, spacing and indent, which the section's sheet reads from its host.
    this.stopDisplay = applyFolderDisplay(this.element);

    // The sidebar scrolls and clips, so the folder menu renders in a body-level layer.
    this.tree = mountFolderTree({
      body: this.body,
      boundary: this.element,
      focusRoot: this.surface.root,
      data,
      rootBucketId,
      conversationSortMode: this.prefs.sortMode,
      actions: actions.onRenameConversation
        ? {
            ...actions,
            onConversationMenu: (e, conversation) =>
              this.tree.apply({
                inlineEditor: null,
                contextMenu: { conversation, x: e.clientX, y: e.clientY },
              }),
          }
        : actions,
      site: this.site(),
      popoverLayer: { css },
    });
    this.showPrefs();
  }

  /** The conversation order the tree shows, for drops that place by position. */
  get sortMode(): ConversationSortMode {
    return this.prefs.sortMode;
  }

  /**
   * Puts the section just before Recents in `sidebar`, unless it is already
   * there. Drops copies ChatGPT may have cloned along with its own nodes.
   */
  place(sidebar: HTMLElement | null): void {
    if (!sidebar) return;
    for (const copy of sidebar.querySelectorAll(`.${FOLDER_SECTION_CLASS}`)) {
      if (copy !== this.element) copy.remove();
    }
    const anchor = findHistoryAnchor(sidebar);
    const parent = anchor?.parentElement;
    if (!anchor || !parent) {
      this.element.remove();
      return;
    }
    if (this.element.parentElement === parent && this.element.nextElementSibling === anchor) {
      // Reinserting here would wake our sidebar watcher forever.
      return;
    }
    parent.insertBefore(this.element, anchor);
  }

  update(data: FolderData): void {
    this.data = data;
    this.layoutHeld = false;
    this.tree.update(data);
    if (this.activityMode) this.showView();
  }

  /**
   * New data in which only open or send times changed. While the pointer is
   * over the section the rows stay put: opening a chat on a double-click's
   * first click would otherwise move another chat under its second. The recent
   * order and the Activity view catch up once the pointer leaves, as Gemini's
   * do on their next render.
   */
  updateOpened(data: FolderData): void {
    if (!this.pointerInside) {
      this.update(data);
      return;
    }
    this.data = data;
    this.layoutHeld = true;
  }

  /** Marks the rows of the conversation the page has open (its stored id), or none. */
  setActiveConversation(conversationId: string | null): void {
    if (conversationId === this.activeConversationId) return;
    this.activeConversationId = conversationId;
    this.tree.setSite(this.site());
  }

  /** The selection changed: rows show whether they are selected again. */
  refreshSelection(): void {
    this.tree.setSite(this.site());
  }

  setDataReady(ready: boolean): void {
    this.body.inert = !ready;
    this.body.setAttribute('aria-busy', String(!ready));
    this.activityBody.inert = !ready;
    setFolderHeaderDisabled(this.header, !ready);
    // The view toggle and the settings only change what is shown, so they work while data loads.
    for (const className of [ACTIVITY_TOGGLE_CLASS, SETTINGS_CLASS]) {
      const button = this.header.querySelector<HTMLButtonElement>(`.${className}`);
      if (button) button.disabled = false;
    }
  }

  /** True while the section's own folder menu or name field is open. */
  get busy(): boolean {
    return this.tree.busy();
  }

  /** The folder drop target under a viewport point, for a drag driven by pointer events. */
  dropTargetAt(x: number, y: number): FolderDropTarget | null {
    return folderDropTargetAt(this.surface.root, x, y);
  }

  destroy(): void {
    this.activity?.clear();
    closeFolderHeaderMenu();
    this.stopDisplay();
    this.search.cancel();
    this.tree.destroy();
    this.surface.disconnect();
    this.element.remove();
  }

  private site(): TreeSiteOptions {
    return {
      ...SITE,
      ...searchAndSortOptions(this.searchCriteria() !== null, this.prefs.sortMode),
      filter: this.filter,
      activeConversationId: this.activeConversationId,
      isConversationSelected: this.isConversationSelected,
    };
  }

  /** The Activity view is offered and chosen. */
  private get activityMode(): boolean {
    return !!this.activity && this.prefs.viewMode === 'activity';
  }

  /** Shows the tree, or redraws the Activity view in its place. */
  private showView(): void {
    const activity = this.activityMode;
    this.body.hidden = activity;
    this.activityBody.hidden = !activity;
    this.activityBody.replaceChildren();
    if (activity) this.activity!.populate(this.activityBody, this.searchCriteria(), false);
    else this.activity?.clear();
  }

  private searchCriteria(): FolderSearchCriteria | null {
    return searchCriteriaOf(this.searchQuery);
  }

  /** Filters the tree by the search box once typing pauses. */
  private applySearch(): void {
    const search = this.searchCriteria();
    this.filter = search
      ? createSidebarFilter({ search, currentUserOnly: false }, () => this.data)
      : undefined;
    this.tree.setSite(this.site());
    if (this.activityMode) this.showView();
  }

  private setPrefs(change: Partial<ChatGptFolderSectionPrefs>): void {
    const sortChanged = change.sortMode !== undefined && change.sortMode !== this.prefs.sortMode;
    const viewChanged = change.viewMode !== undefined && change.viewMode !== this.prefs.viewMode;
    this.prefs = { ...this.prefs, ...change };
    this.showPrefs(viewChanged);
    if (sortChanged) {
      this.layoutHeld = false;
      this.tree.setSite(this.site());
      this.tree.update(this.data, this.prefs.sortMode);
    }
    this.onPrefsChange({ ...this.prefs });
  }

  /** `redraw`: the view changed, so the tree or the Activity view is shown anew. */
  private showPrefs(redraw = true): void {
    const { collapsed } = this.prefs;
    this.content.hidden = collapsed;
    setFolderHeaderCollapsed(this.header, collapsed);
    const activity = this.activityMode;
    setFolderHeaderAction(this.header, ACTIVITY_TOGGLE_CLASS, {
      pressed: activity,
      label: t(activity ? 'folder_activity_turn_off' : 'folder_activity_turn_on'),
    });
    if (redraw) this.showView();
  }
}
