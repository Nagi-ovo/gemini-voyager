import type { ItemInstance } from '@headless-tree/core';

import { ROOT_ITEM_KEY, type TreeNode, type TreeProjection, folderKey } from './projection';
import { type TreeProps, cls, isFolderMenu } from './shared';
import { type TreeEngine, type TreeEngineHost, createTreeEngine } from './treeEngine';
import { type RowVirtualizer, VIRTUALIZE_AFTER_ROWS, createRowVirtualizer } from './virtualRows';

export type Row =
  | { kind: 'item'; key: string; node: TreeNode; item: ItemInstance<string>; hidden?: boolean }
  | { kind: 'create'; key: string; parentId: string | null; hidden?: boolean }
  | { kind: 'root-drop'; key: string }
  | { kind: 'root-title'; key: string; labelKey: string };

/** Rough heights until a row is measured; close enough that scrolling barely jumps. */
const ESTIMATED_HEIGHT: Record<string, number> = {
  folder: 34,
  conversation: 32,
  create: 34,
  'root-drop': 30,
  'root-title': 41,
};

export const estimate = (row: Row | undefined): number => {
  if (!row) return 32;
  if ((row.kind === 'item' || row.kind === 'create') && row.hidden) return 0;
  return ESTIMATED_HEIGHT[row.kind === 'item' ? row.node.kind : row.kind];
};

const isShownItem = (engine: TreeEngine, key: string): boolean =>
  engine.tree.getItemInstance(key).getItemMeta().index >= 0;

/**
 * The open name field when a collapsed folder hides it: it stays mounted and
 * hidden, so the draft survives until the folder opens again. Returns the row
 * and the shown folder it waits under.
 */
function hiddenEditorRow(
  tree: TreeProps,
  projection: TreeProjection,
  engine: TreeEngine,
): { row: Row; under: string } | null {
  const editor = tree.inlineEditor;
  if (!editor || (editor.mode === 'create' && editor.parentId === null)) return null;
  const folderId = editor.mode === 'rename' ? editor.folderId : editor.parentId;
  if (folderId === null) return null;
  const node = projection.nodes.get(folderKey(folderId));
  if (node?.kind !== 'folder') return null;
  let row: Row;
  let start: string;
  if (editor.mode === 'rename') {
    if (isShownItem(engine, node.key)) return null;
    const item = engine.tree.getItemInstance(node.key);
    row = { kind: 'item', key: node.key, node, item, hidden: true };
    start = node.parentKey;
  } else {
    if (isShownItem(engine, node.key) && tree.isExpanded(node.folder)) return null;
    row = { kind: 'create', key: `create:${node.key}`, parentId: node.folder.id, hidden: true };
    start = node.key;
  }
  // Wait under the nearest folder that is shown.
  for (let key = start; key !== ROOT_ITEM_KEY;) {
    const ancestor = projection.nodes.get(key);
    if (ancestor?.kind !== 'folder') break;
    if (isShownItem(engine, key)) return { row, under: key };
    key = ancestor.parentKey;
  }
  return { row, under: ROOT_ITEM_KEY };
}

/**
 * The flat rows the tree shows: Headless Tree's visible items, plus the name
 * field for a new folder under its parent and AI Studio's root drop strip and
 * heading before the root conversations.
 */
function buildRows(
  tree: TreeProps,
  projection: TreeProjection,
  engine: TreeEngine,
  items: readonly ItemInstance<string>[],
): Row[] {
  const rows: Row[] = [];
  const editor = tree.inlineEditor;
  const creatingIn = editor?.mode === 'create' ? editor.parentId : undefined;
  const rootSection = tree.site?.rootSection;
  const waiting = hiddenEditorRow(tree, projection, engine);
  if (creatingIn === null) rows.push({ kind: 'create', key: 'create:root', parentId: null });
  if (waiting?.under === ROOT_ITEM_KEY) rows.push(waiting.row);
  let rootStarted = false;
  for (const item of items) {
    const node = projection.nodes.get(item.getId());
    if (!node) continue;
    if (rootSection && !rootStarted && node.kind === 'conversation' && node.folderDepth < 0) {
      rootStarted = true;
      rows.push(
        { kind: 'root-drop', key: 'root-drop' },
        { kind: 'root-title', key: 'root-title', labelKey: rootSection.labelKey },
      );
    }
    rows.push({ kind: 'item', key: node.key, node, item });
    if (node.kind !== 'folder') continue;
    if (creatingIn === node.folder.id && item.isExpanded()) {
      rows.push({ kind: 'create', key: `create:${node.key}`, parentId: node.folder.id });
    }
    if (waiting?.under === node.key) rows.push(waiting.row);
  }
  if (rootSection && !rootStarted) rows.push({ kind: 'root-drop', key: 'root-drop' });
  return rows;
}

/** Rows that must stay rendered while scrolled away: focus, an open name field, the menu's folder. */
function pinnedKeys(tree: TreeProps, engine: TreeEngine, pendingFocus: string | null): string[] {
  const keys: string[] = [];
  const focused = engine.tree.getState().focusedItem;
  if (focused) keys.push(focused);
  if (pendingFocus) keys.push(pendingFocus);
  const editor = tree.inlineEditor;
  if (editor?.mode === 'rename') keys.push(folderKey(editor.folderId));
  if (editor?.mode === 'create') {
    keys.push(editor.parentId === null ? 'create:root' : `create:${folderKey(editor.parentId)}`);
  }
  if (tree.contextMenu && isFolderMenu(tree.contextMenu)) {
    keys.push(folderKey(tree.contextMenu.folderId));
  }
  return keys;
}

export type ProjectedTree = TreeProps & { projection: TreeProjection };

