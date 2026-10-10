/**
 * Drag and drop, the shadow-root boundary, and the data invariant of the shared
 * folder tree in each consumer, pinned ahead of moving its internals to
 * open-source packages. Rows can be dragged onto folders (a move). ChatGPT's
 * section also reorders and drags folders through its own drop hook; its
 * drags are pinned against its store in chatgptFolders' `sectionDrag.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AISTUDIO_PROMPT_DRAG_TYPES } from '../../aistudioTree';
import type { FolderData } from '../../types';
import type { TreeActions } from '../shared';
import { CONSUMERS, type ConsumerId, destroyMountedTrees, mountConsumer } from './treeConsumers';
import {
  fakeTransfer,
  label,
  menuItem,
  openMenu,
  press,
  pressEscape,
  settle,
  topLevelHost,
  treeDriver,
} from './treeDriver';
import {
  calledSpies,
  conv,
  deepFreeze,
  folder,
  placementFixture,
  sharedFixture,
  spyActions,
} from './treeFixtures';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

afterEach(() => {
  destroyMountedTrees();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const rootOf = (consumer: ConsumerId) =>
  consumer === 'aistudio' ? '__uncategorized__' : '__root_conversations__';

/** What AI Studio's own binding puts on a drag from a native prompt row (no source folder). */
function nativeRow(conversationId: string, title: string, url?: string) {
  const json = JSON.stringify({
    type: 'conversation',
    conversationId,
    title,
    url: url ?? `https://aistudio.google.com/prompts/${conversationId}`,
  });
  return fakeTransfer({ 'application/json': json, 'text/plain': json });
}

/**
 * The tree's drop hooks as each consumer is wired in production: AI Studio takes
 * every drop through `onDrop` (it parses the payload itself), the others leave
 * drops to the tree, which moves a row between folders through `onMoveConversation`.
 */
function dropHooks(consumer: ConsumerId) {
  const onDrop = vi.fn<(e: DragEvent, folderId: string) => boolean>(() => true);
  const hooks: Pick<TreeActions, 'onDrop' | 'acceptsDrag'> =
    consumer === 'aistudio'
      ? {
          onDrop,
          acceptsDrag: (types) => AISTUDIO_PROMPT_DRAG_TYPES.some((t) => types.includes(t)),
        }
      : {};
  return { onDrop, hooks };
}

function mount(consumer: ConsumerId, data: FolderData = sharedFixture(rootOf(consumer))) {
  const actions = spyActions();
  const { onDrop, hooks } = dropHooks(consumer);
  const tree = mountConsumer(consumer, data, { ...actions, ...hooks });
  return { tree, view: treeDriver(tree), actions, onDrop };
}

