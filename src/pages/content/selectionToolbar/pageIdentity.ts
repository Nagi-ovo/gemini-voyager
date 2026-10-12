import { detectAccountContextFromDocument } from '@/core/services/AccountIsolationService';
import { extractConversationIdFromUrl } from '@/core/utils/conversationIdentity';

/** The signed-in account a page names: its `/u/N` slot and the email it shows, if any. */
export interface AccountHints {
  /** As the URL names it (`null` on `/app`); compare through `isDifferentAccount`. */
  readonly routeUserId: string | null;
  readonly email: string | null;
}

/** The chat and signed-in account a user action started from. */
export interface PageIdentity extends AccountHints {
  readonly href: string;
  readonly origin: string;
  /** Without a leading `/u/0`, as `routeKeyOf` compares it. */
  readonly pathname: string;
  /** `pathname + search`, the key route listeners compare. */
  readonly routeKey: string;
}

// Gemini's `/app/...` is account slot 0, and it may rewrite one into `/u/0/app/...` mid-action.
function withoutDefaultAccountSlot(pathname: string): string {
  return pathname.replace(/^\/u\/0(?=\/|$)/, '') || '/';
}

/** The route compared across `/app` and `/u/0/app`: the same chat either way. */
export function routeKeyOf(pathname: string, search: string): string {
  return `${withoutDefaultAccountSlot(pathname)}${search}`;
}

/** The account slot a route names; `/app` without `/u/N` is slot 0. */
export function accountSlotOf(routeUserId: string | null): string {
  return routeUserId ?? '0';
}

export function capturePageIdentity(): PageIdentity {
  const href = location.href;
  const account = detectAccountContextFromDocument(href, document);
  return {
    href,
    origin: location.origin,
    pathname: withoutDefaultAccountSlot(location.pathname),
    routeKey: routeKeyOf(location.pathname, location.search),
    routeUserId: account.routeUserId,
    email: account.email,
  };
}

/**
 * Another signed-in account: the `/u/N` slot moved, or both sides name an email and they differ.
 * An email that only appeared since capture fills in the same account; no slot means slot 0.
 */
export function isDifferentAccount(captured: AccountHints, current: AccountHints): boolean {
  if (accountSlotOf(captured.routeUserId) !== accountSlotOf(current.routeUserId)) return true;
  return captured.email !== null && current.email !== null && captured.email !== current.email;
}

function trimTrailingSlash(pathname: string): string {
  return pathname.replace(/\/+$/, '');
}

/** The same chat, including the first send turning a new-chat route into its conversation route. */
export function isSameConversation(captured: PageIdentity, current: PageIdentity): boolean {
  if (captured.origin !== current.origin) return false;
  if (captured.routeKey === current.routeKey) return true;
  if (extractConversationIdFromUrl(captured.href) !== null) return false;
  if (extractConversationIdFromUrl(current.href) === null) return false;
  return current.pathname.startsWith(`${trimTrailingSlash(captured.pathname)}/`);
}

/** Whether work accepted on `captured` may still touch the page now showing `current`. */
export function isSamePageSession(captured: PageIdentity, current: PageIdentity): boolean {
  return isSameConversation(captured, current) && !isDifferentAccount(captured, current);
}
