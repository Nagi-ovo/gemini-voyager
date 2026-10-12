import { logger } from '@/core/services/LoggerService';

import type { ForkNode } from './forkTypes';

const NATIVE_CONVERSATION_LINKS =
  '[data-test-id="conversation"] a[href], a[data-test-id="conversation"][href]';
const NATIVE_SIDEBAR_ROOT = 'bard-sidenav, [data-test-id="all-conversations"]';

function readConversationRoute(url: URL): { path: string; id: string; account: string } | null {
  const match = url.pathname.match(/^(?:\/u\/(\d+))?(\/app\/([^/]+)|\/gem\/[^/]+\/([^/]+))\/?$/);
  if (!match) return null;
  try {
    return {
      path: match[2],
      id: decodeURIComponent(match[3] ?? match[4]),
      account: match[1] ?? '0',
    };
  } catch {
    return null;
  }
}

/** Fork navigation stays in the current account without restarting the page. */
export function navigateToForkConversation(
  node: Pick<ForkNode, 'conversationId' | 'conversationUrl'>,
): void {
  if (!node.conversationId) return;
  const accountPrefix = window.location.pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? '';
  const account = accountPrefix.split('/')[2] ?? '0';
  let target = new URL(
    `${accountPrefix}/app/${encodeURIComponent(node.conversationId)}`,
    window.location.origin,
  );
  try {
    const saved = new URL(node.conversationUrl, window.location.origin);
    const route = readConversationRoute(saved);
    if (saved.origin === window.location.origin && route?.id === node.conversationId) {
      // Stored fork URLs may belong to an old slot; keep their Gem path, not their account.
      saved.pathname = `${accountPrefix}${route.path}`;
      target = saved;
    }
  } catch {
    // Older or malformed URLs still have a usable conversation id.
  }
  if (window.location.pathname === target.pathname) return;

  const targetRoute = readConversationRoute(target);
  if (!targetRoute) return;
  for (const link of document.querySelectorAll<HTMLAnchorElement>(NATIVE_CONVERSATION_LINKS)) {
    // Voyager folder links and stale account links must not impersonate native navigation.
    if (!link.closest(NATIVE_SIDEBAR_ROOT)) continue;
    let url: URL;
    try {
      url = new URL(link.href, window.location.origin);
    } catch {
      continue;
    }
    const route = readConversationRoute(url);
    if (
      url.origin !== window.location.origin ||
      route?.account !== account ||
      route.path !== targetRoute.path
    )
      continue;
    const options = { bubbles: true, cancelable: true, view: window };
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      link.dispatchEvent(new MouseEvent(type, options));
    }
    return;
  }

  try {
    window.history.pushState({}, '', `${target.pathname}${target.search}${target.hash}`);
    window.dispatchEvent(
      typeof PopStateEvent === 'function'
        ? new PopStateEvent('popstate', { state: window.history.state })
        : new Event('popstate'),
    );
  } catch (error) {
    // A failed router transition must not fall back to a full reload and lose page state.
    logger.warn('Fork SPA navigation failed', { error });
  }
}
