/**
 * The folder panel's state while account isolation cannot tell which account
 * the page is signed in to: the folders stay hidden and inert, and a line
 * under the heading says why, so the panel never looks like it is loading.
 */
const NOTICE_CLASS = 'gv-folder-account-notice';

/**
 * Shows `message` before the container's `treeHostClass` child and makes that
 * child inert, or removes both when null. `container` may be a shadow root.
 */
export function setAccountUnknownNotice(
  container: HTMLElement | ShadowRoot,
  treeHostClass: string,
  message: string | null,
): void {
  // Direct children only; `:scope` names no element in a shadow root.
  const child = (className: string): HTMLElement | undefined =>
    Array.from(container.children).find(
      (el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains(className),
    );
  const tree = child(treeHostClass);
  if (tree) tree.inert = message !== null;
  let notice = child(NOTICE_CLASS);
  if (message === null) {
    notice?.remove();
    return;
  }
  if (!notice) {
    notice = document.createElement('p');
    notice.className = NOTICE_CLASS;
    notice.setAttribute('role', 'status');
    if (tree) tree.before(notice);
    else container.appendChild(notice);
  }
  if (notice.textContent !== message) notice.textContent = message;
}
