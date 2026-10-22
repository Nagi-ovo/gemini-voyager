/**
 * ChatGPT on the shared sidebar folders: its sidebar, conversation ids, pages
 * and own menus, and the names it has always stored (keys, classes, the guide
 * id), which are user data and DOM output.
 */
import { StorageKeys } from '@/core/types/common';
import type { ConversationReference } from '@/core/types/folder';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';
import {
  CHATGPT_CONVERSATION_ID_PREFIX,
  bareConversationId,
  readChatGptConversation,
} from '@/features/folder/sites/chatgptIdentity';
import {
  chatgptFolderExportFilename,
  exportChatGptFolders,
} from '@/features/folder/sites/chatgptTransfer';
import { CHATGPT_FOLDER_CONFIG } from '@/pages/content/folder/pluginSiteFolderConfigs';

import { isTemporaryChat } from '../chatgptTemporaryHandoff/handoff';
import { siteSectionCss } from '../siteFolders/sectionCss';
import type { SectionSite, SiteFoldersAdapter } from '../siteFolders/types';
import { ChatGptFolderStore } from './ChatGptFolderStore';
import { CHATGPT_HIDE_FILED, FILED_ROW_ATTRIBUTE } from './chatgptHideFiled';
import { ChatGptMoveMenu } from './chatgptMoveMenu';
import { openNativeRename } from './chatgptNativeRename';
import {
  isPlaceholderTitle,
  openChatGptConversation,
  readCurrentConversation,
} from './chatgptPage';
import {
  findChatGptSidebar,
  findHistoryAnchor,
  listSidebarConversations,
  readSidebarTitle,
  sidebarConversationAt,
} from './chatgptSidebarDom';
import { createLegacyChatGptCommands } from './legacyChatGptCommands';

export const CHATGPT_FOLDERS_GUIDE_ID = 'chatgpt-folders-sidebar-intro-v1';
/** `document.dispatchEvent(new Event(...))` shows the guide again, seen or not. */
export const CHATGPT_FOLDERS_GUIDE_DEBUG_EVENT = 'gv:debug:chatgptFoldersCoachmark';

/** The canonical link of a filed ChatGPT conversation; empty for any other entry. */
function conversationHref(conversation: ConversationReference): string {
  return readChatGptConversation(conversation.url)?.url ?? '';
}

const SECTION_CLASS = 'gv-chatgpt-folder-section';

/** The section just above Recents, in ChatGPT's own sidebar style. */
export const CHATGPT_SECTION_SITE: SectionSite = {
  className: SECTION_CLASS,
  // The shared sheets' defaults are ChatGPT's own tokens.
  css: siteSectionCss(SECTION_CLASS),
  anchor: findHistoryAnchor,
  conversationHref,
  policy: FOLDER_SITE_POLICIES.chatgpt,
};

/**
 * What changes inside ChatGPT's sidebar besides rows and text: a row's menu
 * trigger flips `aria-expanded` when its menu opens, and the open
 * conversation's row carries `aria-current`.
 */
const OBSERVED_ATTRIBUTES = [
  'href',
  'target',
  'role',
  'data-sidebar-project-container-id',
  'aria-expanded',
  // Moves to the open conversation's row when the route changes.
  'aria-current',
  FILED_ROW_ATTRIBUTE,
];

export const CHATGPT_SITE_FOLDERS: SiteFoldersAdapter = {
  key: 'chatgpt-folders',
  platform: 'chatgpt',
  policy: FOLDER_SITE_POLICIES.chatgpt,
  rootBucketId: CHATGPT_FOLDER_CONFIG.rootBucketId,
  createFolders: (notify) => {
    const store = new ChatGptFolderStore(undefined, notify);
    return { store, commands: createLegacyChatGptCommands(store) };
  },
  prefsKeys: {
    panel: StorageKeys.CHATGPT_FOLDER_PANEL,
    section: StorageKeys.CHATGPT_FOLDER_SECTION,
  },
  identity: {
    storedId: (id) => `${CHATGPT_CONVERSATION_ID_PREFIX}${id}`,
    bareId: bareConversationId,
    conversationIdOf: (href) => readChatGptConversation(href)?.conversationId ?? null,
    href: conversationHref,
  },
  page: {
    // The handoff plugin's check also reads the temporary-chat toggle, not just the URL.
    current: (untitled) => (isTemporaryChat() ? null : readCurrentConversation(untitled)),
    open: (conversation) => void openChatGptConversation(conversation),
    isPlaceholderTitle: (title) => isPlaceholderTitle(title),
  },
  sidebar: {
    find: findChatGptSidebar,
    list: listSidebarConversations,
    title: readSidebarTitle,
    observedAttributes: OBSERVED_ATTRIBUTES,
  },
  section: CHATGPT_SECTION_SITE,
  hideFiled: CHATGPT_HIDE_FILED,
  guide: {
    id: CHATGPT_FOLDERS_GUIDE_ID,
    debugEvent: CHATGPT_FOLDERS_GUIDE_DEBUG_EVENT,
    titleKey: 'chatgptFoldersCoachmarkTitle',
    bodyKey: 'chatgptFoldersCoachmarkBody',
  },
  messages: {
    hint: 'chatgptFoldersHint',
    added: 'chatgptFoldersAdded',
    alreadyFiled: 'chatgptFoldersAlreadyFiled',
    untitled: 'chatgptFoldersUntitled',
    noConversation: 'chatgptFoldersNoConversation',
  },
  transfer: {
    export: exportChatGptFolders,
    filename: () => chatgptFolderExportFilename(),
  },
  native: {
    rename: openNativeRename,
    createMoveMenu: (options) => new ChatGptMoveMenu(options),
    rowAt: (target) => sidebarConversationAt(target),
  },
};
