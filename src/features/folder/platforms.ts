import { StorageKeys } from '@/core/types/common';
import type { FolderExportPlatform } from '@/core/types/sync';
import { readChatGptFolderExport } from '@/features/folder/sites/chatgptTransfer';
import { CLAUDE_TRANSFER } from '@/features/folder/sites/claudeIdentity';
import { DEEPSEEK_TRANSFER } from '@/features/folder/sites/deepseekIdentity';
import {
  type DerivedFolderPlatform,
  type DerivedFolderPlatformDefinition,
  type DerivedFolderSite,
  type DerivedSyncTimeField,
  deriveFolderSites,
} from '@/features/folder/sites/derivedFolderSites';
import type { FolderExportPayload, ImportStrategy } from '@/features/folder/types/import-export';
import { BUNDLED_SITE_ADAPTERS } from '@/features/plugins/catalog/sites';

export type { DerivedFolderPlatform } from '@/features/folder/sites/derivedFolderSites';

/**
 * The five sites whose folder buckets predate the open registry. Their storage keys, Drive
 * files, sync timestamps and host lists are frozen below, so adding one does not compile until
 * each is defined; the background folder owner and its write authority know only these.
 */
export type FrozenFolderPlatform = 'gemini' | 'aistudio' | 'chatgpt' | 'claude' | 'deepseek';

/**
 * Sites that own a Voyager folder bucket: the frozen five, plus each bundled site whose
 * `site.json` describes its folders (`derivedFolderSites.ts`). Any other site (custom websites)
 * has no folder bucket: helpers return `null` and callers must skip folder storage, backup and sync.
 */
export type FolderPlatform = FrozenFolderPlatform | DerivedFolderPlatform;

export interface FolderPlatformDefinition {
  /** Page hosts whose content scripts own this bucket; the owner and sync trust only these. */
  hosts: readonly string[];
  /** `chrome.storage.local` base key; account isolation appends `:acct:<hash>`. */
  folderStorageKey: string;
  /** `chrome.storage.sync` per-platform account isolation switch. */
  accountIsolationStorageKey: string | null;
  /** Whether folder transfers also carry prompts, settings and plugins. */
  syncsSharedData: boolean;
  /** Tagged files use their site's reader; legacy files retain their unmarked envelope. */
  folderExport: {
    platform: FolderExportPlatform;
    read: (
      value: unknown,
      strategy?: ImportStrategy,
    ) =>
      | { ok: true; payload: FolderExportPayload }
      | { ok: false; reason: 'invalid' | 'wrong-site'; message?: string };
  } | null;
  driveFoldersFileName: string;
  /**
   * Whether this platform's sync also carries its conversation extras: stars, forks, timeline
   * hierarchy and highlights in their account-scoped Drive files.
   */
  syncsConversationExtras: boolean;
  /** `DataBackupService` namespace of the page-side folder backups (`gvBackup_<namespace>_*`). */
  backupNamespace: string;
  /** `SyncState` field and its `chrome.storage.local` key; both are persisted spellings. */
  lastUploadTimeField: string;
  lastUploadTimeStorageKey: string;
  lastSyncTimeField: string;
  lastSyncTimeStorageKey: string;
}

