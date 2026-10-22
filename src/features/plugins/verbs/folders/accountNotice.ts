/**
 * The folder panel's state while account isolation cannot tell which account
 * the page is signed in to: the folders stay hidden and inert, and a line
 * under the heading says why, so the panel never looks like it is loading.
 */
const NOTICE_CLASS = 'gv-folder-account-notice';

/**
 * How long the account must stay unreadable before the panel says so. A page
 * draws its account control a moment after the folders mount; a warning on
 * every load would cry wolf.
 */
export const ACCOUNT_NOTICE_GRACE_MS = 3000;

export interface AccountNoticeDelay {
  /** Whether to show the notice now, given whether the account is unreadable now. */
  shown(unknown: boolean): boolean;
  /** Drops a pending wait; the next unreadable account waits the whole grace again. */
  stop(): void;
}

/**
 * Holds the notice back until the account has stayed unreadable for
 * `ACCOUNT_NOTICE_GRACE_MS`; `onShow` is called then, to show it. An account
 * read in between ends the wait.
 */
export function createAccountNoticeDelay(onShow: () => void): AccountNoticeDelay {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let elapsed = false;
  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    elapsed = false;
  };
  return {
    shown(unknown) {
      if (!unknown) {
        stop();
        return false;
      }
      if (!elapsed && timer === null) {
        timer = setTimeout(() => {
          timer = null;
          elapsed = true;
          onShow();
        }, ACCOUNT_NOTICE_GRACE_MS);
      }
      return elapsed;
    },
    stop,
  };
}

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
