/**
 * Claude on the shared sidebar folders: its sidebar, conversation ids, pages
 * and row menu, and the names it stores (keys, classes, the guide id), which
 * are user data and DOM output.
 */
import { StorageKeys } from '@/core/types/common';
import type { ConversationReference } from '@/core/types/folder';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';
import { FOLDER_PLATFORMS } from '@/features/folder/platforms';

import { siteSectionCss } from '../siteFolders/sectionCss';
import { openSiteConversation, pageTitle, readSiteConversation } from '../siteFolders/sitePage';
import {
  PluginSiteFolderStore,
  createPluginSiteCommands,
  pluginSiteFolderConfig,
} from '../siteFolders/siteStore';
import type { HideFiledDom, SiteFoldersAdapter } from '../siteFolders/types';
import { CLAUDE_IDENTITY, CLAUDE_TRANSFER } from './claudeIdentity';
import { ClaudeMoveMenu } from './claudeMoveMenu';
import tokensCss from './claudeSectionTokens.css?raw';
import {
  CLAUDE_RECENT_ROW_SELECTOR,
  findClaudeSidebar,
  findRecentsAnchor,
  findSidebarLink,
  listSidebarConversations,
  readSidebarTitle,
  sidebarConversationAt,
} from './claudeSidebarDom';

export const CLAUDE_FOLDERS_GUIDE_ID = 'claude-folders-sidebar-intro-v1';
export const CLAUDE_FOLDERS_GUIDE_DEBUG_EVENT = 'gv:debug:claudeFoldersCoachmark';
const SECTION_CLASS = 'gv-claude-folder-section';
const FILED_ROW_ATTRIBUTE = 'data-gv-claude-filed';

export const CLAUDE_FOLDER_CONFIG = pluginSiteFolderConfig({
  storageKey: StorageKeys.FOLDER_DATA_CLAUDE,
  backupNamespace: FOLDER_PLATFORMS.claude.backupNamespace,
  logPrefix: '[ClaudeFolderStore]',
  debugFlag: 'gvClaudeFolderDebug',
});

/** What Claude calls a chat it has not named yet (its tab title on /new is "New session"). */
const PLACEHOLDER_TITLES = new Set(['Claude', 'New chat', 'New session', 'Untitled']);
const isPlaceholderTitle = (title: string): boolean => PLACEHOLDER_TITLES.has(title);
const TITLE_SUFFIX = /\s+-\s+Claude$/;

function conversationHref(conversation: ConversationReference): string {
  return CLAUDE_IDENTITY.read(conversation.url)?.url ?? '';
}

/** The title Claude shows for open conversation `id`: its sidebar row, else the tab title. */
function shownTitle(id: string): string | null {
  const link = findSidebarLink(id);
  const row = link ? readSidebarTitle({ id, path: '', link }) : '';
  if (row && !isPlaceholderTitle(row)) return row;
  return pageTitle(document, TITLE_SUFFIX, isPlaceholderTitle);
}

/** Recents only: a filed chat stays visible among the pinned chats and in its Project. */
const CLAUDE_HIDE_FILED: HideFiledDom = {
  rowSelector: CLAUDE_RECENT_ROW_SELECTOR,
  filedAttribute: FILED_ROW_ATTRIBUTE,
  styleAttribute: 'data-gv-claude-hide-filed',
  // The open chat and a row holding focus (Claude's own rename field) stay shown.
  css: `${CLAUDE_RECENT_ROW_SELECTOR}[${FILED_ROW_ATTRIBUTE}]:not(:has([aria-current="page"])):not(:focus-within) { display: none !important; }`,
  idPattern: /^[A-Za-z0-9_-]+$/,
};

export const CLAUDE_SITE_FOLDERS: SiteFoldersAdapter = {
  key: 'claude-folders',
  platform: 'claude',
  policy: FOLDER_SITE_POLICIES.claude,
  rootBucketId: CLAUDE_FOLDER_CONFIG.rootBucketId,
  createFolders: (notify) => {
    const store = new PluginSiteFolderStore(
      CLAUDE_FOLDER_CONFIG,
      CLAUDE_IDENTITY.bareId,
      undefined,
      notify,
    );
    const commands = createPluginSiteCommands({
      store,
      policy: FOLDER_SITE_POLICIES.claude,
      importInto: CLAUDE_TRANSFER.importInto,
      readConversation: CLAUDE_IDENTITY.read,
    });
    return { store, commands };
  },
  prefsKeys: {
    panel: StorageKeys.CLAUDE_FOLDER_PANEL,
    section: StorageKeys.CLAUDE_FOLDER_SECTION,
  },
  identity: {
    storedId: (id) => `${CLAUDE_IDENTITY.prefix}${id}`,
    bareId: CLAUDE_IDENTITY.bareId,
    conversationIdOf: (href) => CLAUDE_IDENTITY.read(href)?.conversationId ?? null,
    href: conversationHref,
  },
  page: {
    current: (untitled) => readSiteConversation(CLAUDE_IDENTITY, shownTitle, untitled),
    open: (conversation) =>
      void openSiteConversation(CLAUDE_IDENTITY, (id) => findSidebarLink(id), conversation),
    isPlaceholderTitle,
  },
  sidebar: {
    find: findClaudeSidebar,
    list: listSidebarConversations,
    title: readSidebarTitle,
    // The open conversation's row carries `aria-current`.
    observedAttributes: ['href', 'aria-current', FILED_ROW_ATTRIBUTE],
  },
  section: {
    className: SECTION_CLASS,
    css: siteSectionCss(SECTION_CLASS, tokensCss),
    anchor: findRecentsAnchor,
    conversationHref,
    policy: FOLDER_SITE_POLICIES.claude,
  },
  hideFiled: CLAUDE_HIDE_FILED,
  guide: {
    id: CLAUDE_FOLDERS_GUIDE_ID,
    debugEvent: CLAUDE_FOLDERS_GUIDE_DEBUG_EVENT,
    // The title, the hint and the filing notices say nothing about the site.
    titleKey: 'chatgptFoldersCoachmarkTitle',
    bodyKey: 'claudeFoldersCoachmarkBody',
  },
  messages: {
    hint: 'chatgptFoldersHint',
    added: 'chatgptFoldersAdded',
    alreadyFiled: 'chatgptFoldersAlreadyFiled',
    untitled: 'chatgptFoldersUntitled',
    noConversation: 'siteFoldersNoConversation',
  },
  transfer: {
    export: CLAUDE_TRANSFER.export,
    filename: () => CLAUDE_TRANSFER.filename(),
  },
  native: {
    createMoveMenu: (options) => new ClaudeMoveMenu(options),
    rowAt: (target) => sidebarConversationAt(target),
  },
};
