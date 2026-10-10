import {
  type FeatureImplementation,
  type HotkeysCoreDataRef,
  type ItemInstance,
  type TreeInstance,
  createTree,
  hotkeysCoreFeature,
  syncDataLoaderFeature,
} from '@headless-tree/core';

import type { FolderNode, TreeNode, TreeProjection } from './projection';
import { ROOT_ITEM_KEY } from './projection';

/** What the engine asks of the view that renders it. */
export type TreeEngineHost = {
  projection: () => TreeProjection;
  /** Expansion belongs to the tree's owner; the engine only asks for a change. */
  setExpanded: (node: FolderNode, expanded: boolean) => void;
  /** The roving focus moved: re-render so the right row is tabbable. */
  onFocusChange: () => void;
  /** Move DOM focus to `key`'s row, rendering it first if it is scrolled away. */
  focusRow: (key: string) => void;
  /** Enter on a row: open a conversation, toggle a folder. */
  activate: (node: TreeNode) => void;
  /** F2 on a folder row. */
  rename: (node: FolderNode) => void;
};

export type TreeEngine = {
  tree: TreeInstance<string>;
  /** Brings the engine to a new projection and expansion; call before reading items. */
  sync: (expandedKeys: readonly string[], projectionChanged: boolean) => void;
  /** Visible items in order, as the expansion lays them out. */
  items: () => ItemInstance<string>[];
};

const isRtl = (element: Element | null | undefined): boolean =>
  !!element && getComputedStyle(element).direction === 'rtl';

/** The treeitem itself has focus, not a button or field inside it. */
const onRowItself = (e: KeyboardEvent, tree: TreeInstance<string>): boolean =>
  e.target === tree.getFocusedItem()?.getElement();

/**
 * Headless Tree with our own owner of expansion and focus moves.
 *
 * - `expand`/`collapse` ask the host, which goes through the controller's
 *   `apply`, so a persisted expansion has one writer (`onToggleFolderExpanded`).
 * - `updateDomFocus` focuses synchronously, or once the row has rendered,
 *   instead of the library's timer-and-poll.
 * - Key state: Headless Tree tracks pressed keys from keydown on the tree and
 *   keyup on `document`. A keyup in a text field never reaches `document` (the
 *   shadow surface keeps typing inside), so a key that moved focus into a
 *   field, like F2 into the rename input, would stay pressed and block every
 *   later hotkey. Keyups on the tree element are forwarded too, and the state
 *   resets when focus leaves the tree or the window.
 * - Keydown gate: the library matches only the keys it saw go down inside the
 *   tree, so a modifier pressed before focus arrived is invisible to it and
 *   Ctrl+ArrowRight would expand like ArrowRight. No tree hotkey takes a
 *   modifier, so a modified keydown never reaches the library. Neither does a
 *   key with no row to act on (an empty tree's create form): the library's
 *   navigation assumes a focused item and throws without one.
 */
function voyagerFeature(host: TreeEngineHost): FeatureImplementation<string> {
  let teardown: (() => void) | null = null;
  const route = (itemId: string, expanded: boolean) => {
    const node = host.projection().nodes.get(itemId);
    if (node?.kind === 'folder') host.setExpanded(node, expanded);
  };
  return {
    key: 'voyager',
    deps: ['hotkeys-core'],
    itemInstance: {
      expand: ({ itemId }) => route(itemId, true),
      collapse: ({ itemId }) => route(itemId, false),
    },
    treeInstance: {
      updateDomFocus: ({ tree }) => {
        const focused = tree.getFocusedItem();
        if (focused) host.focusRow(focused.getId());
      },
    },
    onTreeMount: (tree, element) => {
      const data = tree.getDataRef<HotkeysCoreDataRef>();
      // hotkeys-core mounted first (our dependency); put the gate in its place.
      const dispatch = data.current.keydownHandler;
      const keydown = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        if (!tree.getFocusedItem()) return;
        dispatch?.(e);
      };
      if (dispatch) element.removeEventListener('keydown', dispatch);
      element.addEventListener('keydown', keydown);
      // hotkeys-core removes whatever handler it finds here on unmount.
      data.current.keydownHandler = keydown;
      const keyup = (e: KeyboardEvent) => data.current.keyupHandler?.(e);
      const reset = () => {
        data.current.pressedKeys = new Set();
      };
      const focusOut = (e: FocusEvent) => {
        const next = e.relatedTarget;
        if (!(next instanceof Node && element.contains(next))) reset();
      };
      element.addEventListener('keyup', keyup);
      element.addEventListener('focusout', focusOut);
      window.addEventListener('blur', reset);
      teardown = () => {
        element.removeEventListener('keydown', keydown);
        element.removeEventListener('keyup', keyup);
        element.removeEventListener('focusout', focusOut);
        window.removeEventListener('blur', reset);
        reset();
      };
    },
    onTreeUnmount: () => {
      teardown?.();
      teardown = null;
    },
  };
}

