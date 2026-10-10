import treeCss from './folderTree.css?raw';

const STYLE_CLASS = 'gv-folder-tree-style';
const users = new WeakMap<ShadowRoot, number>();

/**
 * Adds the tree's stylesheet to the shadow root `element` renders in, once per
 * root however many trees share it. Returns the release, which removes the
 * sheet with the root's last tree. Outside a shadow root it does nothing: every
 * host renders the tree in its own shadow surface.
 */
export function retainTreeStyle(element: Element): () => void {
  const root = element.getRootNode();
  if (!(root instanceof ShadowRoot)) return () => {};
  const count = users.get(root) ?? 0;
  if (count === 0 && !root.querySelector(`style.${STYLE_CLASS}`)) {
    const style = document.createElement('style');
    style.className = STYLE_CLASS;
    style.textContent = treeCss;
    root.appendChild(style);
  }
  users.set(root, count + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (users.get(root) ?? 1) - 1;
    if (left > 0) {
      users.set(root, left);
      return;
    }
    users.delete(root);
    root.querySelector(`style.${STYLE_CLASS}`)?.remove();
  };
}