/** What one render shows. */
export type TreeFrame = {
  rows: Row[];
  /** Rendered rows by index, in order; every row unless the tree is virtual. */
  shown: number[];
  /** Offsets for spacers, when the tree is virtual and measured. */
  slots: { index: number; top: number; size: number }[] | null;
  total: number;
  virtual: boolean;
  measure: RowVirtualizer['measure'] | undefined;
};

export type TreeView = {
  /** Lays out a render: syncs the engine to `tree` and picks the rows to render. */
  frame: (tree: ProjectedTree) => TreeFrame;
  /** The tree element's ref; stable for the view's life. */
  listRef: (element: HTMLElement | null) => void;
  /** After a render commits: follow the scroller, finish a focus move that waited for its row. */
  committed: () => void;
  destroy: () => void;
};

/**
 * The state behind one mounted tree: the Headless Tree engine, the virtualizer,
 * the latest props for engine callbacks and a focus move waiting for its row.
 * It holds no folder data of its own; each render hands it the current props.
 */
export function createTreeView(rerender: () => void): TreeView {
  let latest: ProjectedTree | null = null;
  let list: HTMLElement | null = null;
  let pendingFocus: string | null = null;
  let virtual = false;
  let generation: number | undefined;
  let engine: TreeEngine | null = null;
  let projection: TreeProjection | null = null;
  let rows: Row[] = [];
  let rowsFor: unknown[] = [];
  let sizing: {
    rows: Row[];
    indexByKey: Map<string, number>;
    estimateSize: (index: number) => number;
    rowKey: (index: number) => string;
  } | null = null;
  const virtualizer = createRowVirtualizer(rerender);

  const current = (): ProjectedTree => {
    if (!latest) throw new Error('tree view used before its first render');
    return latest;
  };

  const startEngine = (): TreeEngine => {
    engine?.tree.registerElement(null);
    const host: TreeEngineHost = {
      projection: () => current().projection,
      setExpanded: (node, expanded) =>
        current().apply({ expand: { folderId: node.folder.id, expanded } }),
      onFocusChange: rerender,
      focusRow: (key) => {
        const element = next.tree.getItemInstance(key).getElement();
        if (element?.isConnected) {
          element.focus();
          return;
        }
        pendingFocus = key;
        rerender();
      },
      activate: (node) => {
        const tree = current();
        if (node.kind === 'conversation') {
          // Enter clicks the title, as it would a link, so a site that takes a
          // click (a selection mode) takes this one too.
          const title = next.tree
            .getItemInstance(node.key)
            .getElement()
            ?.querySelector<HTMLElement>(`.${cls('conv-title')}`);
          if (title) title.click();
          else tree.actions.onNavigate?.(node.conversation);
          return;
        }
        const expanded = tree.isExpanded(node.folder);
        tree.apply({ expand: { folderId: node.folder.id, expanded: !expanded } });
      },
      rename: (node) =>
        current().apply({
          inlineEditor: { mode: 'rename', folderId: node.folder.id },
          contextMenu: null,
        }),
    };
    const next = createTreeEngine(host);
    if (list) next.tree.registerElement(list);
    projection = null;
    rowsFor = [];
    pendingFocus = null;
    return next;
  };

  return {
    frame: (tree) => {
      latest = tree;
      // Another account's data starts a new engine: Headless Tree keeps every
      // item instance it has seen, and focus must not carry over.
      if (!engine || generation !== tree.generation) {
        generation = tree.generation;
        engine = startEngine();
      }
      const projectionChanged = projection !== tree.projection;
      projection = tree.projection;
      engine.sync(
        projection.folders.filter((node) => tree.isExpanded(node.folder)).map((node) => node.key),
        projectionChanged,
      );
      const items = engine.items();
      const inputs = [
        projection,
        items,
        tree.inlineEditor,
        tree.site?.rootSection,
        tree.isExpanded,
      ];
      if (inputs.some((value, index) => value !== rowsFor[index])) {
        rows = buildRows(tree, projection, engine, items);
        rowsFor = inputs;
      }
      virtual = rows.length > VIRTUALIZE_AFTER_ROWS;
      if (!virtual) {
        return {
          rows,
          shown: rows.map((_row, index) => index),
          slots: null,
          total: 0,
          virtual,
          measure: undefined,
        };
      }
      // New sizing callbacks make the virtualizer lay out every row again, so
      // they change only with the rows.
      if (sizing?.rows !== rows) {
        const laidOut = rows;
        sizing = {
          rows,
          indexByKey: new Map(rows.map((row, index) => [row.key, index])),
          estimateSize: (index) => estimate(laidOut[index]),
          rowKey: (index) => laidOut[index]?.key ?? String(index),
        };
      }
      const { indexByKey, estimateSize, rowKey } = sizing;
      virtualizer.configure({
        count: rows.length,
        estimateSize,
        rowKey,
        pinned: pinnedKeys(tree, engine, pendingFocus)
          .map((key) => indexByKey.get(key))
          .filter((index): index is number => index !== undefined),
      });
      const visible = virtualizer.window();
      return {
        rows,
        shown: visible.slots.map((slot) => slot.index),
        slots: visible.measured ? visible.slots : null,
        total: visible.total,
        virtual,
        measure: virtualizer.measure,
      };
    },
    listRef: (element) => {
      list = element;
      engine?.tree.registerElement(element);
    },
    committed: () => {
      virtualizer.attach(virtual ? list : null);
      if (!pendingFocus || !engine) return;
      const element = engine.tree.getItemInstance(pendingFocus).getElement();
      if (element?.isConnected) {
        pendingFocus = null;
        element.focus();
      }
    },
    destroy: () => {
      virtualizer.destroy();
      engine?.tree.registerElement(null);
      engine = null;
      latest = null;
      list = null;
    },
  };
}
