/** @jsxImportSource preact */
import type { ItemInstance } from '@headless-tree/core';
import { useEffect, useRef } from 'preact/hooks';

import { getFolderDepth } from '@/features/folder/model/folderData';

import { getFolderColor, isDarkMode } from '../folderColors';
import { IconButton, InlineForm } from './controls';
import { DROP_FOLDER_ATTR, DROP_TARGET_CLASS } from './dropTargets';
import type { FolderNode } from './projection';
import {
  type DropPlacement,
  FOLDER_DRAG_TYPE,
  type TreeProps,
  acceptsDrag,
  canCreateChildAtDepth,
  cls,
  readConversationDragData,
  t,
} from './shared';
import { CHEVRON_RIGHT, ELLIPSIS, FOLDER, LineIcon, PIN, PLUS } from './treeIcons';

const FOLDER_DRAGGING = cls('folder-header--dragging');
/** Set on a row while a drop would land before or after it. */
const DROP_POSITION = 'data-drop-position';

type DropEvent = DragEvent & { currentTarget: HTMLElement };
export type PlacementOf = (e: DropEvent) => DropPlacement | undefined;

/** Whether the pointer is in the top or bottom `edge` (a fraction of the height) of the row. */
export function edgeOf(e: DropEvent, edge: number): 'before' | 'after' | null {
  const rect = e.currentTarget.getBoundingClientRect();
  if (rect.height <= 0) return null;
  const offset = (e.clientY - rect.top) / rect.height;
  if (offset < edge) return 'before';
  if (offset >= 1 - edge) return 'after';
  return null;
}

function showPlacement(target: HTMLElement, placement: DropPlacement | undefined): void {
  if (placement) target.setAttribute(DROP_POSITION, placement.position);
  else target.removeAttribute(DROP_POSITION);
}
export type Ref = (element: Element | null) => void;

/** A click that opens in place: no Ctrl, Meta or Shift, which ask for something else. */
export function isPlainClick(e: MouseEvent): boolean {
  return !e.ctrlKey && !e.metaKey && !e.shiftKey;
}

/**
 * Dragover, dragleave and drop handlers that file a conversation into
 * `folderId`, and the marker `folderDropTargetAt` finds. With `placementOf`, a
 * drop beside the row carries its placement.
 */
export function dropHandlers(tree: TreeProps, folderId: string, placementOf?: PlacementOf) {
  const { actions } = tree;
  // Nested targets: the innermost one takes the drag, and its ancestors stay unlit.
  const nested = !!tree.site?.folderBodyDrop;
  return {
    [DROP_FOLDER_ATTR]: folderId,
    // HTML5 quirk: `dataTransfer.getData(...)` returns "" during dragover for
    // security, so we can't read the payload here — we can only inspect the
    // MIME-type list via `dataTransfer.types`. If our payload type is present
    // we accept the drop *visually*, and the drop handler re-reads and validates
    // the full payload (including rejecting same-folder drops).
    onDragOver: (e: DropEvent) => {
      const types = e.dataTransfer?.types;
      if (!types || !acceptsDrag(actions, Array.from(types))) return;
      const placement = placementOf?.(e);
      e.preventDefault();
      if (nested) e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      showPlacement(e.currentTarget, placement);
      e.currentTarget.classList.toggle(DROP_TARGET_CLASS, !placement);
    },
    onDragLeave: (e: DropEvent) => {
      const into = e.relatedTarget;
      if (nested && into instanceof Node && e.currentTarget.contains(into)) return;
      e.currentTarget.classList.remove(DROP_TARGET_CLASS);
      showPlacement(e.currentTarget, undefined);
    },
    onDrop: (e: DropEvent) => {
      e.currentTarget.classList.remove(DROP_TARGET_CLASS);
      const placement = placementOf?.(e);
      showPlacement(e.currentTarget, undefined);
      if (nested) e.stopPropagation();
      if (actions.onDrop) {
        e.preventDefault();
        e.stopPropagation();
        if (placement) actions.onDrop(e, folderId, placement);
        else actions.onDrop(e, folderId);
        return;
      }
      const payload = readConversationDragData(e);
      if (!payload || payload.sourceFolderId === folderId) return;
      e.preventDefault();
      e.stopPropagation();
      actions.onMoveConversation?.(payload.conversationId, payload.sourceFolderId, folderId);
    },
  };
}

