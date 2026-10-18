/**
 * `catalog.refresh`: re-fetch a host's site data now instead of at the next
 * scheduled check. The only bridge op the service worker runs entirely on its
 * own: no tab, no page lease. It goes through the one shared refresher, so it
 * joins a check already in flight instead of fetching twice.
 */
import {
  CATALOG_REFRESH_DEFAULT_HOST,
  type CatalogRefreshParams,
  type CatalogRefreshResult,
  type CatalogRefreshStatus,
  type TaskResultRequest,
  bridgeError,
} from '@/features/bridge/protocol';
import {
  type HostCatalogCacheEntry,
  siteAdapterFromEntry,
} from '@/features/plugins/remote/hostCatalogCache';
import type { HostCatalogRefreshResult } from '@/features/plugins/remote/hostCatalogRefresh';

const MAX_REASON_LENGTH = 1_000;

export interface CatalogRefreshDeps {
  /** A forced refresh: it skips the check interval, the failure backoff and the online-update switch. */
  readonly refresh: (host: string) => Promise<HostCatalogRefreshResult>;
  readonly loadEntry: (host: string) => Promise<HostCatalogCacheEntry | null>;
  readonly extensionVersion: string;
}

export type CatalogRefreshRunner = (params: CatalogRefreshParams) => Promise<TaskResultRequest>;

const WIRE_STATUSES: ReadonlySet<string> = new Set<CatalogRefreshStatus>([
  'updated',
  'unchanged',
  'missing',
  'failed',
  'disabled',
]);

function isWireStatus(status: string): status is CatalogRefreshStatus {
  return WIRE_STATUSES.has(status);
}

export function createCatalogRefreshRunner(deps: CatalogRefreshDeps): CatalogRefreshRunner {
  return async (params) => {
    const host = params.host ?? CATALOG_REFRESH_DEFAULT_HOST;
    let outcome: HostCatalogRefreshResult;
    try {
      outcome = await deps.refresh(host);
    } catch (error) {
      outcome = { ok: true, status: 'failed', reason: String(error) };
    }
    if (outcome.status === 'invalid-host') {
      return { ok: false, error: bridgeError('bad-request', `${host} has no online site data.`) };
    }
    // A forced refresh never skips; anything else it reports is not a fetched catalog.
    const status = isWireStatus(outcome.status) ? outcome.status : 'failed';
    const reason = status === outcome.status ? outcome.reason : `refresh ${outcome.status}`;
    const entry = await deps.loadEntry(host).catch(() => null);
    const site = siteAdapterFromEntry(entry, deps.extensionVersion);
    const result: CatalogRefreshResult = {
      host,
      status,
      revision: site?.catalogRevision ?? null,
      ...(outcome.checkedAt === undefined ? {} : { checkedAt: outcome.checkedAt }),
      ...(reason ? { reason: reason.slice(0, MAX_REASON_LENGTH) } : {}),
      extensionVersion: deps.extensionVersion,
    };
    return { ok: true, data: result };
  };
}
