/**
 * The core folder policy of each site that owns a folder bucket: everything
 * that decides what is written, where, and in which shape. A site's
 * `site.json` `folders` section only says where things are on the page; it can
 * never reach a key, a bucket, an account rule, a Drive file or an op this
 * table refuses, and neither can a plugin's params or settings.
 *
 * A row references today's objects rather than copying them
 * (`FOLDER_PLATFORMS`, `FOLDER_SITE_POLICIES`, each `PlatformFolderConfig`),
 * and adds what the folders primitive will need to know per site. Every value
 * is today's: `__tests__/folderSiteTable.snapshot.json` pins them, because a
 * changed key or namespace silently orphans the folders users already have.
 * Frozen, and never derived for a site that has no row.
 */
import { type StorageKey, StorageKeys } from '@/core/types/common';
import type { FolderEditBody } from '@/features/folder/commands/folderCommands';
import {
  FOLDER_SITE_POLICIES,
  type FolderSitePolicy,
} from '@/features/folder/owner/folderOwnerPolicy';
import {
  FOLDER_PLATFORMS,
  type FolderPlatform,
  type FolderPlatformDefinition,
} from '@/features/folder/platforms';
import type { ImportStrategy } from '@/features/folder/types/import-export';
import {
  AISTUDIO_FOLDER_CONFIG,
  GEMINI_FOLDER_CONFIG,
  type PlatformFolderConfig,
} from '@/pages/content/folder/platformFolderConfig';
import {
  CHATGPT_FOLDER_CONFIG,
  CLAUDE_FOLDER_CONFIG,
  DEEPSEEK_FOLDER_CONFIG,
} from '@/pages/content/folder/pluginSiteFolderConfigs';
import type { TranslationKey } from '@/utils/translations';

export type FolderEditKind = FolderEditBody['kind'];

export interface FolderSiteTree {
  /** `sorted`: pinned, then `sortIndex`, then name. `created`: pinned, then oldest first. */
  readonly folderOrder: 'sorted' | 'created';
  /** `sorted`: starred first, then the sort mode. `stored`: the stored order. */
  readonly conversationOrder: 'sorted' | 'stored';
  /** The heading of root conversations after the folders; `null`: first, unlabelled. */
  readonly rootSectionLabel: TranslationKey | null;
  /** Edits the site refuses: they would write what it never wrote (AI Studio's `sortIndex`). */
  readonly refusedOps: readonly FolderEditKind[];
}

export interface FolderSitePrefs {
  /** `split`: separate keys, read in their own formats. `record`: one panel and one section record. */
  readonly codec: 'split' | 'record';
  readonly keys: Readonly<Record<string, StorageKey>>;
}

/** The i18n keys of the shared folder UI's site texts. */
export interface FolderSiteMessages {
  readonly hint: TranslationKey;
  readonly added: TranslationKey;
  readonly alreadyFiled: TranslationKey;
  readonly untitled: TranslationKey;
  readonly noConversation: TranslationKey;
  readonly guideTitle: TranslationKey;
  readonly guideBody: TranslationKey;
}

export interface FolderSiteRow {
  readonly site: FolderPlatform;
  /** Keys, hosts, Drive file, sync times, backup namespace and what sync carries. */
  readonly platform: FolderPlatformDefinition;
  /** Identity keys, placement, single bucket and move timestamps the owner applies. */
  readonly policy: FolderSitePolicy;
  /** Normalize, prune, recovery, retry, empty-overwrite check and legacy migration. */
  readonly config: PlatformFolderConfig;
  /**
   * `local`: `chrome.storage.local` only (`AIStudioFolderStorageAdapter`).
   * `local+pageMirror`: also the page's `localStorage` (`createFolderStorageAdapter`;
   * on Safari it falls back to `localStorage` only when the extension write fails).
   */
  readonly storage: 'local' | 'local+pageMirror';
  /** `route`: `<site>:conv:<id>` from the route; `gemini`: `c_`/hex aliases; `aistudio`: prompt ids. */
  readonly identity: 'route' | 'gemini' | 'aistudio';
  readonly tree: FolderSiteTree;
  readonly prefs: FolderSitePrefs;
  /**
   * What stamps a conversation's last activity. `sends`: the send tracker, on a
   * site whose adapter can tell turns apart; `extension`: Gemini's history
   * timestamps; `none`: AI Studio refuses the stamp.
   */
  readonly activity: 'sends' | 'extension' | 'none';
  /** `null` where the site's own extension owns its texts (Gemini, AI Studio). */
  readonly messages: FolderSiteMessages | null;
  /** The sidebar guide's id, stored in the seen-guides list; `null` for none. */
  readonly guideId: string | null;
  readonly importStrategies: readonly ImportStrategy[];
  /** Packaged site code beside the primitive, chosen by site id. */
  readonly extension: 'gemini' | 'aistudio' | null;
}