/**
 * The accessibility and focus props Headless Tree gives a row. Its click
 * handler is left out: rows handle clicks themselves, and a modifier click must
 * not run the primary action.
 */
export function treeItemProps(item: ItemInstance<string>) {
  const meta = item.getItemMeta();
  return {
    ref: item.registerElement,
    role: 'treeitem' as const,
    'aria-level': meta.level + 1,
    'aria-setsize': meta.setSize,
    'aria-posinset': meta.posInSet + 1,
    'aria-expanded': item.isFolder() ? item.isExpanded() : undefined,
    'aria-label': item.getItemName() || undefined,
    tabIndex: item.isFocused() ? 0 : -1,
    // Focus that lands in a row by pointer or Tab makes it the tabbable row.
    onFocusIn: () => {
      if (item.getTree().getState().focusedItem !== item.getId()) item.setFocused();
    },
  };
}

/** Attributes of the shell every row renders in: indexed for the virtualizer, drawing its folders' guides. */
export function rowShell(
  index: number,
  guides: number,
  options: { extraClass?: string; hidden?: boolean } = {},
) {
  const { extraClass, hidden } = options;
  return {
    class: extraClass ? `${cls('tree-row')} ${extraClass}` : cls('tree-row'),
    'data-index': String(index),
    'data-guides': guides > 0 ? '' : undefined,
    guideStyle: hidden
      ? { '--gv-tree-guides': String(guides), display: 'none' }
      : { '--gv-tree-guides': String(guides) },
  };
}

export function EmptyState({ labelKey = 'floatingPanelEmpty' }: { labelKey?: string }) {
  return (
    <div class={cls('empty')}>
      <svg class={cls('empty-icon')} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.75 6.5c0-.69.56-1.25 1.25-1.25h4.16c.36 0 .69.15.93.41l1.12 1.23c.14.15.34.24.55.24H18c.69 0 1.25.56 1.25 1.25v1.12H4.75v-3Zm0 4.25h14.5v6.75c0 .69-.56 1.25-1.25 1.25H6c-.69 0-1.25-.56-1.25-1.25v-6.75Z" />
      </svg>
      <div class={cls('empty-label')}>{t(labelKey)}</div>
    </div>
  );
}

type CreateRowProps = {
  tree: TreeProps;
  parentId: string | null;
  index: number;
  measure?: Ref;
  /** Under a collapsed folder: kept mounted so the draft survives, but not shown. */
  hidden?: boolean;
};

/** The name field for a new folder, under its parent's row or at the top for a root folder. */
export function CreateFolderRow({ tree, parentId, index, measure, hidden }: CreateRowProps) {
  const parentDepth = parentId ? getFolderDepth(tree.data, parentId) : -1;
  const shell = rowShell(index, parentDepth + 1, { hidden });
  const drops = parentId && tree.site?.folderBodyDrop ? dropHandlers(tree, parentId) : {};
  return (
    <div
      class={shell.class}
      data-index={shell['data-index']}
      data-guides={shell['data-guides']}
      ref={measure}
      style={shell.guideStyle}
      {...drops}
    >
      <InlineForm
        initialValue=""
        lineIcons={tree.site?.lineIcons}
        extraClass={parentId === null ? cls('inline-form--root') : undefined}
        style={
          parentId === null
            ? undefined
            : { paddingInlineStart: `calc(32px + ${parentDepth} * var(--gv-tree-step, 12px))` }
        }
        onSubmit={(name) =>
          tree.apply({ inlineEditor: null }, () => {
            if (name && canCreateChildAtDepth(parentDepth)) {
              tree.actions.onCreateFolder?.(name, parentId);
            }
          })
        }
        onCancel={() => tree.apply({ inlineEditor: null })}
      />
    </div>
  );
}

export type ItemRowProps<N> = {
  tree: TreeProps;
  node: N;
  item: ItemInstance<string>;
  index: number;
  measure?: Ref;
  /** A folder whose rename is open under a collapsed parent: mounted, not shown. */
  hidden?: boolean;
};

