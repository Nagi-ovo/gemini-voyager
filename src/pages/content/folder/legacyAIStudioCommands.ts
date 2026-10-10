/** AI Studio's legacy edits, preserving its live draft and caller-owned save boundaries. */
import {
  type EditOutcome,
  type FolderCommands,
  NOOP,
  type OpOf,
  type FolderEditBody,
  UNCONFIRMED,
  failed,
} from '@/features/folder/commands/folderCommands';
import { applyFolderOp } from '@/features/folder/owner/applyFolderOp';
import { rejected } from '@/features/folder/owner/folderOps';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';

import type { FolderRepository } from './FolderRepository';
import { applyNativePromptTitles } from './aistudioPromptHistory';
import {
  addFolder,
  deleteFolder,
  placePrompt,
  removeConversation,
  renameFolder,
  toggleFolderExpanded,
  toggleFolderPinned,
} from './aistudioTree';

type Kind = FolderEditBody['kind'];
type Handler<K extends Kind> = (body: OpOf<K>) => EditOutcome | Promise<EditOutcome>;

export function createLegacyAIStudioCommands(
  repository: Pick<FolderRepository, 'data' | 'canEdit' | 'saveData' | 'replaceData' | 'session'>,
  hooks: {
    /** Existing tree save then render; no-op edits never call it. */
    commit: () => Promise<void>;
    /** Refresh archived rows only when the draft's original session is still live. */
    onDraftSettled: () => void;
  },
): FolderCommands {
  const unsupported = () => rejected('unsupported');
  const edit = (change: () => boolean): EditOutcome => {
    if (!repository.canEdit) return failed('read_only');
    if (!change()) return NOOP;
    void hooks.commit();
    return UNCONFIRMED;
  };
  const folderOf = (folderId: string) =>
    repository.data.folders.find((folder) => folder.id === folderId);
  const handlers: { [K in Kind]: Handler<K> } = {
    createFolder: ({ folderId, name, parentId }) =>
      edit(() => addFolder(repository.data, { id: folderId, name, parentId, at: Date.now() })),
    renameFolder: ({ folderId, name }) =>
      edit(() => renameFolder(repository.data, folderId, name, Date.now())),
    removeFolder: ({ folderId }) => edit(() => deleteFolder(repository.data, folderId)),
    removeConversations: ({ folderId, ids }) =>
      edit(() => {
        let changed = false;
        for (const id of ids) if (removeConversation(repository.data, folderId, id)) changed = true;
        return changed;
      }),
    setConversationStarred: (body) =>
      edit(() => {
        const policy = FOLDER_SITE_POLICIES.aistudio;
        const { data, outcome } = applyFolderOp(repository.data, body, policy, Date.now());
        if (outcome.kind !== 'saved') return false;
        repository.data = data;
        return true;
      }),
    setFolderPinned: ({ folderId, pinned }) =>
      edit(() => {
        const folder = folderOf(folderId);
        return !!folder && !!folder.pinned !== pinned
          ? toggleFolderPinned(repository.data, folderId)
          : false;
      }),
    setFolderExpanded: ({ folderId, expanded }) =>
      edit(() => {
        const folder = folderOf(folderId);
        return !!folder && folder.isExpanded !== expanded
          ? toggleFolderExpanded(repository.data, folderId)
          : false;
      }),
    placeAIStudioPrompt: ({ prompt, target, untitledTitle, at }) => {
      // The /library path stages even before save can check edit rights.
      repository.data = placePrompt(repository.data, { ...prompt, type: 'conversation' }, target, {
        untitledTitle,
        at,
      });
      return UNCONFIRMED;
    },
    ensureDefaultAIStudioFolder: ({ folderId, name, at }) => {
      if (repository.data.folders.length) return NOOP;
      addFolder(repository.data, { id: folderId, name, parentId: null, at });
      return UNCONFIRMED;
    },
    saveCurrentData: async () =>
      (await repository.saveData()) ? { kind: 'saved' } : failed('storage_error'),
    syncNativeSidebarTitles: async () => {
      if (!repository.canEdit) return failed('read_only');
      if (!applyNativePromptTitles(repository.data, Date.now())) return NOOP;
      await hooks.commit();
      return UNCONFIRMED;
    },
    moveFolder: unsupported,
    setFolderColor: unsupported,
    setFolderInstructions: unsupported,
    addConversations: unsupported,
    moveConversations: unsupported,
    reorderConversations: unsupported,
    removeConversationEverywhere: unsupported,
    renameConversation: unsupported,
    syncNativeTitles: unsupported,
    restoreNativeTitle: unsupported,
    setConversationGem: unsupported,
    markConversationOpened: unsupported,
    setConversationActivity: unsupported,
    dropConversations: unsupported,
    bufferNativeTitle: unsupported,
    flushNativeTitles: unsupported,
  };

  return {
    status: () => (repository.canEdit ? 'ready' : 'read_only'),
    view: () => repository.data,
    run: (body) => {
      const handler = handlers[body.kind] as Handler<Kind>;
      return Promise.resolve(handler(body as never));
    },
    runBulk: async (body) => {
      if (body.kind !== 'commitPreparedData') return unsupported();
      const session = repository.session;
      if (!session || !repository.canEdit) return failed('read_only');
      try {
        const saved = await repository.replaceData(
          body.data,
          body.prompts ? { gvPromptItems: body.prompts } : undefined,
        );
        return saved ? { kind: 'saved' } : failed('storage_error');
      } finally {
        if (repository.session === session) hooks.onDraftSettled();
      }
    },
    flush: () => Promise.resolve(),
  };
}
