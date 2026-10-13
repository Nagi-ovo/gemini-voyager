import {
  capturePageIdentity,
  isDifferentAccount,
  type PageIdentity,
} from '../selectionToolbar/pageIdentity';

/** The destination opened by a fork: app or a Gem, before its first conversation exists. */
export function captureForkReceiver(): PageIdentity | null {
  const receiver = capturePageIdentity();
  return /^\/(?:u\/\d+\/)?(?:app|gem\/[^/]+)\/?$/.test(receiver.pathname) ? receiver : null;
}

/** Awaited handoff work may only paste into the exact new-chat page that started it. */
export function isCurrentForkReceiver(receiver: PageIdentity): boolean {
  const current = capturePageIdentity();
  return (
    receiver.origin === current.origin &&
    receiver.routeKey === current.routeKey &&
    !isDifferentAccount(receiver, current)
  );
}

/** A handoff from a different account must stay in storage for its destination tab. */
export function isForkSourceAccount(receiver: PageIdentity, sourceUrl: string): boolean {
  try {
    const source = new URL(sourceUrl);
    return (
      source.origin === receiver.origin &&
      !isDifferentAccount(receiver, {
        routeUserId: source.pathname.match(/^\/u\/(\d+)(?=\/)/)?.[1] ?? null,
        email: null,
      })
    );
  } catch {
    return false;
  }
}
