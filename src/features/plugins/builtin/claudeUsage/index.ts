import { StorageKeys } from '@/core/types/common';
import { getVoyagerBuildTarget } from '@/core/utils/browser';

import { CLAUDE_USAGE_PILL_ID, ClaudeUsagePill } from './usagePill';
import {
  type ClaudeUsageSnapshot,
  asRecord,
  hasCountdownData,
  hasExpectedModelMetric,
  isUsageSnapshot,
  mergeUsageSnapshot,
  planFromClaudeBootstrap,
  sameSnapshotData,
  scrapeClaudeUsageFromDocument,
  snapshotFromClaudeMessageLimit,
  snapshotFromClaudeUsageApi,
} from './usageSnapshot';

const OBSERVER_SCRIPT_ID = 'gv-claude-usage-observer-script';
const OBSERVER_SOURCE = 'gv-claude-usage-observer';
const CLAUDE_ORIGIN = 'https://claude.ai';
const SCRAPE_DELAY_MS = 250;
const REFRESH_INTERVAL_MS = 5 * 60_000;
const COUNTDOWN_REFRESH_MS = 30_000;
const REFRESH_LOCK_TTL_MS = 30_000;
const STALE_MS = 60_000;

interface ClaudeUsageRefreshLock {
  owner: string;
  expiresAt: number;
}

const pill = new ClaudeUsagePill(claudeUsageUrl, openClaudeUsage);

let snapshot: ClaudeUsageSnapshot | null = null;
let observer: MutationObserver | null = null;
let scrapeTimer: number | null = null;
let refreshTimer: number | null = null;
let countdownTimer: number | null = null;
let refreshInFlight = false;
let visibilityHandler: (() => void) | null = null;
let observerMessageHandler: ((ev: MessageEvent) => void) | null = null;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
let reloadPage = (): void => location.reload();
const refreshOwnerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
// Each stop bumps this generation; async usage/bootstrap fetches and cache reads capture it at entry
// and recheck before DOM writes, so late work cannot resurrect a disabled plugin's pill.
let generation = 0;

export function claudeUsageUrl(pathname = location.pathname, search = location.search): string {
  return `${CLAUDE_ORIGIN}${pathname === '/' ? '/new' : pathname}${search}#settings/usage`;
}

export function isClaudeUsageSettings(hash = location.hash): boolean {
  return /^#settings\/usage(?:\b|$)/.test(hash);
}

export function setClaudeUsageReloadForTest(fn: (() => void) | null): void {
  reloadPage = fn ?? (() => location.reload());
}

function getLastActiveOrg(cookie = document.cookie): string | null {
  try {
    const row = cookie
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('lastActiveOrg='));
    const value = row?.split('=')[1];
    return value ? decodeURIComponent(value) : null;
  } catch {
    return null;
  }
}

function isPillNode(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement;
  return Boolean(el?.closest(`#${CLAUDE_USAGE_PILL_ID}`));
}

function isPillMutation(mutation: MutationRecord): boolean {
  if (isPillNode(mutation.target)) return true;
  const changed = [...mutation.addedNodes, ...mutation.removedNodes];
  return changed.length > 0 && changed.every(isPillNode);
}

function lockFromStorage(value: unknown): ClaudeUsageRefreshLock | null {
  const data = asRecord(value);
  if (!data) return null;
  if (typeof data.owner !== 'string' || typeof data.expiresAt !== 'number') return null;
  return { owner: data.owner, expiresAt: data.expiresAt };
}

function hasClaudeUsageContent(): boolean {
  return scrapeClaudeUsageFromDocument() !== null;
}

function openClaudeUsage(event: MouseEvent): void {
  event.stopPropagation();
  event.preventDefault();

  const previous = location.href;
  const next = new URL(claudeUsageUrl());
  history.pushState(null, '', `${next.pathname}${next.search}${next.hash}`);
  window.dispatchEvent(
    new HashChangeEvent('hashchange', { oldURL: previous, newURL: location.href }),
  );

  // Claude sometimes mounts usage only on load; reload the same chat only if the hash did not open it.
  if (!hasClaudeUsageContent()) reloadPage();
}

function applyStoredSnapshot(cached: ClaudeUsageSnapshot): void {
  if (!snapshot || cached.updatedAt > snapshot.updatedAt) {
    snapshot = mergeUsageSnapshot(cached, snapshot, 'cache');
  }
}

