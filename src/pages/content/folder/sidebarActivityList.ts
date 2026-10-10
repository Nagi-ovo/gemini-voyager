import { createStarIcon } from '@/core/icons/folderIcons';
import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import { getCachedLocale, getTranslationSyncUnsafe as t } from '@/utils/i18n';

import type { FolderFeedback } from './FolderFeedback';
import type { FolderNavigation } from './FolderNavigation';
import {
  ACTIVITY_PRIORITY_WINDOW_MS,
  type ConversationActivityGroup,
  type ConversationActivityItem,
  buildConversationActivityGroups,
  formatActivityFolderSummary,
} from './activityView';
import type { FolderDialogs } from './folderDialogs';
import { ensurePageSheet } from './pageSheet';
import listCss from './sidebarActivityList.css?raw';
import {
  type FolderSearchCriteria,
  getCurrentUserId,
  isCurrentUserConversation,
  normalizeFolderSearchText,
} from './sidebarFilter';
import type { ConversationReference, FolderData } from './types';

/** The list's sheet, for a shadow root that holds the list. */
export const ACTIVITY_LIST_CSS = listCss;

/** Adds the list's sheet to the page once, for a list in page DOM (Gemini's). */
export function ensureActivityListStyle(doc: Document = document): void {
  ensurePageSheet('gv-folder-activity-style', listCss, doc);
}

const MAX_TIMEOUT_MS = 2_147_483_647;

export interface SidebarActivityListOptions {
  store: { readonly data: FolderData };
  commands: Pick<FolderCommands, 'run'>;
  navigation: Pick<FolderNavigation, 'getConversationHref' | 'navigate'>;
  /** Folder paths on hover; without it they are the context line's native tooltip. */
  feedback?: Pick<FolderFeedback, 'showTooltip' | 'hideTooltip'>;
  dialogs: Pick<FolderDialogs, 'openMenu'>;
  onRenameNative(conversation: ConversationReference): unknown;
  /** Re-renders the sidebar when the priority group's oldest entry ages out. */
  onExpire(): void;
}

function formatActivityGroupHeading(group: ConversationActivityGroup): string {
  if (group.id === 'priority') return t('folder_activity_priority');
  if (group.id === 'today') return t('folder_activity_today');
  if (group.id === 'yesterday') return t('folder_activity_yesterday');
  if (!group.dayStart) return '';

  return new Date(group.dayStart).toLocaleDateString(getCachedLocale(), { weekday: 'long' });
}