describe.each(CONSUMERS)('$name: dragging a row', ({ consumer }) => {
  it('puts the row’s chat and the folder it is shown in on the drag, with its title as text', () => {
    const { view } = mount(consumer);
    const transfer = view.dragRow('b', 'Shared');

    expect(JSON.parse(transfer.getData('application/json'))).toEqual({
      type: 'conversation',
      conversationId: 'shared',
      sourceFolderId: 'b',
    });
    expect(transfer.getData('text/plain')).toBe('Shared');
    expect(transfer.effectAllowed).toBe('move');
  });

  it('moves a row onto another folder from the folder it was shown in', () => {
    const { view, actions, onDrop } = mount(consumer);
    const accepted = view.drop(view.folderRow('Beta'), view.dragRow('a', 'Solo'));

    expect(accepted).toBe(true);
    if (consumer === 'aistudio') {
      expect(onDrop.mock.calls.map(([, folderId]) => folderId)).toEqual(['b']);
      expect(actions.onMoveConversation).not.toHaveBeenCalled();
    } else {
      expect(actions.onMoveConversation.mock.calls).toEqual([['solo', 'a', 'b']]);
    }
  });

  it('only highlights while dragging over: nothing is filed without a drop', () => {
    const { view, actions, onDrop } = mount(consumer);
    expect(view.dragOver(view.folderRow('Beta'), view.dragRow('a', 'Solo'))).toBe(true);
    expect(calledSpies(actions)).toEqual([]);
    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe('dropping a row on the folder it came from', () => {
  it.each(['panel', 'chatgpt'] as const)('%s moves nothing', (consumer) => {
    const { view, actions } = mount(consumer);
    view.drop(view.folderRow('Alpha'), view.dragRow('a', 'Solo'));
    expect(calledSpies(actions)).toEqual([]);
  });

  it('AI Studio hands it to the host, which decides', () => {
    const { view, onDrop } = mount('aistudio');
    view.drop(view.folderRow('Alpha'), view.dragRow('a', 'Solo'));
    expect(onDrop.mock.calls.map(([, folderId]) => folderId)).toEqual(['a']);
  });
});

describe('dropping a row from the native list (a payload with no source folder)', () => {
  it.each(['panel', 'chatgpt'] as const)('%s files nothing', (consumer) => {
    const { view, actions } = mount(consumer);
    view.drop(view.folderRow('Beta'), nativeRow('n1', 'Native'));
    expect(calledSpies(actions)).toEqual([]);
  });

  it('AI Studio hands it to the host for a folder, and for the root even with no folders', () => {
    const { view, onDrop } = mount('aistudio');
    expect(view.drop(view.folderRow('Beta'), nativeRow('n1', 'Native'))).toBe(true);
    expect(onDrop.mock.calls.at(-1)?.[1]).toBe('b');
    const [event] = onDrop.mock.calls[0];
    expect(JSON.parse(event.dataTransfer!.getData('application/json'))).toMatchObject({
      conversationId: 'n1',
    });

    destroyMountedTrees();
    const empty = mount('aistudio', { folders: [], folderContents: {} });
    const root = empty.view.rootDropTarget();
    expect(root).not.toBeNull();
    expect(empty.view.drop(root!, nativeRow('n2', 'Native'))).toBe(true);
    expect(empty.onDrop.mock.calls.map(([, folderId]) => folderId)).toEqual(['__uncategorized__']);
  });

  it('AI Studio accepts a bare prompt link at dragover', () => {
    const { view } = mount('aistudio');
    const link = fakeTransfer({ 'text/uri-list': 'https://aistudio.google.com/prompts/x' });
    expect(view.dragOver(view.folderRow('Beta'), link)).toBe(true);
  });
});

describe.each(['panel', 'chatgpt'] as const)('%s: refusing payloads', (consumer) => {
  const sourced = (extra: Record<string, unknown>) =>
    fakeTransfer({
      'application/json': JSON.stringify({
        type: 'conversation',
        conversationId: 'solo',
        sourceFolderId: 'a',
        ...extra,
      }),
    });

  it.each([
    ['a javascript: URL', sourced({ url: 'javascript:alert(1)' })],
    ['a data: URL', sourced({ url: 'data:text/html,hi' })],
    ['a folder payload', fakeTransfer({ 'application/json': '{"type":"folder","folderId":"a"}' })],
    ['an unknown type', sourced({ type: 'prompt' })],
    ['malformed JSON', fakeTransfer({ 'application/json': '{not json' })],
    ['an empty source folder', sourced({ sourceFolderId: '' })],
  ])('moves nothing for %s', (_kind, transfer) => {
    const { view, actions } = mount(consumer);
    view.drop(view.folderRow('Beta'), transfer);
    expect(calledSpies(actions)).toEqual([]);
  });

  it('accepts only Voyager JSON drags at dragover', () => {
    const { view } = mount(consumer);
    const beta = view.folderRow('Beta');
    expect(view.dragOver(beta, fakeTransfer({ 'text/uri-list': 'https://example.test/c/x' }))).toBe(
      false,
    );
    expect(view.dragOver(beta, fakeTransfer({ 'text/plain': 'hello' }))).toBe(false);
    expect(view.dragOver(beta, fakeTransfer({ 'application/json': '{}' }))).toBe(true);
  });

  it('still moves a well-formed payload that carries an https URL', () => {
    const { view, actions } = mount(consumer);
    view.drop(view.folderRow('Beta'), sourced({ url: 'https://example.test/c/solo' }));
    expect(actions.onMoveConversation.mock.calls).toEqual([['solo', 'a', 'b']]);
  });
});

describe.each(CONSUMERS)('$name: the shadow-root boundary', ({ consumer }) => {
  it('marks its host for the document_start key guard', () => {
    const { tree } = mount(consumer);
    expect(tree.host.hasAttribute('data-gv-shadow-surface')).toBe(true);
  });

  it('keeps keys typed into a folder name from page listeners, and still saves on Enter', async () => {
    const { view, actions } = mount(consumer);
    const pageKeys: string[] = [];
    const onKey = (e: KeyboardEvent) => pageKeys.push(e.key);
    document.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onKey);
    try {
      view.startRename('Beta');
      await settle();
      for (const key of ['j', 'k', '/', ' ']) view.pressInInput(key);
      view.typeName('Typed');
      view.pressInInput('Enter');
    } finally {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onKey);
    }
    expect(pageKeys).toEqual([]);
    expect(actions.onRenameFolder.mock.calls).toEqual([['b', 'Typed']]);
  });

  it('still lets keys on its buttons reach the page', () => {
    const { view } = mount(consumer);
    const pageKeys: string[] = [];
    const onKey = (e: KeyboardEvent) => pageKeys.push(e.key);
    document.addEventListener('keydown', onKey);
    try {
      view
        .expandControl('Alpha')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, composed: true }));
    } finally {
      document.removeEventListener('keydown', onKey);
    }
    expect(pageKeys).toEqual(['j']);
  });
});

