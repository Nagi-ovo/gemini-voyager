/**
 * A tree's drop targets, found by viewport point. HTML5 drags reach them through
 * their own drag events (`dropHandlers`); a drag the page drives with pointer
 * events, which has none, asks the tree's owner what is under the pointer.
 */
import { cls } from './shared';

/** On every drop target: the folder a drop there files into. */
export const DROP_FOLDER_ATTR = 'data-gv-drop-folder';
/** Lights a drop target while a drag is over it. */
export const DROP_TARGET_CLASS = cls('drop-target');

export type FolderDropTarget = { readonly folderId: string; readonly element: HTMLElement };

/** The drop target in `root` under the viewport point, or `null`. */
export function folderDropTargetAt(
  root: ShadowRoot,
  x: number,
  y: number,
): FolderDropTarget | null {
  // Topmost element of this tree only: the page may drag its own row along under the pointer.
  const hit = root.elementsFromPoint(x, y).find((element) => root.contains(element));
  const element = hit?.closest<HTMLElement>(`[${DROP_FOLDER_ATTR}]`);
  const folderId = element?.getAttribute(DROP_FOLDER_ATTR);
  return element && folderId ? { folderId, element } : null;
}

export function showDropTarget(target: FolderDropTarget | null, shown: boolean): void {
  target?.element.classList.toggle(DROP_TARGET_CLASS, shown);
}
