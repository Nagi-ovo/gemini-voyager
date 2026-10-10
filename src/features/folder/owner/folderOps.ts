import type { ConversationReference } from '@/core/types/folder';
import {
  type ConversationSortMode,
  isInheritedObjectKey,
} from '@/features/folder/model/folderData';
import type { ImportResult } from '@/features/folder/types/import-export';
import type { TranslationKey } from '@/utils/translations';

import type { AddVia } from './folderOwnerPolicy';

/** A folder id, or the site's root bucket id. */
export type BucketId = string;

/** What a client knows about a conversation that may be new to the folders. */
export type ConversationSeed = Pick<ConversationReference, 'conversationId' | 'title' | 'url'> &
  Partial<Pick<ConversationReference, 'isGem' | 'gemId' | 'lastTurnAt'>>;

export type FolderOpBody =
  | { kind: 'createFolder'; folderId: string; name: string; parentId: string | null }
  | { kind: 'renameFolder'; folderId: string; name: string }
  | { kind: 'removeFolder'; folderId: string }
  | { kind: 'moveFolder'; folderId: string; parentId: string | null; index?: number }
  | { kind: 'setFolderColor'; folderId: string; color: string | null }
  | { kind: 'setFolderPinned'; folderId: string; pinned: boolean }
  | { kind: 'setFolderExpanded'; folderId: string; expanded: boolean }
  | { kind: 'setFolderInstructions'; folderId: string; instructions: string | null }
  | { kind: 'addConversations'; target: BucketId; seeds: ConversationSeed[]; via: AddVia }
  | {
      kind: 'moveConversations';
      ids: string[];
      from: BucketId;
      target: BucketId;
      via: 'tree-drag' | 'panel-menu';
      index?: number;
      sortMode?: ConversationSortMode;
    }
  | {
      kind: 'reorderConversations';
      ids: string[];
      from: BucketId | null;
      target: BucketId;
      index: number;
      sortMode: ConversationSortMode;
      ensure?: ConversationSeed[];
    }
  | { kind: 'removeConversations'; folderId: BucketId; ids: string[] }
  | { kind: 'removeConversationEverywhere'; conversationId: string }
  | {
      kind: 'setConversationStarred';
      conversationId: string;
      starred: boolean;
      scope: { folderId: BucketId } | 'everywhere';
    }
  | { kind: 'renameConversation'; folderId: BucketId; conversationId: string; title: string }
  | { kind: 'syncNativeTitles'; entries: Array<{ conversationId: string; title: string }> }
  | { kind: 'restoreNativeTitle'; conversationId: string; nativeTitle: string | null }
  | { kind: 'setConversationGem'; hexId: string; gemId: string }
  | { kind: 'markConversationOpened'; conversationId: string; at: number }
  | {
      kind: 'setConversationActivity';
      entries: Array<{ conversationId: string; lastTurnAt: number }>;
    }
  // Bulk: never pending keys; applied by the owner from P3 on.
  | {
      kind: 'importFile';
      payload: unknown;
      strategy: 'merge' | 'replace';
      source: 'file' | 'paste' | 'page-copy' | 'page-backup' | 'legacy-sync' | 'durable-mirror';
    }
  | { kind: 'restoreBackup'; slot: 'last' | 'prior' | 'preBulk' | 'foreign' | 'quarantine' }
  | { kind: 'cloudMerge'; mode: 'merge' | 'overwrite'; payload: unknown };

export type FolderOpKind = FolderOpBody['kind'];

/** The client adds the envelope; bodies never carry it. */
export interface SeqOp {
  seq: number;
  body: FolderOpBody;
}

export const DESTRUCTIVE_OP_KINDS: ReadonlySet<FolderOpKind> = new Set<FolderOpKind>([
  'removeFolder',
  'removeConversations',
  'removeConversationEverywhere',
  'importFile',
  'restoreBackup',
  'cloudMerge',
]);

export type RejectReason =
  | 'folder_missing'
  | 'source_missing'
  | 'target_missing'
  | 'conversation_missing'
  | 'name_invalid'
  | 'cycle'
  | 'depth_limit'
  | 'invalid_payload'
  | 'payload_too_large'
  | 'backup_failed'
  | 'discarded_by_user'
  | 'not_reapplied'
  /** A kind this build's owner does not apply yet (the cloudMerge bundle, P3). */
  | 'unsupported';

/** A terminal outcome: what the client delivers to the edit's caller. */
export type OpOutcome =
  | { kind: 'saved'; stats?: ImportResult; restoredFrom?: string }
  | { kind: 'unchanged'; reason: 'noop' | 'present' }
  | { kind: 'rejected'; reason: RejectReason; messageKey: TranslationKey }
  /** A bundle (cloud merge) abandoned before all of it landed; never replayed (addendum P3P4 R4.2). */
  | { kind: 'interrupted'; messageKey: TranslationKey }
  | { kind: 'expired' };

/**
 * Stored by the owner per processed seq until the client acknowledges it. A
 * seq inside an open bundle stays `bundle_pending` until the bundle settles as
 * `saved` or `interrupted` (R4.1); it is never terminal, so it is never
 * delivered and never dropped by an ack.
 */