/** The pin, count and "+ add subfolder" slots after a folder's name, as the site has them. */
function FolderTrailingControls({
  tree,
  node,
  lineIcons,
}: {
  tree: TreeProps;
  node: FolderNode;
  lineIcons: boolean;
}) {
  const { apply, actions, site } = tree;
  const { folder, depth } = node;
  return (
    <>
      {site?.folderPinButton ? (
        <IconButton
          modifier="pin"
          labelKey={folder.pinned ? 'floatingPanelUnpinFolder' : 'floatingPanelPinFolder'}
          text={folder.pinned ? '●' : '○'}
          icon={lineIcons ? PIN : undefined}
          filled={!!folder.pinned}
          onClick={(e) => {
            e.stopPropagation();
            actions.onToggleFolderPinned?.(folder.id);
          }}
        />
      ) : (
        <span class={cls('pin')} aria-hidden="true">
          {folder.pinned ? '●' : ''}
        </span>
      )}
      {!site?.hideFolderCount && <span class={cls('count')}>{node.count}</span>}
      {/* Always occupy the trailing "+ add subfolder" slot so rows at
          different depths line up; at MAX_FOLDER_DEPTH an invisible
          placeholder keeps the count badge in the same position. */}
      {site?.hideAddSubfolderButton ? null : canCreateChildAtDepth(depth) ? (
        <IconButton
          modifier="add-child"
          labelKey="floatingPanelCreateSubfolder"
          text="+"
          icon={lineIcons ? PLUS : undefined}
          onClick={(e) => {
            e.stopPropagation();
            apply({
              expand: { folderId: folder.id, expanded: true },
              inlineEditor: { mode: 'create', parentId: folder.id },
              contextMenu: null,
            });
          }}
        />
      ) : (
        <span
          class={`${cls('icon-button')} ${cls('icon-button--placeholder')}`}
          aria-hidden="true"
        />
      )}
    </>
  );
}