describe('AI Studio: the menu layer at the shadow boundary', () => {
  it('mirrors the page scheme and direction and is gone with the tree', async () => {
    document.documentElement.setAttribute('data-gv-scheme', 'dark');
    document.body.classList.add('gv-rtl');
    try {
      const { tree, view } = mount('aistudio');
      view.openMenuByButton('Beta');
      const layer = topLevelHost(openMenu()!)!;
      expect(layer.getAttribute('data-gv-scheme')).toBe('dark');
      expect(layer.hasAttribute('data-gv-rtl')).toBe(true);

      document.documentElement.setAttribute('data-gv-scheme', 'light');
      await settle();
      expect(layer.getAttribute('data-gv-scheme')).toBe('light');

      tree.destroy();
      expect(layer.isConnected).toBe(false);
    } finally {
      document.documentElement.removeAttribute('data-gv-scheme');
      document.body.classList.remove('gv-rtl');
    }
  });
});

describe.each(CONSUMERS)('$name: view state never reaches the stored data', ({ consumer }) => {
  it('runs every view-only gesture on frozen data and raises only the asked callbacks', async () => {
    const data = deepFreeze(placementFixture(rootOf(consumer)));
    const snapshot = structuredClone(data);
    const { tree, view, actions, onDrop } = mount(consumer, data);
    const shown = view.outline();

    // Menu: open, then close by Escape (where supported) and by an outside press.
    view.openMenuByRightClick('Zeta');
    pressEscape();
    view.openMenuByRightClick('Zeta');
    press(document.body);
    // Name fields: open and cancel a rename, a top-level create and a subfolder create.
    view.startRename('Zeta');
    await settle();
    view.typeName('Not saved');
    view.pressInInput('Escape');
    tree.startCreateRootFolder();
    view.typeName('Not created');
    press(document.body);
    view.openMenuByRightClick('Zeta');
    menuItem(label('floatingPanelCreateSubfolder')).click();
    view.pressInInput('Escape');
    // Delete: ask the host, which never answers.
    view.openMenuByRightClick('Zeta');
    menuItem(label('floatingPanelDeleteFolder')).click();
    // Drag a row over folders without dropping.
    const transfer = view.dragRow('a', 'Oldest');
    view.dragOver(view.folderRow('Zeta'), transfer);
    view.dragOver(view.folderRow('Mu'), transfer);
    // Background data while nothing is open.
    tree.update(data);

    expect(openMenu()).toBeNull();
    expect(view.nameInput()).toBeNull();
    expect(calledSpies(actions)).toEqual(['confirmFolderRemoval']);
    expect(onDrop).not.toHaveBeenCalled();
    expect(data).toEqual(snapshot);
    expect(view.outline()).toEqual(shown);
  });

  it('hands a moved chat’s ids to the host and leaves the record it shows untouched', () => {
    const data = deepFreeze(sharedFixture(rootOf(consumer)));
    const { view, actions, onDrop } = mount(consumer, data);
    view.drop(view.folderRow('Beta'), view.dragRow('a', 'Solo'));
    expect(actions.onMoveConversation.mock.calls.length + onDrop.mock.calls.length).toBe(1);
    expect(data.folderContents.a.map((c) => c.conversationId)).toEqual(['shared', 'solo']);
  });
});

describe('the root bucket stays a bucket, not a folder', () => {
  it.each(CONSUMERS)('$name never shows the root bucket as a folder', ({ consumer }) => {
    const rootBucketId = rootOf(consumer);
    const { view } = mount(consumer, {
      folders: [folder('a', 'Alpha')],
      folderContents: { a: [], [rootBucketId]: [conv('r', 'At root')] },
    });
    expect(view.folderNames()).toEqual(['Alpha']);
  });
});