async function readCache(): Promise<ClaudeUsageSnapshot | null> {
  try {
    const result = await chrome.storage?.local?.get({ [StorageKeys.GV_CLAUDE_USAGE_CACHE]: null });
    const raw = result?.[StorageKeys.GV_CLAUDE_USAGE_CACHE];
    return isUsageSnapshot(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function loadCache(): Promise<void> {
  const cached = await readCache();
  if (cached) applyStoredSnapshot(cached);
}

async function saveCache(next: ClaudeUsageSnapshot): Promise<void> {
  try {
    await chrome.storage?.local?.set({ [StorageKeys.GV_CLAUDE_USAGE_CACHE]: next });
  } catch {
    // ignore
  }
}

function applySnapshot(
  next: ClaudeUsageSnapshot,
  source: 'scrape' | 'message-limit' = 'scrape',
): void {
  const merged = mergeUsageSnapshot(next, snapshot, source);
  if (snapshot && sameSnapshotData(snapshot, merged)) return;
  snapshot = merged;
  pill.render(snapshot);
  void saveCache(merged);
}

function injectClaudeUsageObserver(): void {
  // Safari registers this optional observer in MAIN world from the background.
  // DOM-injected extension scripts are rejected by Claude's page CSP.
  if (getVoyagerBuildTarget() === 'safari') return;
  try {
    if (document.getElementById(OBSERVER_SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = OBSERVER_SCRIPT_ID;
    script.src = chrome.runtime.getURL('claude-usage-observer.js');
    script.async = false;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  } catch {
    // Missing page bridge only means we keep the API + DOM fallback path.
  }
}

function setupObserverBridge(): void {
  if (observerMessageHandler) return;
  observerMessageHandler = (ev: MessageEvent) => {
    if (ev.source !== window) return;
    const data = ev.data as { source?: string; type?: string; payload?: unknown } | null;
    if (!data || data.source !== OBSERVER_SOURCE || data.type !== 'message-limit') return;
    const next = snapshotFromClaudeMessageLimit(data.payload);
    if (next) applySnapshot(next, 'message-limit');
  };
  window.addEventListener('message', observerMessageHandler);
}

function teardownObserverBridge(): void {
  if (!observerMessageHandler) return;
  window.removeEventListener('message', observerMessageHandler);
  observerMessageHandler = null;
}

async function fetchPlanFromBootstrap(orgId: string): Promise<string | undefined> {
  try {
    const response = await fetch(
      `https://claude.ai/api/bootstrap/${encodeURIComponent(orgId)}/app_start?statsig_hashing_algorithm=djb2`,
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
    if (!response.ok) return undefined;
    return planFromClaudeBootstrap(await response.json(), orgId);
  } catch {
    return undefined;
  }
}

async function discoverClaudeOrgId(): Promise<string | null> {
  try {
    const response = await fetch('https://claude.ai/api/organizations', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const orgs = await response.json();
    if (!Array.isArray(orgs)) return null;
    const first = orgs.find((org) => typeof asRecord(org)?.uuid === 'string');
    return (asRecord(first)?.uuid as string | undefined) ?? null;
  } catch {
    return null;
  }
}

async function getClaudeOrgId(): Promise<string | null> {
  return getLastActiveOrg() ?? discoverClaudeOrgId();
}

async function acquireRefreshLock(): Promise<boolean> {
  try {
    const now = Date.now();
    const result = await chrome.storage?.local?.get({
      [StorageKeys.GV_CLAUDE_USAGE_REFRESH_LOCK]: null,
    });
    const current = lockFromStorage(result?.[StorageKeys.GV_CLAUDE_USAGE_REFRESH_LOCK]);
    if (current && current.owner !== refreshOwnerId && current.expiresAt > now) return false;

    const next: ClaudeUsageRefreshLock = {
      owner: refreshOwnerId,
      expiresAt: now + REFRESH_LOCK_TTL_MS,
    };
    await chrome.storage?.local?.set({ [StorageKeys.GV_CLAUDE_USAGE_REFRESH_LOCK]: next });

    const confirmed = await chrome.storage?.local?.get({
      [StorageKeys.GV_CLAUDE_USAGE_REFRESH_LOCK]: null,
    });
    return (
      lockFromStorage(confirmed?.[StorageKeys.GV_CLAUDE_USAGE_REFRESH_LOCK])?.owner ===
      refreshOwnerId
    );
  } catch {
    return true;
  }
}

async function releaseRefreshLock(): Promise<void> {
  try {
    const result = await chrome.storage?.local?.get({
      [StorageKeys.GV_CLAUDE_USAGE_REFRESH_LOCK]: null,
    });
    const current = lockFromStorage(result?.[StorageKeys.GV_CLAUDE_USAGE_REFRESH_LOCK]);
    if (current?.owner !== refreshOwnerId) return;
    await chrome.storage?.local?.set({
      [StorageKeys.GV_CLAUDE_USAGE_REFRESH_LOCK]: { owner: refreshOwnerId, expiresAt: 0 },
    });
  } catch {
    // ignore
  }
}

async function hasFreshSharedCache(maxAgeMs: number): Promise<boolean> {
  const g = generation;
  const cached = await readCache();
  if (g !== generation || !cached) return false;
  applyStoredSnapshot(cached);
  if (Date.now() - cached.updatedAt >= maxAgeMs) return false;
  if (!cached.plan) return false;
  if (!hasCountdownData(cached)) return false;
  // Older builds cached only 5h + Week. Do not let that otherwise-fresh
  // snapshot hide the newly exposed Fable bucket after an extension update.
  if (!hasExpectedModelMetric(cached)) return false;
  pill.render(snapshot);
  return true;
}

async function refreshFromApi(force = false): Promise<void> {
  const g = generation;
  if (
    !force &&
    snapshot?.plan &&
    hasCountdownData(snapshot) &&
    Date.now() - snapshot.updatedAt < STALE_MS
  ) {
    return;
  }
  if (await hasFreshSharedCache(force ? REFRESH_INTERVAL_MS : STALE_MS)) return;
  if (!force && (await hasFreshSharedCache(REFRESH_INTERVAL_MS))) return;
  if (g !== generation || refreshInFlight) return;
  const orgId = await getClaudeOrgId();
  if (g !== generation || !orgId) return;
  if (!(await acquireRefreshLock())) return;
  if (g !== generation) {
    void releaseRefreshLock();
    return;
  }
  refreshInFlight = true;
  try {
    const response = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (g !== generation || !response.ok) return;
    const next = snapshotFromClaudeUsageApi(await response.json());
    if (g !== generation || !next) return;
    const plan = next.plan ?? (await fetchPlanFromBootstrap(orgId)) ?? snapshot?.plan;
    if (g !== generation) return;
    snapshot = { ...next, plan };
    pill.render(snapshot);
    await saveCache(snapshot);
  } catch {
    // ignore
  } finally {
    refreshInFlight = false;
    void releaseRefreshLock();
  }
}

function scrapeNow(): void {
  if (!isClaudeUsageSettings()) return;
  const next = scrapeClaudeUsageFromDocument();
  if (!next) return;
  applySnapshot(next);
  if (!snapshot || !hasCountdownData(snapshot)) void refreshFromApi(true);
}

function scheduleScrape(): void {
  if (scrapeTimer !== null) clearTimeout(scrapeTimer);
  scrapeTimer = window.setTimeout(() => {
    scrapeTimer = null;
    scrapeNow();
  }, SCRAPE_DELAY_MS);
}

function refreshObserver(): void {
  observer?.disconnect();
  observer = null;
  if (!isClaudeUsageSettings() || !document.body) return;
  observer = new MutationObserver((mutations) => {
    if (!mutations.every(isPillMutation)) scheduleScrape();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  scheduleScrape();
}

function startRefreshLoop(): void {
  if (refreshTimer !== null) return;
  void refreshFromApi();
  refreshTimer = window.setInterval(() => {
    void refreshFromApi(true);
  }, REFRESH_INTERVAL_MS);
  countdownTimer = window.setInterval(() => {
    if (snapshot) pill.render(snapshot);
  }, COUNTDOWN_REFRESH_MS);
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') void refreshFromApi();
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

function stopRefreshLoop(): void {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

export function startClaudeUsage(): void {
  if (pill.mounted) return;
  const g = generation;
  setupObserverBridge();
  injectClaudeUsageObserver();
  pill.render(snapshot);
  void loadCache().then(() => {
    if (g === generation) pill.render(snapshot);
  });
  void pill.loadPosition().then(() => {
    if (g === generation && pill.mounted) pill.position();
  });
  refreshObserver();
  startRefreshLoop();
  pill.start();
  window.addEventListener('hashchange', refreshObserver);
  if (chrome.storage?.onChanged && !storageListener) {
    storageListener = (changes, areaName) => {
      if (areaName !== 'local') return;
      const change = changes[StorageKeys.GV_CLAUDE_USAGE_CACHE];
      if (change?.newValue) {
        const next = change.newValue as ClaudeUsageSnapshot;
        if (!snapshot || next.updatedAt > snapshot.updatedAt) {
          snapshot = mergeUsageSnapshot(next, snapshot, 'storage-change');
          pill.render(snapshot);
        }
      }
      const posChange = changes[StorageKeys.GV_CLAUDE_USAGE_POS];
      if (posChange) {
        pill.applyStoredPosition(posChange.newValue);
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
  }
}

export function stopClaudeUsage(): void {
  generation++;
  if (scrapeTimer !== null) clearTimeout(scrapeTimer);
  scrapeTimer = null;
  observer?.disconnect();
  observer = null;
  teardownObserverBridge();
  stopRefreshLoop();
  window.removeEventListener('hashchange', refreshObserver);
  if (storageListener && chrome.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(storageListener);
  }
  storageListener = null;
  pill.dispose();
  snapshot = null;
}