/** The edits ChatGPT, Claude and DeepSeek refuse (`siteFolderCommands.ts`). */
const CATALOG_SITE_REFUSED_OPS: readonly FolderEditKind[] = [
  'placeAIStudioPrompt',
  'saveCurrentData',
  'ensureDefaultAIStudioFolder',
  'bufferNativeTitle',
  'flushNativeTitles',
  'syncNativeSidebarTitles',
  'setFolderInstructions',
  'reorderConversations',
  'removeConversationEverywhere',
  'renameConversation',
  'setConversationGem',
];

const CATALOG_SITE_TREE: FolderSiteTree = {
  folderOrder: 'sorted',
  conversationOrder: 'sorted',
  rootSectionLabel: null,
  refusedOps: CATALOG_SITE_REFUSED_OPS,
};

function catalogSiteMessages(
  noConversation: TranslationKey,
  guideBody: TranslationKey,
): FolderSiteMessages {
  return {
    hint: 'chatgptFoldersHint',
    added: 'chatgptFoldersAdded',
    alreadyFiled: 'chatgptFoldersAlreadyFiled',
    untitled: 'chatgptFoldersUntitled',
    noConversation,
    guideTitle: 'chatgptFoldersCoachmarkTitle',
    guideBody,
  };
}

function freezeRow(row: FolderSiteRow): FolderSiteRow {
  return Object.freeze({
    ...row,
    tree: Object.freeze({ ...row.tree, refusedOps: Object.freeze([...row.tree.refusedOps]) }),
    prefs: Object.freeze({ ...row.prefs, keys: Object.freeze({ ...row.prefs.keys }) }),
    messages: row.messages ? Object.freeze({ ...row.messages }) : null,
    importStrategies: Object.freeze([...row.importStrategies]),
  });
}