function formatActivityTimestamp(timestamp: number | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  // Voyager's language, not the browser's: a Chinese UI must not read "11:19 PM".
  const locale = getCachedLocale();
  return sameDay
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** The sidebar's activity view: recent chats grouped by day, read from the same folder data. */
export class SidebarActivityList {
  private priorityRefreshTimer: number | null = null;

  constructor(private readonly options: SidebarActivityListOptions) {}

  clear(): void {
    if (this.priorityRefreshTimer === null) return;
    window.clearTimeout(this.priorityRefreshTimer);
    this.priorityRefreshTimer = null;
  }

  /** Fills `list`; `search` is the active search, if any. */
  populate(
    list: HTMLElement,
    search: FolderSearchCriteria | null,
    currentUserOnly: boolean,
  ): HTMLElement {
    const currentUserId = getCurrentUserId();
    const textMatches = (value: string) =>
      !search ||
      search.query.length === 0 ||
      normalizeFolderSearchText(value).includes(search.query);
    const matches = (conversation: ConversationReference, folderPaths: string[]): boolean => {
      if (currentUserOnly && !isCurrentUserConversation(conversation, currentUserId)) return false;
      if (!search) return true;
      if (search.mode === 'folder') return folderPaths.some(textMatches);
      return textMatches(conversation.title) || folderPaths.some(textMatches);
    };

    const groups = buildConversationActivityGroups(this.options.store.data, {
      rootLabel: t('folder_activity_top_level'),
      matches,
    });
    this.schedulePriorityRefresh(groups);

    if (groups.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'gv-folder-empty gv-folder-activity-empty';
      emptyState.textContent = t(search ? 'folder_search_empty' : 'folder_activity_empty');
      list.appendChild(emptyState);
      return list;
    }

    groups.forEach((group) => {
      const section = document.createElement('section');
      section.className = `gv-folder-activity-group gv-folder-activity-group-${group.id}`;

      const heading = document.createElement('h2');
      heading.className = 'gv-folder-activity-heading';
      heading.id = `gv-folder-activity-${group.id}`;
      heading.textContent = formatActivityGroupHeading(group);
      section.setAttribute('aria-labelledby', heading.id);
      section.appendChild(heading);

      group.items.forEach((item) => {
        section.appendChild(this.createConversationElement(item));
      });
      list.appendChild(section);
    });

    return list;
  }

  private schedulePriorityRefresh(groups: readonly ConversationActivityGroup[]): void {
    this.clear();
    const priorityGroup = groups.find((group) => group.id === 'priority');
    const nextExpiry = priorityGroup?.items.reduce<number | null>((earliest, item) => {
      if (!item.lastTurnAt || !Number.isFinite(item.lastTurnAt)) return earliest;
      const expiry = item.lastTurnAt + ACTIVITY_PRIORITY_WINDOW_MS;
      return earliest === null ? expiry : Math.min(earliest, expiry);
    }, null);
    if (nextExpiry === null || nextExpiry === undefined) return;

    // Future imports can overflow setTimeout into a 1 ms loop; wake at the cap and recompute.
    const delay = Math.min(MAX_TIMEOUT_MS, Math.max(1, nextExpiry - Date.now() + 1));
    this.priorityRefreshTimer = window.setTimeout(() => {
      this.priorityRefreshTimer = null;
      this.options.onExpire();
    }, delay);
  }

  private createConversationElement(item: ConversationActivityItem): HTMLElement {
    const { conversation } = item;
    const { feedback } = this.options;
    const row = document.createElement('div');
    row.className = item.starred
      ? 'gv-folder-conversation gv-folder-activity-item gv-starred'
      : 'gv-folder-conversation gv-folder-activity-item';
    row.dataset.conversationId = conversation.conversationId;
    row.dataset.folderId = item.sourceFolderId;

    const link = document.createElement('a');
    link.className = 'gv-folder-conversation-link gv-folder-activity-link';
    link.href = this.options.navigation.getConversationHref(conversation);
    link.draggable = false;

    const text = document.createElement('span');
    text.className = 'gv-folder-activity-text';

    const title = document.createElement('span');
    title.className = 'gv-conversation-title gds-label-l';
    title.textContent = conversation.title;

    const folderSummary = formatActivityFolderSummary(item.folderContexts);
    const folderPaths = item.folderContexts.map((folder) => folder.path).join('\n');
    const context = document.createElement('span');
    context.className = 'gv-folder-activity-context';
    context.textContent = folderSummary;
    context.setAttribute('aria-label', folderPaths);
    if (feedback) {
      context.addEventListener('mouseenter', () =>
        feedback.showTooltip(context, folderPaths, true),
      );
      context.addEventListener('mouseleave', () => feedback.hideTooltip());
      link.addEventListener('focus', () => feedback.showTooltip(context, folderPaths, true));
      link.addEventListener('blur', () => feedback.hideTooltip());
    } else {
      context.title = folderPaths;
    }

    text.append(title, context);
    link.appendChild(text);

    const timeLabel = formatActivityTimestamp(item.lastTurnAt);
    if (timeLabel && item.lastTurnAt) {
      const time = document.createElement('time');
      time.className = 'gv-folder-activity-time';
      time.dateTime = new Date(item.lastTurnAt).toISOString();
      time.textContent = timeLabel;
      time.title = new Date(item.lastTurnAt).toLocaleString(getCachedLocale());
      row.appendChild(time);
    }

    const starButton = document.createElement('button');
    starButton.className = item.starred
      ? 'gv-conversation-star-btn starred'
      : 'gv-conversation-star-btn';
    starButton.type = 'button';
    starButton.replaceChildren(createStarIcon(18, item.starred));
    starButton.title = item.starred ? t('conversation_unstar') : t('conversation_star');
    starButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.options.commands.run({
        kind: 'setConversationStarred',
        conversationId: conversation.conversationId,
        starred: !item.starred,
        scope: 'everywhere',
      });
    });

    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // The stored record may have changed since this list rendered.
      const latest = this.options.store.data.folderContents[item.sourceFolderId]?.find(
        (candidate) => candidate.conversationId === conversation.conversationId,
      );
      if (latest) this.options.navigation.navigate(latest, item.sourceFolderId);
    });
    if (feedback) {
      title.addEventListener('mouseenter', () => feedback.showTooltip(title, conversation.title));
      title.addEventListener('mouseleave', () => feedback.hideTooltip());
    }
    title.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.options.onRenameNative(conversation);
    });
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.options.dialogs.openMenu(
        event,
        [
          {
            label: t('folder_rename'),
            action: () => void this.options.onRenameNative(conversation),
          },
        ],
        'conversation',
      );
    });

    row.prepend(link);
    row.appendChild(starButton);
    return row;
  }
}