export type StoredOutcome = OpOutcome | { kind: 'bundle_pending'; txId: string };

export const INTERRUPTED: OpOutcome = {
  kind: 'interrupted',
  messageKey: 'folder_cloud_merge_interrupted',
};

export const isTerminal = (outcome: StoredOutcome): outcome is OpOutcome =>
  outcome.kind !== 'bundle_pending';

export function rejected(reason: RejectReason): OpOutcome {
  // Specific notices per reason arrive with the UI that shows them (P2); until then one generic key.
  return { kind: 'rejected', reason, messageKey: 'folder_save_error' };
}

// ---- runtime schema: every body is validated, including drained ones

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
/** A non-empty id that can be an own property of a plain object. */
const isId = (value: unknown): value is string =>
  isString(value) && value.length > 0 && !isInheritedObjectKey(value);
const isNullableId = (value: unknown): boolean => value === null || isId(value);
const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isIndex = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0;
const isOptional = (value: unknown, check: (v: unknown) => boolean): boolean =>
  value === undefined || check(value);
const isSortMode = (value: unknown): boolean => value === 'manual' || value === 'recent';
const isIdList = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0 && value.every(isId);
const isListOf = (value: unknown, check: (item: Fields) => boolean): boolean =>
  Array.isArray(value) && value.length > 0 && value.every((item) => isObject(item) && check(item));

const isSeed = (seed: Fields): boolean =>
  isId(seed.conversationId) &&
  isString(seed.title) &&
  isString(seed.url) &&
  isOptional(seed.isGem, (v) => typeof v === 'boolean') &&
  isOptional(seed.gemId, isString) &&
  isOptional(seed.lastTurnAt, isTime);

const BODY_CHECKS: Record<FolderOpKind, (body: Fields) => boolean> = {
  createFolder: (b) => isId(b.folderId) && isString(b.name) && isNullableId(b.parentId),
  renameFolder: (b) => isId(b.folderId) && isString(b.name),
  removeFolder: (b) => isId(b.folderId),
  moveFolder: (b) => isId(b.folderId) && isNullableId(b.parentId) && isOptional(b.index, isIndex),
  setFolderColor: (b) => isId(b.folderId) && (b.color === null || isString(b.color)),
  setFolderPinned: (b) => isId(b.folderId) && typeof b.pinned === 'boolean',
  setFolderExpanded: (b) => isId(b.folderId) && typeof b.expanded === 'boolean',
  setFolderInstructions: (b) =>
    isId(b.folderId) && (b.instructions === null || isString(b.instructions)),
  addConversations: (b) =>
    isId(b.target) &&
    isListOf(b.seeds, isSeed) &&
    ['native-menu', 'project', 'picker', 'outside-drop'].includes(b.via as string),
  moveConversations: (b) =>
    isIdList(b.ids) &&
    isId(b.from) &&
    isId(b.target) &&
    (b.via === 'tree-drag' || b.via === 'panel-menu') &&
    isOptional(b.index, isIndex) &&
    isOptional(b.sortMode, isSortMode),
  reorderConversations: (b) =>
    isIdList(b.ids) &&
    isNullableId(b.from) &&
    isId(b.target) &&
    isIndex(b.index) &&
    isSortMode(b.sortMode) &&
    isOptional(b.ensure, (v) => isListOf(v, isSeed)),
  removeConversations: (b) => isId(b.folderId) && isIdList(b.ids),
  removeConversationEverywhere: (b) => isId(b.conversationId),
  setConversationStarred: (b) =>
    isId(b.conversationId) &&
    typeof b.starred === 'boolean' &&
    (b.scope === 'everywhere' || (isObject(b.scope) && isId(b.scope.folderId))),
  renameConversation: (b) => isId(b.folderId) && isId(b.conversationId) && isString(b.title),
  syncNativeTitles: (b) => isListOf(b.entries, (e) => isId(e.conversationId) && isString(e.title)),
  restoreNativeTitle: (b) =>
    isId(b.conversationId) && (b.nativeTitle === null || isString(b.nativeTitle)),
  setConversationGem: (b) => isId(b.hexId) && isId(b.gemId),
  markConversationOpened: (b) => isId(b.conversationId) && isTime(b.at),
  setConversationActivity: (b) =>
    isListOf(b.entries, (e) => isId(e.conversationId) && isTime(e.lastTurnAt)),
  importFile: (b) =>
    (b.strategy === 'merge' || b.strategy === 'replace') &&
    ['file', 'paste', 'page-copy', 'page-backup', 'legacy-sync', 'durable-mirror'].includes(
      b.source as string,
    ),
  restoreBackup: (b) =>
    ['last', 'prior', 'preBulk', 'foreign', 'quarantine'].includes(b.slot as string),
  cloudMerge: (b) => b.mode === 'merge' || b.mode === 'overwrite',
};

/** The body if it matches the op schema, else `null`. Pending keys and messages are untrusted input. */
export function parseFolderOpBody(value: unknown): FolderOpBody | null {
  if (!isObject(value) || !isString(value.kind) || !Object.hasOwn(BODY_CHECKS, value.kind)) {
    return null;
  }
  return BODY_CHECKS[value.kind as FolderOpKind](value) ? (value as FolderOpBody) : null;
}