export const FOLDER_SITE_TABLE: Readonly<Record<FolderPlatform, FolderSiteRow>> = Object.freeze({
  gemini: freezeRow({
    site: 'gemini',
    platform: FOLDER_PLATFORMS.gemini,
    policy: FOLDER_SITE_POLICIES.gemini,
    config: GEMINI_FOLDER_CONFIG,
    storage: 'local+pageMirror',
    identity: 'gemini',
    tree: {
      folderOrder: 'sorted',
      conversationOrder: 'sorted',
      rootSectionLabel: null,
      // `legacyFolderCommands.ts`
      refusedOps: ['placeAIStudioPrompt', 'saveCurrentData', 'ensureDefaultAIStudioFolder'],
    },
    prefs: {
      codec: 'split',
      keys: {
        collapsed: StorageKeys.FOLDERS_COLLAPSED,
        viewMode: StorageKeys.FOLDERS_VIEW_MODE,
        hidden: StorageKeys.FOLDERS_HIDDEN,
        anchor: StorageKeys.FOLDERS_ANCHOR,
        filterUserOnly: StorageKeys.GV_FOLDER_FILTER_USER_ONLY,
        search: StorageKeys.FOLDER_SEARCH_ENABLED,
        treeIndent: StorageKeys.GV_FOLDER_TREE_INDENT,
        project: StorageKeys.FOLDER_PROJECT_ENABLED,
        conversationSortMode: StorageKeys.FOLDER_CONVERSATION_SORT_MODE,
        floatingMode: StorageKeys.FOLDER_FLOATING_MODE_ENABLED,
        floatingOpenOnStart: StorageKeys.FOLDER_FLOATING_OPEN_ON_START,
        floatingPos: StorageKeys.FOLDER_FLOATING_POS,
        floatingSize: StorageKeys.FOLDER_FLOATING_SIZE,
        floatingFabPos: StorageKeys.FOLDER_FLOATING_FAB_POS,
        hideFiled: StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS,
      },
    },
    activity: 'extension',
    messages: null,
    guideId: null,
    importStrategies: ['merge', 'overwrite'],
    extension: 'gemini',
  }),
  aistudio: freezeRow({
    site: 'aistudio',
    platform: FOLDER_PLATFORMS.aistudio,
    policy: FOLDER_SITE_POLICIES.aistudio,
    config: AISTUDIO_FOLDER_CONFIG,
    storage: 'local',
    identity: 'aistudio',
    tree: {
      folderOrder: 'created',
      conversationOrder: 'stored',
      rootSectionLabel: 'folder_uncategorized',
      // `session/aistudioCommands.ts` rejects each of these.
      refusedOps: [
        'moveFolder',
        'setFolderColor',
        'setFolderInstructions',
        'addConversations',
        'moveConversations',
        'reorderConversations',
        'removeConversationEverywhere',
        'renameConversation',
        'syncNativeTitles',
        'restoreNativeTitle',
        'setConversationGem',
        'markConversationOpened',
        'setConversationActivity',
        'dropConversations',
        'bufferNativeTitle',
        'flushNativeTitles',
      ],
    },
    prefs: {
      codec: 'split',
      keys: {
        hideFiled: StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO,
        hideFiledNudgeShown: StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO,
      },
    },
    activity: 'none',
    messages: null,
    guideId: null,
    // `aistudioTransfer.ts` merges only; no AI Studio UI offers an import yet.
    importStrategies: ['merge'],
    extension: 'aistudio',
  }),
  chatgpt: freezeRow({
    site: 'chatgpt',
    platform: FOLDER_PLATFORMS.chatgpt,
    policy: FOLDER_SITE_POLICIES.chatgpt,
    config: CHATGPT_FOLDER_CONFIG,
    storage: 'local',
    identity: 'route',
    tree: CATALOG_SITE_TREE,
    prefs: {
      codec: 'record',
      keys: {
        panel: StorageKeys.CHATGPT_FOLDER_PANEL,
        section: StorageKeys.CHATGPT_FOLDER_SECTION,
      },
    },
    activity: 'sends',
    messages: catalogSiteMessages('chatgptFoldersNoConversation', 'chatgptFoldersCoachmarkBody'),
    guideId: 'chatgpt-folders-sidebar-intro-v1',
    importStrategies: ['merge'],
    extension: null,
  }),
  claude: freezeRow({
    site: 'claude',
    platform: FOLDER_PLATFORMS.claude,
    policy: FOLDER_SITE_POLICIES.claude,
    config: CLAUDE_FOLDER_CONFIG,
    storage: 'local',
    identity: 'route',
    tree: CATALOG_SITE_TREE,
    prefs: {
      codec: 'record',
      keys: {
        panel: StorageKeys.CLAUDE_FOLDER_PANEL,
        section: StorageKeys.CLAUDE_FOLDER_SECTION,
      },
    },
    // Live once Claude's site.json carries `turnKeyAttributes`; today it does not.
    activity: 'sends',
    messages: catalogSiteMessages('siteFoldersNoConversation', 'claudeFoldersCoachmarkBody'),
    guideId: 'claude-folders-sidebar-intro-v1',
    importStrategies: ['merge'],
    extension: null,
  }),
  deepseek: freezeRow({
    site: 'deepseek',
    platform: FOLDER_PLATFORMS.deepseek,
    policy: FOLDER_SITE_POLICIES.deepseek,
    config: DEEPSEEK_FOLDER_CONFIG,
    storage: 'local',
    identity: 'route',
    tree: CATALOG_SITE_TREE,
    prefs: {
      codec: 'record',
      keys: {
        panel: StorageKeys.DEEPSEEK_FOLDER_PANEL,
        section: StorageKeys.DEEPSEEK_FOLDER_SECTION,
      },
    },
    // Live once DeepSeek's site.json carries `turnKeyAttributes`; today it does not.
    activity: 'sends',
    messages: catalogSiteMessages('siteFoldersNoConversation', 'deepseekFoldersCoachmarkBody'),
    guideId: 'deepseek-folders-sidebar-intro-v1',
    importStrategies: ['merge'],
    extension: null,
  }),
});

/** The folder policy of the site `siteId` names; `null` for a site without a folder bucket. */
export function folderSiteOf(siteId: string): FolderSiteRow | null {
  return Object.prototype.hasOwnProperty.call(FOLDER_SITE_TABLE, siteId)
    ? FOLDER_SITE_TABLE[siteId as FolderPlatform]
    : null;
}
