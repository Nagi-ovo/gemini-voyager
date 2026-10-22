/**
 * Folder platforms for sites the extension ships but the frozen registry does
 * not name: a bundled `site.json` that carries a `folders` section and a
 * conversation route gets one unscoped bucket per browser profile in
 * `chrome.storage.local`, with every serialized name derived from its id.
 *
 * Trust comes only from the bundled data passed in here, never from a remote
 * or local site: the bucket's one host is the first exact `https://` host of
 * the bundled `matches`, and no other host may write it, sync it or name its
 * conversations in an import. A site whose id or host could pass for a frozen
 * site's gets nothing, since its names would sit next to (or answer for) the
 * folders users already have.
 */
import type { FolderExportPayload, ImportStrategy } from '@/features/folder/types/import-export';
import { matchesAnyPattern } from '@/features/plugins/sites/matchPattern';
import type { SiteAdapter } from '@/features/plugins/types';

import { type SiteIdentity, createSiteIdentity } from './siteIdentity';
import { type SiteTransfer, createSiteTransfer } from './siteTransfer';

declare const derivedFolderSite: unique symbol;

/** A site id the derived registry vouched for; only `deriveFolderSites` hands one out. */
export type DerivedFolderPlatform = string & { readonly [derivedFolderSite]: true };

export type DerivedSyncTimeField = `lastUploadTime:${string}` | `lastSyncTime:${string}`;

/** The serialized names of a derived site; each spelling is persisted user data. */
export interface DerivedFolderPlatformDefinition {
  hosts: readonly string[];
  folderStorageKey: `gvFolderData:${string}`;
  accountIsolationStorageKey: null;
  syncsSharedData: false;
  folderExport: {
    platform: DerivedFolderPlatform;
    read: (
      value: unknown,
      strategy?: ImportStrategy,
    ) =>
      | { ok: true; payload: FolderExportPayload }
      | { ok: false; reason: 'invalid' | 'wrong-site'; message?: string };
  };
  driveFoldersFileName: `gemini-voyager-${string}-folders.json`;
  syncsConversationExtras: false;
  backupNamespace: `${string}-folders`;
  lastUploadTimeField: `lastUploadTime:${string}`;
  lastUploadTimeStorageKey: `gvLastUploadTime:${string}`;
  lastSyncTimeField: `lastSyncTime:${string}`;
  lastSyncTimeStorageKey: `gvLastSyncTime:${string}`;
}

export interface DerivedFolderSite {
  readonly id: DerivedFolderPlatform;
  /** `https://<host>`: the only origin whose conversations the bucket files and imports. */
  readonly origin: string;
  readonly definition: DerivedFolderPlatformDefinition;
  readonly identity: SiteIdentity;
  readonly transfer: SiteTransfer<DerivedFolderPlatform>;
}

/** What a derived site must not collide with: the frozen sites' definitions. */
export interface FrozenFolderNames {
  readonly hosts: readonly string[];
  readonly [name: string]: unknown;
}

const EXACT_HTTPS_HOST =
  /^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)\//;

/** The first exact `https://` host of `matches`; wildcards, ports and `http` never qualify. */
function canonicalHost(matches: readonly string[]): string | null {
  for (const pattern of matches) {
    const host = EXACT_HTTPS_HOST.exec(pattern.trim().toLowerCase())?.[1];
    if (host) return host;
  }
  return null;
}

/** `chat-gpt`, `gemini-pro` or `my-claude` would pass for a frozen site in a file or a list. */
function spoofsFrozenId(id: string, frozenIds: readonly string[]): boolean {
  const bare = id.replace(/-/g, '');
  return frozenIds.some(
    (frozen) =>
      id === frozen || bare === frozen || id.startsWith(`${frozen}-`) || id.endsWith(`-${frozen}`),
  );
}

function definitionOf(
  id: DerivedFolderPlatform,
  host: string,
  transfer: SiteTransfer<DerivedFolderPlatform>,
): DerivedFolderPlatformDefinition {
  return Object.freeze({
    hosts: Object.freeze([host]),
    folderStorageKey: `gvFolderData:${id}`,
    accountIsolationStorageKey: null,
    syncsSharedData: false,
    folderExport: Object.freeze({ platform: id, read: transfer.read }),
    driveFoldersFileName: `gemini-voyager-${id}-folders.json`,
    syncsConversationExtras: false,
    backupNamespace: `${id}-folders`,
    lastUploadTimeField: `lastUploadTime:${id}`,
    lastUploadTimeStorageKey: `gvLastUploadTime:${id}`,
    lastSyncTimeField: `lastSyncTime:${id}`,
    lastSyncTimeStorageKey: `gvLastSyncTime:${id}`,
  } as const);
}

/** Every serialized name a definition owns, for the collision check. */
function namesOf(definition: object): string[] {
  return Object.entries(definition).flatMap(([field, value]) =>
    field !== 'hosts' && typeof value === 'string' ? [value] : [],
  );
}

/**
 * The derived folder sites among `bundled`, keyed by id. `frozen` are the
 * frozen registry's definitions by id: a frozen id keeps its row, and a site
 * that spoofs one, or reaches one of its hosts, is left out. Two sites on one
 * host both are, since neither could be told to own it.
 */
export function deriveFolderSites(
  bundled: readonly SiteAdapter[],
  frozen: Readonly<Record<string, FrozenFolderNames>>,
): ReadonlyMap<DerivedFolderPlatform, DerivedFolderSite> {
  const frozenIds = Object.keys(frozen);
  const frozenHosts = new Set(frozenIds.flatMap((id) => frozen[id].hosts));
  const frozenNames = new Set(frozenIds.flatMap((id) => namesOf(frozen[id])));
  // A frozen site's bundled matches can reach hosts its bucket never names (ChatGPT's legacy host).
  const frozenMatches = bundled
    .filter((adapter) => frozenIds.includes(adapter.id))
    .flatMap((adapter) => adapter.matches);

  const candidates = bundled.flatMap((adapter) => {
    if (!adapter.folders || !adapter.conversationIdPattern) return [];
    if (spoofsFrozenId(adapter.id, frozenIds)) return [];
    const host = canonicalHost(adapter.matches);
    if (!host || frozenHosts.has(host) || matchesAnyPattern(`https://${host}/`, frozenMatches)) {
      return [];
    }
    return [{ adapter, host }];
  });
  const hostCount = new Map<string, number>();
  for (const { host } of candidates) hostCount.set(host, (hostCount.get(host) ?? 0) + 1);

  const sites = new Map<DerivedFolderPlatform, DerivedFolderSite>();
  for (const { adapter, host } of candidates) {
    if (hostCount.get(host) !== 1 || sites.has(adapter.id as DerivedFolderPlatform)) continue;
    const id = adapter.id as DerivedFolderPlatform;
    const origin = `https://${host}`;
    const identity = createSiteIdentity(adapter, origin);
    const transfer = createSiteTransfer({ platform: id, origin, read: identity.read });
    const definition = definitionOf(id, host, transfer);
    if (namesOf(definition).some((name) => frozenNames.has(name))) continue;
    sites.set(id, Object.freeze({ id, origin, definition, identity, transfer }));
  }
  return sites;
}
