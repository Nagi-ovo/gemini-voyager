/**
 * Which Gemini account the folders belong to.
 *
 * The account follows the `/u/<n>/` route: with isolation on, a route that
 * names another account than the bound one rebinds the folders to that
 * account's bucket and reloads them (`reloadForAccountRoute`).
 *
 * The account gate (`GeminiFolderSession.accountMatchesPage`) compares
 * fingerprints: the route slot plus the email Gemini's own account control
 * shows. Only that control counts (`detectAccountContextFromDocument` never
 * reads emails from replies, chat titles or `mailto:` links on Gemini). A page
 * whose control cannot be read has no known account, so its fingerprint is
 * `null` and the gate stays closed until it can be read: a route slot alone,
 * or the shared `default` bucket, is never trusted to be the page's account.
 */
import {
  type AccountContext,
  type AccountScope,
  detectAccountContextFromDocument,
  extractRouteUserIdFromPath,
} from '@/core/services/AccountIsolationService';

export interface AccountRouteStore {
  readonly accountIsolationEnabled: boolean;
  readonly accountScope: AccountScope | null;
  /** The active bucket's key. */
  readonly storageKey: string;
  refreshAccountScope(): Promise<void>;
  loadData(): Promise<void>;
}

/** Resolves `true` once another account's folders were bound and loaded. */
export async function reloadForAccountRoute(
  store: AccountRouteStore,
  pathname: string = window.location.pathname,
): Promise<boolean> {
  if (!store.accountIsolationEnabled) return false;

  const routeUserId = extractRouteUserIdFromPath(pathname);
  if (routeUserId === store.accountScope?.routeUserId) return false;

  const previousStorageKey = store.storageKey;
  await store.refreshAccountScope();
  if (store.storageKey === previousStorageKey) return false;

  await store.loadData();
  return true;
}

/**
 * Which account `context` is: its `/u/<n>` slot and the email of Gemini's
 * account control. `null` when no email was read, an account no gate accepts.
 */
export function geminiAccountFingerprint(
  context: Pick<AccountContext, 'routeUserId' | 'email'> | null,
): string | null {
  return context?.email ? `${context.routeUserId ?? ''}::${context.email}` : null;
}

/** The account the page shows now; `null` while its account control cannot be read. */
export function geminiPageAccountFingerprint(): string | null {
  return geminiAccountFingerprint(detectAccountContextFromDocument(window.location.href, document));
}
