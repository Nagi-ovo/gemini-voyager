import { hashString } from '@/core/utils/hash';
import { NATIVE_SITE_IDS, SiteRegistry } from '@/features/plugins/sites/registry';

import { type SavedLibraryFilter, type SavedLibraryItem, filterSavedLibraryItems } from './model';

export const ALL_FILTER = 'all';
export const UNKNOWN_SITE = 'unknown';
export const UNASSIGNED_ACCOUNT = 'unassigned';

export interface SavedLibrarySelection {
  kind: SavedLibraryFilter;
  query: string;
  site: string;
  account: string;
}

export interface SavedLibraryGroup {
  id: string;
  title?: string;
  site: string;
  siteLabel: string;
  account: string;
  accountNumber?: number;
  items: SavedLibraryItem[];
}

export interface SavedLibraryView {
  items: SavedLibraryItem[];
  groups: SavedLibraryGroup[];
  sites: { id: string; label: string }[];
  accounts: { id: string; number: number }[];
}

function itemSite(item: SavedLibraryItem, registry: SiteRegistry): string {
  if (item.kind === 'highlight' && item.platform) return item.platform;
  const prefix = item.conversationId.includes(':') ? item.conversationId.split(':')[0] : null;
  const site = registry.resolveByUrl(item.conversationUrl);
  if (!site) return UNKNOWN_SITE;
  return prefix
    ? prefix === site.id
      ? site.id
      : UNKNOWN_SITE
    : NATIVE_SITE_IDS.has(site.id)
      ? site.id
      : UNKNOWN_SITE;
}

function itemAccount(item: SavedLibraryItem, site: string): string {
  if (item.accountHash) return JSON.stringify([site, 'hash', item.accountHash]);
  if (!item.account) return UNASSIGNED_ACCOUNT;
  // Gemini stars capture accountKey; highlightAnnotationData hashes that same key.
  const identity = site === 'gemini' ? ['hash', hashString(item.account)] : ['star', item.account];
  return JSON.stringify([site, ...identity]);
}

export function getSavedLibraryView(
  items: readonly SavedLibraryItem[],
  selection: SavedLibrarySelection,
): SavedLibraryView {
  const registry = SiteRegistry.createDefault();
  const sorted = [...items].sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id));
  const located = sorted.map((item) => {
    const site = itemSite(item, registry);
    return { item, site, account: itemAccount(item, site) };
  });
  const accountSites = new Set(NATIVE_SITE_IDS);
  if (located.some(({ site, account }) => site === 'chatgpt' && account !== UNASSIGNED_ACCOUNT))
    accountSites.add('chatgpt');
  const siteIds = new Set(located.map(({ site }) => site));
  const sites = registry
    .all()
    .filter((site) => siteIds.has(site.id))
    .map(({ id, label }) => ({ id, label }));
  if (siteIds.has(UNKNOWN_SITE)) sites.push({ id: UNKNOWN_SITE, label: '' });

  const firstSeenBySite = new Map<string, Map<string, number>>();
  for (const { item, site, account } of located) {
    if (!accountSites.has(site)) continue;
    const firstSeen = firstSeenBySite.get(site) ?? new Map<string, number>();
    firstSeen.set(
      account,
      Math.min(firstSeen.get(account) ?? Infinity, item.firstSeenAt ?? item.savedAt),
    );
    firstSeenBySite.set(site, firstSeen);
  }
  const accountsBySite = new Map(
    [...firstSeenBySite].map(([site, firstSeen]) => {
      const accounts = [...firstSeen]
        .filter(([id]) => id !== UNASSIGNED_ACCOUNT)
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
        .map(([id], index) => ({ id, number: index + 1 }));
      if (firstSeen.has(UNASSIGNED_ACCOUNT)) accounts.push({ id: UNASSIGNED_ACCOUNT, number: 0 });
      return [site, accounts] as const;
    }),
  );
  const accounts = accountsBySite.get(selection.site) ?? [];

  const matches = new Set(filterSavedLibraryItems(sorted, selection.kind, selection.query));
  const titles = new Map<string, string>();
  const groups = new Map<string, SavedLibraryGroup>();
  const visible: SavedLibraryItem[] = [];
  for (const { item, site, account } of located) {
    const id = JSON.stringify([site, account, item.conversationId]);
    if (!titles.has(id) && item.conversationTitle?.trim()) titles.set(id, item.conversationTitle);
    if (!matches.has(item) || (selection.site !== ALL_FILTER && selection.site !== site)) continue;
    if (
      selection.account !== ALL_FILTER &&
      accountSites.has(selection.site) &&
      selection.account !== account
    )
      continue;
    visible.push(item);
    const group = groups.get(id) ?? {
      id,
      site,
      account,
      items: [],
      siteLabel: sites.find((option) => option.id === site)?.label ?? '',
      accountNumber: accountsBySite.get(site)?.find((option) => option.id === account)?.number,
    };
    group.items.push(item);
    groups.set(id, group);
  }
  return {
    items: visible,
    groups: [...groups.values()].map((group) => ({ ...group, title: titles.get(group.id) })),
    sites,
    accounts,
  };
}
