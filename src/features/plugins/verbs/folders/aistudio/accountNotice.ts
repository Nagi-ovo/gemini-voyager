/**
 * The folder panel's state while account isolation cannot tell which account
 * the page is signed in to: the folders stay hidden and inert, and a line
 * under the heading says why, so the panel never looks like it is loading.
 */
const NOTICE_CLASS = 'gv-folder-account-notice';

/** Shows `message` under the heading and makes the tree inert, or removes both when null. */
export function setAccountUnknownNotice(
  container: HTMLElement,
  treeHostClass: string,
  message: string | null,
): void {
  const tree = container.querySelector<HTMLElement>(`:scope > .${treeHostClass}`);
  if (tree) tree.inert = message !== null;
  let notice = container.querySelector<HTMLElement>(`:scope > .${NOTICE_CLASS}`);
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