const FROZEN_FOLDER_PLATFORMS = {
  gemini: {
    hosts: ['gemini.google.com', 'business.gemini.google'],
    folderStorageKey: StorageKeys.FOLDER_DATA,
    accountIsolationStorageKey: StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI,
    syncsSharedData: true,
    folderExport: null,
    driveFoldersFileName: 'gemini-voyager-folders.json',
    syncsConversationExtras: true,
    backupNamespace: 'gemini-folders',
    lastUploadTimeField: 'lastUploadTime',
    lastUploadTimeStorageKey: 'gvLastUploadTime',
    lastSyncTimeField: 'lastSyncTime',
    lastSyncTimeStorageKey: 'gvLastSyncTime',
  },
  aistudio: {
    hosts: ['aistudio.google.com', 'aistudio.google.cn'],
    folderStorageKey: StorageKeys.FOLDER_DATA_AISTUDIO,
    accountIsolationStorageKey: StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO,
    syncsSharedData: true,
    folderExport: null,
    driveFoldersFileName: 'gemini-voyager-aistudio-folders.json',
    syncsConversationExtras: false,
    backupNamespace: 'aistudio-folders',
    lastUploadTimeField: 'lastUploadTimeAIStudio',
    lastUploadTimeStorageKey: 'gvLastUploadTimeAIStudio',
    lastSyncTimeField: 'lastSyncTimeAIStudio',
    lastSyncTimeStorageKey: 'gvLastSyncTimeAIStudio',
  },
  chatgpt: {
    // The canonical host only: `chat.openai.com` redirects here, is not in the optional
    // host permissions, and must not write or sync this bucket. Links read from it still open.
    hosts: ['chatgpt.com'],
    folderStorageKey: StorageKeys.FOLDER_DATA_CHATGPT,
    accountIsolationStorageKey: null,
    syncsSharedData: false,
    folderExport: { platform: 'chatgpt', read: readChatGptFolderExport },
    driveFoldersFileName: 'gemini-voyager-chatgpt-folders.json',
    syncsConversationExtras: false,
    backupNamespace: 'chatgpt-folders',
    lastUploadTimeField: 'lastUploadTimeChatGPT',
    lastUploadTimeStorageKey: 'gvLastUploadTimeChatGPT',
    lastSyncTimeField: 'lastSyncTimeChatGPT',
    lastSyncTimeStorageKey: 'gvLastSyncTimeChatGPT',
  },
  // Plugin sites like ChatGPT: one unscoped bucket per browser profile, folders only.
  claude: {
    hosts: ['claude.ai'],
    folderStorageKey: StorageKeys.FOLDER_DATA_CLAUDE,
    accountIsolationStorageKey: null,
    syncsSharedData: false,
    folderExport: { platform: 'claude', read: CLAUDE_TRANSFER.read },
    driveFoldersFileName: 'gemini-voyager-claude-folders.json',
    syncsConversationExtras: false,
    backupNamespace: 'claude-folders',
    lastUploadTimeField: 'lastUploadTimeClaude',
    lastUploadTimeStorageKey: 'gvLastUploadTimeClaude',
    lastSyncTimeField: 'lastSyncTimeClaude',
    lastSyncTimeStorageKey: 'gvLastSyncTimeClaude',
  },
  deepseek: {
    hosts: ['chat.deepseek.com'],
    folderStorageKey: StorageKeys.FOLDER_DATA_DEEPSEEK,
    accountIsolationStorageKey: null,
    syncsSharedData: false,
    folderExport: { platform: 'deepseek', read: DEEPSEEK_TRANSFER.read },
    driveFoldersFileName: 'gemini-voyager-deepseek-folders.json',
    syncsConversationExtras: false,
    backupNamespace: 'deepseek-folders',
    lastUploadTimeField: 'lastUploadTimeDeepSeek',
    lastUploadTimeStorageKey: 'gvLastUploadTimeDeepSeek',
    lastSyncTimeField: 'lastSyncTimeDeepSeek',
    lastSyncTimeStorageKey: 'gvLastSyncTimeDeepSeek',
  },
} as const satisfies Readonly<Record<FrozenFolderPlatform, FolderPlatformDefinition>>;

/** The frozen five, in registry order: the sites the background folder owner may know. */
export const FROZEN_FOLDER_PLATFORM_IDS = Object.keys(
  FROZEN_FOLDER_PLATFORMS,
) as FrozenFolderPlatform[];

/** The bundled sites that derive a bucket; built once, from data packaged with this build. */
export const DERIVED_FOLDER_SITES: ReadonlyMap<DerivedFolderPlatform, DerivedFolderSite> =
  deriveFolderSites(BUNDLED_SITE_ADAPTERS, FROZEN_FOLDER_PLATFORMS);

/** Every folder platform's definition: the frozen five first, then the derived sites. */
export const FOLDER_PLATFORMS: typeof FROZEN_FOLDER_PLATFORMS &
  Readonly<Record<DerivedFolderPlatform, DerivedFolderPlatformDefinition>> = Object.freeze({
  ...FROZEN_FOLDER_PLATFORMS,
  ...Object.fromEntries([...DERIVED_FOLDER_SITES].map(([id, site]) => [id, site.definition])),
});

/** The per-platform `SyncState` transfer-time fields, as the registry spells them. */
export type SyncTimeField =
  | (typeof FROZEN_FOLDER_PLATFORMS)[FrozenFolderPlatform][
      | 'lastUploadTimeField'
      | 'lastSyncTimeField']
  | DerivedSyncTimeField;

export type AccountScopedFolderPlatform = {
  [
    P in FrozenFolderPlatform
  ]: (typeof FROZEN_FOLDER_PLATFORMS)[P]['accountIsolationStorageKey'] extends null ? never : P;
}[FrozenFolderPlatform];

export function supportsAccountIsolation(
  platform: FolderPlatform,
): platform is AccountScopedFolderPlatform {
  return FOLDER_PLATFORMS[platform].accountIsolationStorageKey !== null;
}

/** Every folder platform, frozen and derived, in registry order. */
export const FOLDER_PLATFORM_IDS = Object.keys(FOLDER_PLATFORMS) as FolderPlatform[];

export function isFolderPlatform(value: unknown): value is FolderPlatform {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FOLDER_PLATFORMS, value);
}

/** The folder platform that owns `hostname`, or `null` for every other site. */
export function getFolderPlatformForHost(
  hostname: string | null | undefined,
): FolderPlatform | null {
  if (!hostname) return null;
  const normalized = hostname.toLowerCase();
  return (
    FOLDER_PLATFORM_IDS.find((platform) =>
      FOLDER_PLATFORMS[platform].hosts.some((host) => host === normalized),
    ) ?? null
  );
}