export function FolderRow({ tree, node, item, index, measure, hidden }: ItemRowProps<FolderNode>) {
  const { inlineEditor, apply, actions, site } = tree;
  const { folder, depth } = node;
  const expanded = tree.isExpanded(folder);
  const renaming = inlineEditor?.mode === 'rename' && inlineEditor.folderId === folder.id;
  const trailing = !(renaming && site?.renameFillsRow);
  const toggle = () => apply({ expand: { folderId: folder.id, expanded: !expanded } });
  const menuButton = site?.folderMenuButton;
  const lineIcons = !!site?.lineIcons;
  const shell = rowShell(index, depth, { extraClass: cls('folder'), hidden });
  const draggable = !!site?.folderDrag && !folder.pinned && !renaming;
  const placementOf: PlacementOf | undefined = site?.reorder?.folders
    ? (e) => {
        if (!e.dataTransfer?.types.includes(FOLDER_DRAG_TYPE)) return undefined;
        const position = edgeOf(e, 0.25);
        return position ? { kind: 'folder', folderId: folder.id, position } : undefined;
      }
    : undefined;
  // A delayed toggle waits out a double-click, which renames instead.
  const pendingToggleRef = useRef<number | null>(null);
  const cancelToggle = () => {
    if (pendingToggleRef.current !== null) window.clearTimeout(pendingToggleRef.current);
    pendingToggleRef.current = null;
  };
  useEffect(() => cancelToggle, []);

  const onHeaderClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(`.${cls('inline-form')}`)) return;
    if (target.closest(`.${cls('icon-button')}`)) return;
    if (target.closest(`.${cls('caret')}`)) return;
    e.stopPropagation();
    if (!isPlainClick(e)) return;
    const delay = site?.folderToggleDelayMs;
    // Only the name renames on a double-click, so only a click on it waits.
    if (delay === undefined || !target.closest(`.${cls('folder-name')}`)) {
      cancelToggle();
      toggle();
      return;
    }
    cancelToggle();
    if (e.detail > 1) return;
    pendingToggleRef.current = window.setTimeout(() => {
      pendingToggleRef.current = null;
      toggle();
    }, delay);
  };

  return (
    // Depth is exposed as a custom property, as the panel stylesheet reads it.
    <div
      class={shell.class}
      data-index={shell['data-index']}
      data-guides={shell['data-guides']}
      ref={measure}
      data-depth={String(depth)}
      style={{ ...shell.guideStyle, '--gv-folder-depth': String(depth) }}
    >
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a treeitem (role from Headless Tree's props): Enter and the arrow keys reach it through the tree's hotkeys */}
      <div
        {...treeItemProps(item)}
        class={cls('folder-header')}
        style={{ paddingInlineStart: `calc(8px + ${depth} * var(--gv-tree-step, 12px))` }}
        data-folder-id={folder.id}
        draggable={draggable || undefined}
        onDragStart={
          draggable
            ? (e) => {
                e.stopPropagation();
                if (e.dataTransfer) {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(
                    'application/json',
                    JSON.stringify({ type: 'folder', folderId: folder.id, title: folder.name }),
                  );
                  e.dataTransfer.setData(FOLDER_DRAG_TYPE, folder.id);
                }
                e.currentTarget.classList.add(FOLDER_DRAGGING);
              }
            : undefined
        }
        onDragEnd={draggable ? (e) => e.currentTarget.classList.remove(FOLDER_DRAGGING) : undefined}
        onClick={onHeaderClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          apply({
            inlineEditor: null,
            contextMenu: {
              folderId: folder.id,
              x: e.clientX,
              y: e.clientY,
            },
          });
        }}
        {...dropHandlers(tree, folder.id, placementOf)}
      >
        <button
          type="button"
          class={expanded ? `${cls('caret')} ${cls('caret--expanded')}` : cls('caret')}
          aria-label={t(expanded ? 'floatingPanelCollapseFolder' : 'floatingPanelExpandFolder')}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          {lineIcons ? <LineIcon node={CHEVRON_RIGHT} /> : expanded ? '▾' : '▸'}
        </button>
        {lineIcons ? (
          // An uncoloured folder takes the row's icon colour, as the page's own rows do.
          <span
            class={cls('folder-icon')}
            style={
              folder.color && folder.color !== 'default'
                ? { color: getFolderColor(folder.color, isDarkMode()) }
                : undefined
            }
          >
            <LineIcon node={FOLDER} />
          </span>
        ) : (
          <span
            class={cls('folder-color')}
            style={{ backgroundColor: getFolderColor(folder.color, isDarkMode()) }}
          />
        )}
        <span class={cls('folder-name-wrap')}>
          {renaming ? (
            <InlineForm
              key={`rename:${folder.id}`}
              initialValue={folder.name}
              lineIcons={lineIcons}
              // `folder` is the record the form opened on, maybe stale; the
              // controller compares the name with live data.
              onSubmit={(newName) =>
                apply({ inlineEditor: null }, () => {
                  if (newName) actions.onRenameFolder?.(folder.id, newName);
                })
              }
              onCancel={() => apply({ inlineEditor: null })}
            />
          ) : (
            <span
              class={cls('folder-name')}
              dir="auto"
              title={folder.name}
              onDblClick={(e) => {
                e.stopPropagation();
                cancelToggle();
                apply({ inlineEditor: { mode: 'rename', folderId: folder.id }, contextMenu: null });
              }}
            >
              {folder.name}
            </span>
          )}
        </span>
        {trailing && <FolderTrailingControls tree={tree} node={node} lineIcons={lineIcons} />}
        {menuButton && trailing && (
          <IconButton
            modifier="menu"
            labelKey={menuButton.labelKey}
            text="⋮"
            icon={lineIcons ? ELLIPSIS : undefined}
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              apply({
                inlineEditor: null,
                contextMenu: {
                  folderId: folder.id,
                  x: rect.left,
                  y: rect.bottom,
                  anchor: { width: rect.width, height: rect.height },
                  // Enter or Space on the button: a click with no pointer.
                  ...(e.detail === 0 ? { fromKeyboard: true } : {}),
                },
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

type RootDropRowProps = { tree: TreeProps; index: number; measure?: Ref };

/** AI Studio's drop strip for filing at the root, shown even with no folders. */
export function RootDropRow({ tree, index, measure }: RootDropRowProps) {
  const shell = rowShell(index, 0);
  return (
    <div class={shell.class} data-index={shell['data-index']} ref={measure}>
      <div
        class={cls('root-drop')}
        data-folder-id={tree.rootBucketId}
        {...dropHandlers(tree, tree.rootBucketId)}
      />
    </div>
  );
}

/** The heading over AI Studio's root conversations, which follow it as rows. */
export function RootTitleRow({
  tree,
  labelKey,
  index,
  measure,
}: RootDropRowProps & { labelKey: string }) {
  const shell = rowShell(index, 0);
  return (
    <div class={shell.class} data-index={shell['data-index']} ref={measure}>
      <div class={cls('root-section')}>
        <div
          class={cls('root-section-title')}
          data-folder-id={tree.rootBucketId}
          {...dropHandlers(tree, tree.rootBucketId)}
        >
          {t(labelKey)}
        </div>
      </div>
    </div>
  );
}
