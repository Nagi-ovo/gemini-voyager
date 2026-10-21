/**
 * DeepSeek on the shared sidebar folders: its sidebar, conversation ids and
 * pages, and the names it stores (keys, classes, the guide id), which are user
 * data and DOM output. Its row menu cannot be told apart from another, so it
 * has no native hooks besides the row drag.
 */
import { StorageKeys } from '@/core/types/common';
import type { ConversationReference } from '@/core/types/folder';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';
import { FOLDER_PLATFORMS } from '@/features/folder/platforms';
import { DEEPSEEK_IDENTITY, DEEPSEEK_TRANSFER } from '@/features/folder/sites/deepseekIdentity';

import { siteSectionCss } from '../siteFolders/sectionCss';
import { openSiteConversation, pageTitle, readSiteConversation } from '../siteFolders/sitePage';
import {
  PluginSiteFolderStore,
  createPluginSiteCommands,
  pluginSiteFolderConfig,
} from '../siteFolders/siteStore';
import type { HideFiledDom, SiteFoldersAdapter } from '../siteFolders/types';
import tokensCss from './deepseekSectionTokens.css?raw';
import {
  DEEPSEEK_ROW_SELECTOR,
  findDeepSeekSidebar,
  findHistoryAnchor,
  findSidebarLink,
  listSidebarConversations,
  readSidebarTitle,
  sidebarConversationAt,
} from './deepseekSidebarDom';

export const DEEPSEEK_FOLDERS_GUIDE_ID = 'deepseek-folders-sidebar-intro-v1';
export const DEEPSEEK_FOLDERS_GUIDE_DEBUG_EVENT = 'gv:debug:deepseekFoldersCoachmark';
const SECTION_CLASS = 'gv-deepseek-folder-section';
const FILED_ROW_ATTRIBUTE = 'data-gv-deepseek-filed';

export const DEEPSEEK_FOLDER_CONFIG = pluginSiteFolderConfig({
  storageKey: StorageKeys.FOLDER_DATA_DEEPSEEK,
  backupNamespace: FOLDER_PLATFORMS.deepseek.backupNamespace,
  logPrefix: '[DeepSeekFolderStore]',
  debugFlag: 'gvDeepSeekFolderDebug',
});

/** What DeepSeek calls a chat before it names it, and its home tab title ("DeepSeek - …"). */
const PLACEHOLDER_TITLES = new Set(['New chat', '新对话', '新對話', '新しいチャット']);
const HOME_TITLE = /^(?:DeepSeek|DSeek)(?:\s+-\s+|$)/;
const isPlaceholderTitle = (title: string): boolean =>
  PLACEHOLDER_TITLES.has(title) || HOME_TITLE.test(title);
const TITLE_SUFFIX = /\s+-\s+(?:DeepSeek|DSeek)$/;

function conversationHref(conversation: ConversationReference): string {
  return DEEPSEEK_IDENTITY.read(conversation.url)?.url ?? '';
}

/** The title DeepSeek shows for open conversation `id`: its sidebar row, else the tab title. */
function shownTitle(id: string): string | null {
  const link = findSidebarLink(id);
  const row = link ? readSidebarTitle({ id, path: '', link }) : '';
  if (row && !isPlaceholderTitle(row)) return row;
  return pageTitle(document, TITLE_SUFFIX, isPlaceholderTitle);
}

/**
 * Every history row. DeepSeek marks the open chat's row with a hashed class
 * only, so the open chat is hidden too once filed; a row holding focus (its
 * own rename field) stays shown.
 */
const DEEPSEEK_HIDE_FILED: HideFiledDom = {
  rowSelector: DEEPSEEK_ROW_SELECTOR,
  filedAttribute: FILED_ROW_ATTRIBUTE,
  styleAttribute: 'data-gv-deepseek-hide-filed',
  css: `${DEEPSEEK_ROW_SELECTOR}[${FILED_ROW_ATTRIBUTE}]:not(:focus-within) { display: none !important; }`,
  idPattern: /^[A-Za-z0-9_-]+$/,
};

export const DEEPSEEK_SITE_FOLDERS: SiteFoldersAdapter = {
  key: 'deepseek-folders',
  platform: 'deepseek',
  policy: FOLDER_SITE_POLICIES.deepseek,
  rootBucketId: DEEPSEEK_FOLDER_CONFIG.rootBucketId,
  createFolders: (notify) => {
    const store = new PluginSiteFolderStore(
      DEEPSEEK_FOLDER_CONFIG,
      DEEPSEEK_IDENTITY.bareId,
      undefined,
      notify,
    );
    const commands = createPluginSiteCommands({
      store,
      policy: FOLDER_SITE_POLICIES.deepseek,
      importInto: DEEPSEEK_TRANSFER.importInto,
      readConversation: DEEPSEEK_IDENTITY.read,
    });
    return { store, commands };
  },
  prefsKeys: {
    panel: StorageKeys.DEEPSEEK_FOLDER_PANEL,
    section: StorageKeys.DEEPSEEK_FOLDER_SECTION,
  },
  identity: {
    storedId: (id) => `${DEEPSEEK_IDENTITY.prefix}${id}`,
    bareId: DEEPSEEK_IDENTITY.bareId,
    conversationIdOf: (href) => DEEPSEEK_IDENTITY.read(href)?.conversationId ?? null,
    href: conversationHref,
  },
  page: {
    current: (untitled) => readSiteConversation(DEEPSEEK_IDENTITY, shownTitle, untitled),
    open: (conversation) =>
      void openSiteConversation(DEEPSEEK_IDENTITY, (id) => findSidebarLink(id), conversation),
    isPlaceholderTitle,
  },
  sidebar: {
    find: findDeepSeekSidebar,
    list: listSidebarConversations,
    title: readSidebarTitle,
    // DeepSeek's own attributes carry nothing the folders read; rows and text are watched anyway.
    observedAttributes: ['href', FILED_ROW_ATTRIBUTE],
  },
  section: {
    className: SECTION_CLASS,
    css: siteSectionCss(SECTION_CLASS, tokensCss),
    anchor: findHistoryAnchor,
    conversationHref,
    policy: FOLDER_SITE_POLICIES.deepseek,
  },
  hideFiled: DEEPSEEK_HIDE_FILED,
  guide: {
    id: DEEPSEEK_FOLDERS_GUIDE_ID,
    debugEvent: DEEPSEEK_FOLDERS_GUIDE_DEBUG_EVENT,
    // The title, the hint and the filing notices say nothing about the site.
    titleKey: 'chatgptFoldersCoachmarkTitle',
    bodyKey: 'deepseekFoldersCoachmarkBody',
  },
  messages: {
    hint: 'chatgptFoldersHint',
    added: 'chatgptFoldersAdded',
    alreadyFiled: 'chatgptFoldersAlreadyFiled',
    untitled: 'chatgptFoldersUntitled',
    noConversation: 'siteFoldersNoConversation',
  },
  transfer: {
    export: DEEPSEEK_TRANSFER.export,
    filename: () => DEEPSEEK_TRANSFER.filename(),
  },
  native: {
    rowAt: (target) => sidebarConversationAt(target),
  },
};
