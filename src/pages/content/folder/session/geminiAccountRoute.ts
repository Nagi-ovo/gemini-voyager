/**
 * Gemini's account follows its `/u/<n>/` route. With isolation on, a route
 * that names another account than the bound one rebinds the folders to that
 * account's bucket and reloads them; the same account, or isolation off,
 * changes nothing.
 */
import {
  type AccountScope,
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
