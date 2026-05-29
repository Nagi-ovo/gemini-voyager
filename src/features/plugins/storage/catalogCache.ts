/**
 * Storage-backed cache of the plugin catalog fetched from the marketplace.
 *
 * The catalog (the list of available plugin manifests) is network-derived, so we
 * cache it in `chrome.storage.local` with a TTL. All three consumers — popup
 * (the list UI), content script (`PluginHost`), and background (origin
 * derivation) — read through the same cache, so the network is hit at most once
 * per TTL window regardless of how many contexts ask.
 */
import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import type { PluginManifest } from '../types';

export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const KEY = StorageKeys.PLUGIN_CATALOG_CACHE;

export interface CachedCatalog {
  readonly manifests: readonly PluginManifest[];
  readonly fetchedAt: number;
}

function localArea(): chrome.storage.LocalStorageArea | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome?.storage?.local;
}

export async function loadCachedCatalog(): Promise<CachedCatalog | null> {
  const local = localArea();
  if (!local) return null;
  try {
    const result = await local.get({ [KEY]: null });
    const raw = result?.[KEY];
    if (
      raw &&
      typeof raw === 'object' &&
      Array.isArray((raw as CachedCatalog).manifests) &&
      typeof (raw as CachedCatalog).fetchedAt === 'number'
    ) {
      return raw as CachedCatalog;
    }
    return null;
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      logger.warn('loadCachedCatalog failed', { error: String(error) });
    }
    return null;
  }
}

export async function saveCachedCatalog(
  manifests: readonly PluginManifest[],
  fetchedAt: number,
): Promise<void> {
  const local = localArea();
  if (!local) return;
  try {
    await local.set({ [KEY]: { manifests, fetchedAt } satisfies CachedCatalog });
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      logger.warn('saveCachedCatalog failed', { error: String(error) });
    }
  }
}

/** Stable signature of a cached catalog's manifests, ignoring `fetchedAt`. */
function manifestsSignature(raw: unknown): string {
  if (raw && typeof raw === 'object' && Array.isArray((raw as CachedCatalog).manifests)) {
    try {
      return JSON.stringify((raw as CachedCatalog).manifests);
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Fire `callback` whenever the catalog's *manifest content* changes (e.g. a
 * manual refresh that pulls updated plugin CSS).
 *
 * Crucially, a write that only bumps `fetchedAt` — which every background
 * refresh does via `saveCachedCatalog(manifests, Date.now())` — is ignored.
 * Otherwise a subscriber that reloads-then-refreshes (the content-script
 * PluginHost) would self-trigger: save → onChanged → reload → list() → refresh
 * → save → … a fetch storm that Chrome aborts with ERR_INSUFFICIENT_RESOURCES.
 */
export function subscribeCatalog(callback: () => void): () => void {
  const onChanged = (globalThis as { chrome?: typeof chrome }).chrome?.storage?.onChanged;
  if (!onChanged) return () => {};
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local' || !changes[KEY]) return;
    const change = changes[KEY];
    if (manifestsSignature(change.oldValue) !== manifestsSignature(change.newValue)) callback();
  };
  onChanged.addListener(listener);
  return () => {
    try {
      onChanged.removeListener(listener);
    } catch {
      // ignore — context may be gone
    }
  };
}
