/** @jsxImportSource preact */
import { render } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

import { getFolderDepth } from '@/features/folder/model/folderData';

import { FOLDER_COLORS, getFolderColor, isDarkMode } from '../folderColors';
import type { Folder } from '../types';
import { positionMenu } from './menuPosition';
import {
  type ConversationMenuState,
  type FolderMenuState,
  type TreeProps,
  canCreateChildAtDepth,
  cls,
  isFolderMenu,
  t,
} from './shared';

type MenuButtonProps = {
  labelKey: string;
  extraClass?: string;
  onClick: (e: MouseEvent) => void;
};

function MenuButton({ labelKey, extraClass, onClick }: MenuButtonProps) {
  const classes = extraClass ? `${cls('menu-item')} ${extraClass}` : cls('menu-item');
  return (
    <button type="button" class={classes} onClick={onClick}>
      {t(labelKey)}
    </button>
  );
}

const DANGER = cls('menu-item--danger');

/**
 * Right-click menu for one folder (pin, subfolder, rename, color, delete), or
 * for a filed conversation (rename).
 */
export function ContextMenu(tree: TreeProps) {
  const { contextMenu, data } = tree;
  if (!contextMenu) return null;
  if (!isFolderMenu(contextMenu)) return <ConversationMenu tree={tree} menu={contextMenu} />;
  const folder = data.folders.find((candidate) => candidate.id === contextMenu.folderId);
  if (!folder) return null;
  return <FolderMenu tree={tree} menu={contextMenu} folder={folder} />;
}

function ConversationMenu({ tree, menu }: { tree: TreeProps; menu: ConversationMenuState }) {
  const { actions, apply } = tree;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => (ref.current ? positionMenu(ref.current, menu) : undefined), [menu]);
  return (
    <div
      ref={ref}
      class={cls('context-menu')}
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      role="menu"
    >
      <MenuButton
        labelKey="folder_rename"
        onClick={(e) => {
          e.stopPropagation();
          apply({ contextMenu: null }, () => actions.onRenameConversation?.(menu.conversation));
        }}
      />
    </div>
  );
}

type FolderMenuProps = { tree: TreeProps; menu: FolderMenuState; folder: Folder };

function FolderMenu({ tree, menu: contextMenu, folder }: FolderMenuProps) {
  const { data, actions, apply, folderHeader } = tree;
  const confirmRemoval = actions.confirmFolderRemoval;
  const ref = useRef<HTMLDivElement>(null);
  // Opens at its anchor, then floats inside the viewport until it closes.
  useLayoutEffect(
    () => (ref.current ? positionMenu(ref.current, contextMenu) : undefined),
    [contextMenu],
  );

  const position = { left: `${contextMenu.x}px`, top: `${contextMenu.y}px` };

  const dark = isDarkMode();
  const activeColor = folder.color ?? 'default';

  return (
    <div ref={ref} class={cls('context-menu')} style={position} role="menu">
      {actions.onAddCurrentConversation && (
        <MenuButton
          labelKey="floatingPanelAddCurrentHere"
          onClick={(e) => {
            e.stopPropagation();
            apply({ contextMenu: null }, () => actions.onAddCurrentConversation?.(folder.id));
          }}
        />
      )}
      <MenuButton
        labelKey={folder.pinned ? 'floatingPanelUnpinFolder' : 'floatingPanelPinFolder'}
        onClick={(e) => {
          e.stopPropagation();
          apply({ contextMenu: null }, () => actions.onToggleFolderPinned?.(folder.id));
        }}
      />
      {canCreateChildAtDepth(getFolderDepth(data, folder.id)) && (
        <MenuButton
          labelKey="floatingPanelCreateSubfolder"
          onClick={(e) => {
            e.stopPropagation();
            apply({
              expand: { folderId: folder.id, expanded: true },
              contextMenu: null,
              inlineEditor: { mode: 'create', parentId: folder.id },
            });
          }}
        />
      )}
      <MenuButton
        labelKey="floatingPanelRenameFolder"
        onClick={(e) => {
          e.stopPropagation();
          apply({ contextMenu: null, inlineEditor: { mode: 'rename', folderId: folder.id } });
        }}
      />
      {actions.onSetFolderColor && (
        <div class={cls('color-section')}>
          <div class={cls('color-title')}>{t('floatingPanelColor')}</div>
          <div class={cls('color-swatches')}>
            {FOLDER_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                class={
                  activeColor === color.id
                    ? `${cls('color-swatch')} ${cls('color-swatch--active')}`
                    : cls('color-swatch')
                }
                style={{ backgroundColor: getFolderColor(color.id, dark) }}
                aria-label={t(color.nameKey)}
                title={t(color.nameKey)}
                onClick={(e) => {
                  e.stopPropagation();
                  apply({ contextMenu: null }, () =>
                    actions.onSetFolderColor?.(folder.id, color.id),
                  );
                }}
              />
            ))}
          </div>
        </div>
      )}
      {actions.folderMenuItems?.(folder).map((item) => (
        <MenuButton
          key={item.labelKey}
          labelKey={item.labelKey}
          onClick={(e) => {
            e.stopPropagation();
            apply({ contextMenu: null }, item.run);
          }}
        />
      ))}
      {confirmRemoval && (
        <>
          <div class={cls('menu-divider')} />
          <MenuButton
            labelKey="floatingPanelDeleteFolder"
            extraClass={DANGER}
            onClick={(e) => {
              e.stopPropagation();
              // Not this item: a confirm closes once its anchor leaves the page, as the menu is about to.
              const anchor = folderHeader(folder.id);
              apply({ contextMenu: null }, () => {
                if (anchor) confirmRemoval(anchor, () => actions.onDeleteFolder?.(folder.id));
              });
            }}
          />
        </>
      )}
    </div>
  );
}

/** Renders the folder menu into `container` on its own; `null` unmounts it. */
export function renderContextMenu(container: HTMLElement, tree: TreeProps | null): void {
  render(tree ? <ContextMenu {...tree} /> : null, container);
}
