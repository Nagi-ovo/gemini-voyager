import { type Mock, vi } from 'vitest';

import type { ConversationReference, Folder, FolderData } from '../../types';
import type { TreeActions } from '../shared';

export function folder(id: string, name: string, extra: Partial<Folder> = {}): Folder {
  return { id, name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1, ...extra };
}

export function conv(
  id: string,
  title: string,
  extra: Partial<ConversationReference> = {},
): ConversationReference {
  return { conversationId: id, title, url: `https://example.test/c/${id}`, addedAt: 1, ...extra };
}

/** Hooks for a site's own menus, selection and drags; added per case like the conversation confirm. */
type SiteHooks =
  | 'onRenameConversation'
  | 'onConversationMenu'
  | 'folderMenuItems'
  | 'onConversationPress'
  | 'interceptConversationClick'
  | 'onConversationDragStart'
  | 'onConversationDragEnd';

type DataCallbacks = Required<
  Omit<TreeActions, 'confirmConversationRemoval' | 'onDrop' | 'acceptsDrag' | SiteHooks>
>;

/**
 * Every data callback of `TreeActions` as a spy, and the folder delete confirm,
 * which never answers; the conversation confirm and drop hooks are added per case.
 */
export type ActionSpies = { [K in keyof DataCallbacks]: Mock<DataCallbacks[K]> };

export function spyActions(): ActionSpies {
  return {
    onNavigate: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    confirmFolderRemoval: vi.fn(),
    onRemoveConversation: vi.fn(),
    onToggleStar: vi.fn(),
    onToggleFolderPinned: vi.fn(),
    onToggleFolderExpanded: vi.fn(),
    onMoveConversation: vi.fn(),
    onSetFolderColor: vi.fn(),
    onAddCurrentConversation: vi.fn(),
  };
}

/** The spies that fired, by name. */
export function calledSpies(actions: ActionSpies): string[] {
  return Object.entries(actions)
    .filter(([, spy]) => spy.mock.calls.length > 0)
    .map(([name]) => name);
}

/** Recursively freezes `value`, so any write into it throws in strict-mode test code. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
  }
  return value;
}

/**
 * One tree with every placement the stored data can hold. Name, sortIndex and
 * creation order all disagree, so each consumer's ordering shows itself:
 *
 * - Zeta, Alpha and pinned Mu at the root; Orphan's parent is gone;
 * - Alpha › Child › Grandchild, deeper than a user can create (stored data can);
 * - Loop X and Loop Y name each other as parent;
 * - Alpha holds three chats stored oldest first with the starred one in the middle;
 * - one chat is filed at the root.
 */
export function placementFixture(rootBucketId: string): FolderData {
  return {
    folders: [
      folder('z', 'Zeta', { sortIndex: 0, createdAt: 3 }),
      folder('a', 'Alpha', { sortIndex: 1, createdAt: 1 }),
      folder('m', 'Mu', { sortIndex: 2, createdAt: 2, pinned: true }),
      folder('c', 'Child', { parentId: 'a', sortIndex: 0, createdAt: 4 }),
      folder('g', 'Grandchild', { parentId: 'c', sortIndex: 0, createdAt: 5 }),
      folder('o', 'Orphan', { parentId: 'gone', sortIndex: 3, createdAt: 6 }),
      folder('x', 'Loop X', { parentId: 'y', sortIndex: 4, createdAt: 7 }),
      folder('y', 'Loop Y', { parentId: 'x', sortIndex: 0, createdAt: 8 }),
    ],
    folderContents: {
      z: [],
      a: [
        conv('old', 'Oldest', { addedAt: 1 }),
        conv('star', 'Starred', { addedAt: 2, starred: true }),
        conv('new', 'Newest', { addedAt: 3 }),
      ],
      m: [],
      c: [],
      g: [conv('deep', 'Deep chat')],
      o: [],
      x: [],
      y: [],
      [rootBucketId]: [conv('loose', 'Loose chat')],
    },
  };
}

/** Two root folders; Alpha holds Shared and Solo, Beta also holds Shared, and so does the root. */
export function sharedFixture(rootBucketId: string): FolderData {
  return {
    folders: [
      folder('a', 'Alpha', { sortIndex: 0, createdAt: 1 }),
      folder('b', 'Beta', { sortIndex: 1, createdAt: 2 }),
    ],
    folderContents: {
      a: [conv('shared', 'Shared'), conv('solo', 'Solo', { addedAt: 0 })],
      b: [conv('shared', 'Shared')],
      [rootBucketId]: [conv('shared', 'Shared')],
    },
  };
}