export function createTreeEngine(host: TreeEngineHost): TreeEngine {
  let expandedItems: string[] = [];
  const nodeOf = (item: ItemInstance<string>): TreeNode | undefined =>
    host.projection().nodes.get(item.getId());

  // Arrow keys follow the reading direction: in RTL, Left opens and Right closes.
  const horizontal = (forward: boolean) => (e: KeyboardEvent, tree: TreeInstance<string>) => {
    const item = tree.getFocusedItem();
    if (!item) return;
    const opening = isRtl(tree.getElement()) ? !forward : forward;
    if (opening) {
      if (item.isFolder() && !item.isExpanded()) item.expand();
      else {
        tree.focusNextItem();
        tree.updateDomFocus();
      }
      return;
    }
    if (item.isFolder() && item.isExpanded()) {
      item.collapse();
      return;
    }
    const parent = item.getParent();
    if (parent && parent.getId() !== ROOT_ITEM_KEY) {
      parent.setFocused();
      tree.updateDomFocus();
    }
  };

  const tree = createTree<string>({
    rootItemId: ROOT_ITEM_KEY,
    initialState: { expandedItems: [], focusedItem: null },
    dataLoader: {
      getItem: (itemId) => itemId,
      getChildren: (itemId) => [...(host.projection().children.get(itemId) ?? [])],
    },
    getItemName: (item) => {
      const node = nodeOf(item);
      if (!node) return '';
      return node.kind === 'folder' ? node.folder.name : node.conversation.title || '';
    },
    isItemFolder: (item) => nodeOf(item)?.kind === 'folder',
    setFocusedItem: () => host.onFocusChange(),
    features: [syncDataLoaderFeature, hotkeysCoreFeature, voyagerFeature(host)],
    // Headless Tree matches against a shallow merge of preset and override, so
    // an override restates the whole hotkey.
    hotkeys: {
      expandOrDown: {
        hotkey: 'ArrowRight',
        canRepeat: true,
        preventDefault: true,
        handler: horizontal(true),
      },
      collapseOrUp: {
        hotkey: 'ArrowLeft',
        canRepeat: true,
        preventDefault: true,
        handler: horizontal(false),
      },
      focusFirstItem: {
        hotkey: 'Home',
        preventDefault: true,
        handler: (_e, current) => {
          current.getItems()[0]?.setFocused();
          current.updateDomFocus();
        },
      },
      focusLastItem: {
        hotkey: 'End',
        preventDefault: true,
        handler: (_e, current) => {
          current.getItems().at(-1)?.setFocused();
          current.updateDomFocus();
        },
      },
      customActivate: {
        hotkey: 'Enter',
        handler: (e, current) => {
          if (!onRowItself(e, current)) return;
          const node = nodeOf(current.getFocusedItem());
          if (!node) return;
          e.preventDefault();
          host.activate(node);
        },
      },
      customRename: {
        hotkey: 'F2',
        handler: (e, current) => {
          if (!onRowItself(e, current)) return;
          const node = nodeOf(current.getFocusedItem());
          if (node?.kind !== 'folder') return;
          e.preventDefault();
          host.rename(node);
        },
      },
    },
  });
  // Rendering is synchronous, so the tree is live as soon as it exists.
  tree.setMounted(true);

  return {
    tree,
    sync: (expandedKeys, projectionChanged) => {
      const same =
        expandedKeys.length === expandedItems.length &&
        expandedKeys.every((key, index) => key === expandedItems[index]);
      if (!same) {
        expandedItems = [...expandedKeys];
        // A new expansion array makes setConfig rebuild the flat list.
        tree.setConfig((config) => ({ ...config, state: { expandedItems } }));
      } else if (projectionChanged) {
        tree.rebuildTree();
      }
      // Focus on a row that is gone or folded away falls back to the first row,
      // so the tree keeps one tabbable row.
      const focused = tree.getState().focusedItem;
      if (focused !== null && tree.getItemInstance(focused).getItemMeta().index < 0) {
        tree.setConfig((config) => ({ ...config, state: { expandedItems, focusedItem: null } }));
      }
    },
    items: () => tree.getItems(),
  };
}
