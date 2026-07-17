/**
 * Gems Sidebar — hangs a thin list of recently-used gems off Gemini's native
 * `gem-nav-list-item[data-test-id="gems-side-nav-entry-button"]` so the
 * sidebar reads as if Gemini's own Gems entry expanded inline.
 *
 * Four responsibilities live in this module:
 *
 *   1. **Scraper** (runs only on `/gems/view`): when the user visits the Gems
 *      management page, parse the rendered `bot-list-row` items and write
 *      them to `chrome.storage.local[GV_GEMS_LIST_CACHE]`. This is the catalog
 *      of known gems (names/icons/descriptions) and the fallback render order.
 *      A MutationObserver keeps it in sync as the user reorders/renames/creates
 *      gems — all without any network calls of our own.
 *
 *   2. **MRU tracker** (runs on every Gemini page): whenever the user lands on
 *      a `/gem/<id>` page — a custom OR a premade gem — capture its identity
 *      off the zero-state hero and push it to the front of
 *      `chrome.storage.local[GV_GEMS_MRU]`. This is what makes the list reflect
 *      *recently used* gems rather than the static management-page order, and it
 *      surfaces premade gems the scraper can't see. The render ranks MRU first,
 *      newest first, then pads with the catalog; an empty MRU degrades to the
 *      catalog order (the original behavior).
 *
 *   3. **Injector** (runs on every Gemini page): when the count preference is
 *      > 0, append a list element immediately after the native Gems nav
 *      item. The injector survives Gemini's frequent sidebar re-renders the
 *      same way the folder manager does — a per-frame mutation-observed
 *      enforcer.
 *
 *   4. **Pin toggle** (runs only on `/gems/view`): after every scrape, inject
 *      a pin/unpin button next to each `bot-list-row`. The button reads/writes
 *      `chrome.storage.sync[GV_GEMS_PINNED]` — an ordered list of gem ids the
 *      user explicitly wants in the sidebar. Pinned gems always render first
 *      (in pin order) and are never trimmed by the sidebar count.
 *
 * The popup exposes `GV_GEMS_SIDEBAR_COUNT` (0-10). `count=0` is the disabled
 * state: the injector tears down its UI and exits. `count>0` shows that many
 * cached items. No expand/collapse, no "view all" — clicking Gemini's own
 * Gems entry already opens the full list.
 */
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import { watchRouteChanges } from '../utils/routeWatcher';
import { injectPinButtons, listenPinnedChanges } from './pinToggle';

/** Single gem as we cache and render it. Keep this small — chrome.storage. */
export interface GemMetadata {
  /** Slug parsed out of `/gem/<id>`. Doubles as a stable React-style key. */
  id: string;
  /** Path-only href; navigation prepends the gemini.google.com origin. */
  href: string;
  /** Display name, e.g. "Resume Coach". */
  name: string;
  /** Optional short description. Some gems don't have one. */
  description?: string;
  /** Single-character logo letter Gemini shows when no avatar is set. */
  iconLetter?: string;
}

/** Cache envelope persisted in chrome.storage.local. */
export interface GemCacheEnvelope {
  items: GemMetadata[];
  cachedAt: number;
  accountSegment?: string;
}

/** A gem the user has opened, plus when. Newest first in storage. */
export interface GemMruEntry extends GemMetadata {
  lastUsedAt: number;
}

/** MRU envelope persisted in chrome.storage.local. */
interface GemMruEnvelope {
  entries: GemMruEntry[];
}

const LIST_CLASS = 'gv-gems-inline-list';
const TOGGLE_CLASS = 'gv-gems-expand-toggle';
const HOST_CLASS = 'gv-gems-toggle-host';
const SCRAPE_DEBOUNCE_MS = 300;
const DEFAULT_COUNT = 3;
const MAX_COUNT = 10;
// Keep a little more recent history than we ever render so raising the count
// (or re-enabling the feature) still has gems to rank.
const MRU_CAP = 20;
// The gem zero-state hero renders a tick after we land on /gem/<id>; retry a
// few times before giving up on capturing its name.
const MRU_CAPTURE_RETRY_MS = 400;
const MRU_CAPTURE_MAX_ATTEMPTS = 6;
// How often to poll the pathname for SPA navigations the pushState wrapper
// can't see (Gemini's router lives in the page's main world).
const EXPANDED_STORAGE_KEY = 'gvGemsSidebarExpanded';

/** Module-level singleton — only one injector ever needs to run per tab. */
let scrapeObserver: MutationObserver | null = null;
let scrapeTimer: number | null = null;
let scrapeRetryTimer: number | null = null;
let positionObserver: MutationObserver | null = null;
let enforceRafId: number | null = null;
let positionRetryTimer: number | null = null;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
let injectedList: HTMLElement | null = null;
let injectedToggle: HTMLElement | null = null;
let currentCount = 0;
let currentCache: GemCacheEnvelope = { items: [], cachedAt: 0 };
let currentMru: GemMruEntry[] = [];
let currentPinned: string[] = [];
let mruRetryTimer: number | null = null;
let mruCaptureAttempts = 0;
let stopRouteWatcher: (() => void) | null = null;
// Default to expanded so users see the recent gems immediately the first time
// they enable the feature; the chevron lets them collapse if they want it
// out of the way. Persisted in chrome.storage.local.
let expanded = true;

// -----------------------------------------------------------------------------
// Scraper
// -----------------------------------------------------------------------------

/**
 * Parse the rendered Gems management page into the cache schema.
 * Pure / side-effect-free so the scraper can be unit-tested in isolation.
 */
export function scrapeGemsFromDocument(doc: Document = document): GemMetadata[] {
  const list = doc.querySelector('[data-test-id="your-gems-list"]');
  if (!list) return [];

  const rows = list.querySelectorAll('bot-list-row');
  const items: GemMetadata[] = [];

  rows.forEach((row) => {
    const anchor = row.querySelector<HTMLAnchorElement>('a.bot-row, a[href*="/gem/"]');
    const href = anchor?.getAttribute('href') ?? '';
    const parsed = parseGemHref(href);
    if (!anchor || !parsed) return;

    const { id, path } = parsed;

    // Gemini's title is split across `.title-container > div`. Reading the
    // anchor's textContent and stripping the logo-letter prefix yields the
    // most reliable name across Angular re-renders.
    const titleEl =
      anchor.querySelector('.title-container') ?? anchor.querySelector('.bot-title-inner');
    const rawName = titleEl?.textContent?.trim();
    if (!rawName) return;

    const descriptionEl = anchor.querySelector('.bot-desc');
    const description = descriptionEl?.textContent?.trim() || undefined;

    const iconEl = anchor.querySelector('.bot-logo-text');
    const iconLetter = iconEl?.textContent?.trim() || undefined;

    items.push({ id, href: path, name: rawName, description, iconLetter });
  });

  return items;
}

/**
 * Matches a leading `/u/<n>` Google multi-account segment (e.g. `/u/1`). The
 * default account is served at the bare path, so a missing segment is normal.
 */
const ACCOUNT_SEGMENT_RE = /^\/u\/\d+/;

function currentAccountSegment(): string {
  return location.pathname.match(ACCOUNT_SEGMENT_RE)?.[0] ?? '';
}

function parseGemHref(href: string): { id: string; path: string } | null {
  try {
    const url = new URL(href, location.origin);
    const match = url.pathname.match(/^\/(?:u\/\d+\/)?gem\/([^/?#]+)/);
    if (!match) return null;
    // Store the account-*relative* path. The gem cache + MRU are shared across
    // every window of the same browser profile (chrome.storage.local), so
    // baking in the `/u/<n>` of whichever account happened to populate the
    // cache would leak it into a window signed into a different account. The
    // live account is re-applied at render time — see resolveGemHref.
    const accountRelativePath = url.pathname.replace(ACCOUNT_SEGMENT_RE, '');
    return { id: match[1], path: `${accountRelativePath}${url.search}${url.hash}` };
  } catch {
    return null;
  }
}

/**
 * Resolve a cached gem path to an absolute URL pinned to the *current window's*
 * Google account.
 *
 * Two browser windows signed into two accounts share one chrome.storage.local
 * gem cache/MRU. Without this, the rendered href carries whatever `/u/<n>`
 * segment last populated the cache, so clicking a gem in one window silently
 * switches it to the other window's account (and the cross-tab storage listener
 * spreads that stale href to both windows). Stripping any cached segment — which
 * also heals caches written by older builds — and re-applying the segment from
 * the live URL keeps every click inside the window's own account.
 *
 * `currentPathname` is injectable for tests; it defaults to the live location.
 */
export function resolveGemHref(
  cachedHref: string,
  currentPathname: string = location.pathname,
): string {
  const accountSegment = currentPathname.match(ACCOUNT_SEGMENT_RE)?.[0] ?? '';
  const accountRelative = cachedHref.replace(ACCOUNT_SEGMENT_RE, '');
  return `https://gemini.google.com${accountSegment}${accountRelative}`;
}

export function isGemsViewPathname(pathname: string): boolean {
  return /^\/(?:u\/\d+\/)?gems(?:\/|$)/.test(pathname);
}

/** Are we currently on the Gems management page? */
function isOnGemsViewPage(): boolean {
  return isGemsViewPathname(location.pathname);
}

/** Field-by-field content equality for cached gem items. Pure. */
export function gemItemsEqual(a: GemMetadata[], b: GemMetadata[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    return (
      x.id === y.id &&
      x.href === y.href &&
      x.name === y.name &&
      x.description === y.description &&
      x.iconLetter === y.iconLetter
    );
  });
}

/**
 * Exported for tests. Persists the scraped catalog, skipping the write when
 * nothing changed: every storage.local.set fans out through storage.onChanged
 * to every open Gemini tab, and the /gems/view observer re-scrapes on each
 * re-render — without this check a no-op scrape would broadcast a fresh
 * envelope (new cachedAt) to all tabs every time. `cachedAt` has no TTL
 * consumer, so not refreshing it is safe.
 */
export async function saveCache(items: GemMetadata[]): Promise<void> {
  const accountSegment = currentAccountSegment();
  if (currentCache.accountSegment === accountSegment && gemItemsEqual(currentCache.items, items)) {
    return;
  }
  const envelope: GemCacheEnvelope = { items, cachedAt: Date.now(), accountSegment };
  const deletedIds = canPruneCatalogDeletes(currentCache.accountSegment, accountSegment)
    ? deletedCatalogGemIds(currentCache.items, items)
    : new Set();
  try {
    await browser.storage.local.set({ [StorageKeys.GV_GEMS_LIST_CACHE]: envelope });
    currentCache = envelope;
    if (deletedIds.size > 0) {
      const nextMru = currentMru.filter((entry) => !deletedIds.has(entry.id));
      if (nextMru.length !== currentMru.length) {
        currentMru = nextMru;
        await saveMru(currentMru);
      }

      const nextPinned = currentPinned.filter((id) => !deletedIds.has(id));
      if (nextPinned.length !== currentPinned.length) {
        currentPinned = nextPinned;
        await browser.storage.sync.set({ [StorageKeys.GV_GEMS_PINNED]: currentPinned });
      }
      refreshInjector();
    }
  } catch (error) {
    console.warn('[GemsSidebar] Failed to persist gems cache:', error);
  }
}

async function loadCache(): Promise<GemCacheEnvelope> {
  try {
    const result = await browser.storage.local.get(StorageKeys.GV_GEMS_LIST_CACHE);
    const raw = (result as Record<string, unknown>)[StorageKeys.GV_GEMS_LIST_CACHE];
    if (raw && typeof raw === 'object' && Array.isArray((raw as GemCacheEnvelope).items)) {
      return raw as GemCacheEnvelope;
    }
  } catch (error) {
    console.warn('[GemsSidebar] Failed to load gems cache:', error);
  }
  return { items: [], cachedAt: 0 };
}

// -----------------------------------------------------------------------------
// MRU (recently-used) tracking
// -----------------------------------------------------------------------------

async function loadMru(): Promise<GemMruEntry[]> {
  try {
    const result = await browser.storage.local.get(StorageKeys.GV_GEMS_MRU);
    const raw = (result as Record<string, unknown>)[StorageKeys.GV_GEMS_MRU];
    if (raw && typeof raw === 'object' && Array.isArray((raw as GemMruEnvelope).entries)) {
      return (raw as GemMruEnvelope).entries.filter(
        (e): e is GemMruEntry =>
          !!e && typeof e.id === 'string' && typeof e.lastUsedAt === 'number',
      );
    }
  } catch (error) {
    console.warn('[GemsSidebar] Failed to load gems MRU:', error);
  }
  return [];
}

async function saveMru(entries: GemMruEntry[]): Promise<void> {
  try {
    await browser.storage.local.set({ [StorageKeys.GV_GEMS_MRU]: { entries } });
  } catch (error) {
    console.warn('[GemsSidebar] Failed to persist gems MRU:', error);
  }
}

/**
 * Read the current gem's identity off a `/gem/<id>` page's zero-state hero.
 * `.bot-logo-text` is the same logo-letter class the /gems/view scraper uses,
 * so custom and premade gems resolve identically — no /gems/view visit needed.
 * Pure (DOM + pathname in, metadata out) so it can be unit-tested. Returns null
 * when the path isn't a gem page or the hero hasn't rendered its name yet.
 */
export function readGemMetadata(pathname: string, doc: Document = document): GemMetadata | null {
  const parsed = parseGemHref(pathname);
  if (!parsed) return null;
  const name = doc.querySelector('.bot-name-container')?.textContent?.trim();
  if (!name) return null;
  const iconLetter = doc.querySelector('.bot-logo-text')?.textContent?.trim() || undefined;
  return { id: parsed.id, href: parsed.path, name, iconLetter };
}

/**
 * Merge a freshly-used gem to the front of the MRU list (newest first),
 * de-duplicating by id and capping the history. Preserves any richer metadata
 * (e.g. description from the /gems/view scrape) the previous entry carried.
 * Pure — returns the next list, does not persist.
 */
export function upsertMru(mru: GemMruEntry[], meta: GemMetadata, now: number): GemMruEntry[] {
  const prev = mru.find((e) => e.id === meta.id);
  const merged: GemMruEntry = { ...prev, ...meta, lastUsedAt: now };
  return [merged, ...mru.filter((e) => e.id !== meta.id)].slice(0, MRU_CAP);
}

/**
 * Final render order: gems the user actually used, newest first, then the
 * scraped catalog (management-page order) to fill the remaining slots. When the
 * MRU is empty this degrades to the catalog order — i.e. the original behavior.
 * Catalog metadata wins for shared ids so descriptions survive. Pure.
 */
export function orderGemsByRecency(mru: GemMruEntry[], catalog: GemMetadata[]): GemMetadata[] {
  const sorted = [...mru].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  const byId = new Map(catalog.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const out: GemMetadata[] = [];
  for (const entry of sorted) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const cat = byId.get(entry.id);
    out.push(cat ? { ...entry, ...cat } : entry);
  }
  for (const gem of catalog) {
    if (seen.has(gem.id)) continue;
    seen.add(gem.id);
    out.push(gem);
  }
  return out;
}

export function deletedCatalogGemIds(
  previousCatalog: GemMetadata[],
  nextCatalog: GemMetadata[],
): Set<string> {
  const nextIds = new Set(nextCatalog.map((gem) => gem.id));
  return new Set(previousCatalog.filter((gem) => !nextIds.has(gem.id)).map((gem) => gem.id));
}

export function canPruneCatalogDeletes(
  previousAccountSegment: string | undefined,
  nextAccountSegment: string,
): boolean {
  return previousAccountSegment === undefined || previousAccountSegment === nextAccountSegment;
}

/**
 * Catalog items usable for the given account segment. The cache is shared
 * across every window of the profile (chrome.storage.local), so a window
 * signed into account B must not render account A's custom gems — clicking
 * one would 404. A mismatched segment yields an empty catalog; the next
 * /gems/view visit in this window re-scrapes and repopulates it. Legacy
 * envelopes written before `accountSegment` existed (undefined/null) are
 * treated as matching so an upgrade never blanks anyone's sidebar. Pure.
 */
export function catalogForAccount(
  cache: Pick<GemCacheEnvelope, 'items' | 'accountSegment'>,
  accountSegment: string,
): GemMetadata[] {
  if (cache.accountSegment == null || cache.accountSegment === accountSegment) {
    return cache.items;
  }
  return [];
}

/**
 * Final visible list for the sidebar: pinned gems first, in pinned order, then
 * recently-used gems filling the remaining slots up to `count` total. Pinned
 * gems are never trimmed by `count` — naming a gem outranks the size limit —
 * so when more gems are pinned than `count`, all pinned gems still show (and
 * nothing else). Pinned ids with no resolvable metadata (e.g. synced from a
 * device whose cache we don't have yet) are skipped. An empty pin list
 * degrades to the existing recency order. Pure.
 */
export function selectVisibleGems(
  pinned: string[],
  mru: GemMruEntry[],
  catalog: GemMetadata[],
  count: number,
): GemMetadata[] {
  const ranked = orderGemsByRecency(mru, catalog);
  const byId = new Map(ranked.map((g) => [g.id, g]));

  const pinnedGems: GemMetadata[] = [];
  const pinnedIds = new Set<string>();
  for (const id of pinned) {
    if (pinnedIds.has(id)) continue;
    const gem = byId.get(id);
    if (!gem) continue;
    pinnedIds.add(id);
    pinnedGems.push(gem);
  }

  const fill = ranked.filter((g) => !pinnedIds.has(g.id));
  const fillCount = Math.max(0, count - pinnedGems.length);
  return [...pinnedGems, ...fill.slice(0, fillCount)];
}

function clearMruRetry(): void {
  if (mruRetryTimer !== null) {
    clearTimeout(mruRetryTimer);
    mruRetryTimer = null;
  }
  mruCaptureAttempts = 0;
}

/**
 * If we're on a `/gem/<id>` page, record that gem as just-used (and capture its
 * name/icon for the sidebar). The hero renders async, so retry a few times
 * before giving up. No-op when the feature is disabled or we're not on a gem
 * page.
 */
function recordGemUsageFromPage(): void {
  if (currentCount <= 0) return;
  if (!parseGemHref(location.pathname)) {
    clearMruRetry();
    return;
  }

  const meta = readGemMetadata(location.pathname);
  if (!meta) {
    if (mruCaptureAttempts < MRU_CAPTURE_MAX_ATTEMPTS && mruRetryTimer === null) {
      mruRetryTimer = window.setTimeout(() => {
        mruRetryTimer = null;
        mruCaptureAttempts += 1;
        recordGemUsageFromPage();
      }, MRU_CAPTURE_RETRY_MS);
    }
    return;
  }

  clearMruRetry();
  // Already front-of-list with identical metadata? Skip the write — inside a
  // gem, every conversation switch re-runs this capture, and rewriting an
  // unchanged MRU just broadcasts storage.onChanged to every open tab.
  // lastUsedAt stays stale in that case, which is fine: the entry is already
  // ranked first and the ordering can't change until another gem is used.
  const head = currentMru[0];
  if (
    head &&
    head.id === meta.id &&
    head.href === meta.href &&
    head.name === meta.name &&
    head.iconLetter === meta.iconLetter
  ) {
    return;
  }
  currentMru = upsertMru(currentMru, meta, Date.now());
  void saveMru(currentMru);
  refreshInjector();
}

/** Does this element (or any ancestor) carry one of our injected gv- classes? */
function isInsideGvNode(node: Node): boolean {
  let el: Element | null = node instanceof Element ? node : node.parentElement;
  while (el) {
    for (const cls of el.classList) {
      if (cls.startsWith('gv-')) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * True when every mutation in the batch only touches nodes we injected
 * ourselves (gv- prefixed — e.g. the pin toggles that injectPinButtons adds
 * after each scrape). Without this exemption our own injection feeds the
 * scrape observer, scheduling a pointless scrape cycle per injection. A batch
 * containing any non-gv (or indeterminate, e.g. detached text) node is NOT
 * self-inflicted — when unsure we scrape, never the other way. Pure.
 */
export function isSelfInflictedMutation(mutations: MutationRecord[]): boolean {
  return mutations.every((mutation) => {
    if (mutation.type === 'childList') {
      const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
      return nodes.length > 0 && nodes.every(isInsideGvNode);
    }
    return isInsideGvNode(mutation.target);
  });
}

function scheduleScrape(): void {
  if (scrapeTimer !== null) return;
  scrapeTimer = window.setTimeout(() => {
    scrapeTimer = null;
    const items = scrapeGemsFromDocument();
    if (items.length === 0) return; // don't clobber cache on transient empty render
    void saveCache(items);
    // Re-inject pin buttons after the cache is updated — the scraped
    // rows may have been re-rendered or reordered by the user.
    void injectPinButtons();
  }, SCRAPE_DEBOUNCE_MS);
}

function setupScrapeObserver(): void {
  if (!isOnGemsViewPage()) return;

  // Re-scrape whenever the visible gem list changes — covers reorder, rename,
  // create, delete. Cheap because we debounce + early-exit on empty matches.
  const list = document.querySelector('[data-test-id="your-gems-list"]');
  if (!list) {
    // The list isn't mounted yet; retry shortly. Gemini's gems page lazy-loads
    // its content after a brief Angular bootstrap.
    if (scrapeRetryTimer === null) {
      scrapeRetryTimer = window.setTimeout(() => {
        scrapeRetryTimer = null;
        setupScrapeObserver();
      }, 500);
    }
    return;
  }
  if (scrapeRetryTimer !== null) {
    clearTimeout(scrapeRetryTimer);
    scrapeRetryTimer = null;
  }
  // Initial scrape (post-render).
  scheduleScrape();
  // Inject pin buttons on initial render of the gems list.
  void injectPinButtons();

  scrapeObserver?.disconnect();
  scrapeObserver = new MutationObserver((mutations) => {
    // Ignore mutations we caused ourselves (pin-button injection/toggling).
    if (isSelfInflictedMutation(mutations)) return;
    scheduleScrape();
  });
  // characterData stays on deliberately: a gem rename can land as a text-node
  // update on the existing row (no childList change), and the scraper reads
  // names via textContent. The churn cost is contained by the 300ms debounce,
  // the self-inflicted-mutation exemption above, and saveCache's
  // content-equality write skip.
  scrapeObserver.observe(list, { childList: true, subtree: true, characterData: true });
}

function teardownScrapeObserver(): void {
  if (scrapeObserver) {
    scrapeObserver.disconnect();
    scrapeObserver = null;
  }
  if (scrapeTimer !== null) {
    clearTimeout(scrapeTimer);
    scrapeTimer = null;
  }
  if (scrapeRetryTimer !== null) {
    clearTimeout(scrapeRetryTimer);
    scrapeRetryTimer = null;
  }
}

// -----------------------------------------------------------------------------
// Injector
// -----------------------------------------------------------------------------

/**
 * Locate the visible Gemini-native Gems nav entry inside the sidebar overflow
 * container. There are typically two `gem-nav-list-item` elements with this
 * test id (one in the always-on top nav, one in a hidden alternate layout);
 * we want the one with non-zero geometry.
 */
function findGemsNavEntry(): HTMLElement | null {
  const overflow = document.querySelector('[data-test-id="overflow-container"]');
  if (!overflow) return null;
  const entries = Array.from(
    overflow.querySelectorAll('[data-test-id="gems-side-nav-entry-button"]'),
  );
  for (const el of entries) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.getBoundingClientRect().height > 0) return el;
  }
  return null;
}

/**
 * Build the inline list element. Returns `null` when there's nothing to show
 * (empty cache) — the caller treats null as "tear down any existing UI".
 */
function buildGemsList(items: GemMetadata[]): HTMLElement | null {
  if (items.length === 0) return null;

  const list = document.createElement('div');
  list.className = LIST_CLASS;
  if (!expanded) list.classList.add('gv-collapsed');
  // role=list keeps assistive tech happy since we're not using <ul>; nav
  // semantics already live on the parent mat-nav-list.
  list.setAttribute('role', 'list');

  items.forEach((gem) => list.appendChild(buildItem(gem)));
  return list;
}

/**
 * Build the chevron button that toggles the inline list open/closed. Lives
 * inside the native `gem-nav-list-item` (absolutely positioned at its right
 * edge) so it visually reads as part of Gemini's own entry. Click is
 * stopPropagation'd so it doesn't trigger the entry's navigation to
 * /gems/view — that's still triggered by clicking the entry's label.
 */
function createExpandToggle(): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = TOGGLE_CLASS;
  btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  // Inline SVG (no font dependency). Path matches Material Symbols
  // `keyboard_arrow_right`; we rotate it to `down` when expanded via CSS.
  btn.innerHTML = `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
    <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
  </svg>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    void toggleExpanded();
  });
  // Belt-and-suspenders — native gem-nav-list-item header is an `<a>`, and
  // pointerdown/mousedown can ripple through to it on some Angular versions.
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  if (expanded) btn.classList.add('gv-expanded');
  return btn;
}

async function toggleExpanded(): Promise<void> {
  expanded = !expanded;
  refreshExpandedState();
  try {
    await browser.storage.local.set({ [EXPANDED_STORAGE_KEY]: expanded });
  } catch (error) {
    console.warn('[GemsSidebar] Failed to persist expanded state:', error);
  }
}

function refreshExpandedState(): void {
  if (injectedToggle) {
    injectedToggle.classList.toggle('gv-expanded', expanded);
    injectedToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  if (injectedList) {
    injectedList.classList.toggle('gv-collapsed', !expanded);
  }
}

/** Gems to render: pinned first (pinned order), then recent up to the count. */
function visibleGems(): GemMetadata[] {
  const catalog = catalogForAccount(currentCache, currentAccountSegment());
  return selectVisibleGems(currentPinned, currentMru, catalog, currentCount);
}

/** Mount / re-mount the chevron on the current Gems nav entry. */
function ensureExpandToggle(): void {
  if (currentCount <= 0 || visibleGems().length === 0) {
    removeExpandToggle();
    return;
  }
  const entry = findGemsNavEntry();
  if (!entry) return;

  // Already attached to the *current* entry element? No-op.
  if (injectedToggle && injectedToggle.parentElement === entry) {
    refreshExpandedState();
    return;
  }

  // Either no toggle yet, or it's pinned to a stale (re-rendered) entry.
  if (injectedToggle && injectedToggle.isConnected) injectedToggle.remove();
  const btn = createExpandToggle();
  entry.classList.add(HOST_CLASS);
  entry.appendChild(btn);
  injectedToggle = btn;
}

function removeExpandToggle(): void {
  if (injectedToggle) {
    injectedToggle.remove();
    injectedToggle = null;
  }
  document.querySelectorAll(`.${HOST_CLASS}`).forEach((el) => el.classList.remove(HOST_CLASS));
}

function buildItem(gem: GemMetadata): HTMLElement {
  const item = document.createElement('a');
  item.className = 'gv-gems-item';
  item.setAttribute('role', 'listitem');
  item.href = resolveGemHref(gem.href);
  item.title = gem.description ? `${gem.name} — ${gem.description}` : gem.name;

  const icon = document.createElement('span');
  icon.className = 'gv-gems-item-icon';
  icon.textContent = (gem.iconLetter || gem.name.trim().charAt(0) || '?').toUpperCase();
  item.appendChild(icon);

  const name = document.createElement('span');
  name.className = 'gv-gems-item-name';
  name.textContent = gem.name;
  item.appendChild(name);

  return item;
}

/** Insert / refresh / remove the list based on current state. */
function renderSection(): void {
  if (currentCount <= 0) {
    cleanupSection();
    return;
  }

  const gemsEntry = findGemsNavEntry();
  if (!gemsEntry || !gemsEntry.parentElement) {
    // No anchor yet — try again on the next mutation.
    return;
  }

  const fresh = buildGemsList(visibleGems());
  if (!fresh) {
    cleanupSection();
    return;
  }

  if (injectedList && injectedList.isConnected) {
    injectedList.replaceWith(fresh);
  } else {
    // Insert immediately after the Gems nav entry so it reads as the entry's
    // own expansion.
    gemsEntry.insertAdjacentElement('afterend', fresh);
  }
  injectedList = fresh;
  ensureExpandToggle();
}

function cleanupSection(): void {
  if (injectedList) {
    injectedList.remove();
    injectedList = null;
  }
  removeExpandToggle();
}

function scheduleEnforce(): void {
  if (enforceRafId !== null) return;
  enforceRafId = window.requestAnimationFrame(() => {
    enforceRafId = null;
    enforcePosition();
  });
}

/**
 * Make sure our list sits immediately after the *current* Gems nav entry,
 * and that the chevron is mounted on that entry. Cheap no-op when already
 * correct, so it's safe to call on every MutationObserver tick.
 */
function enforcePosition(): void {
  if (currentCount <= 0) return;
  const gemsEntry = findGemsNavEntry();
  if (!gemsEntry || !gemsEntry.parentElement) return;

  if (!injectedList || !injectedList.isConnected) {
    renderSection();
    return;
  }

  const inRightParent = injectedList.parentElement === gemsEntry.parentElement;
  const immediatelyAfter = gemsEntry.nextElementSibling === injectedList;
  if (!inRightParent || !immediatelyAfter) {
    gemsEntry.insertAdjacentElement('afterend', injectedList);
  }

  // Always re-check the chevron — entry might have been swapped under us.
  ensureExpandToggle();
}

function setupPositionEnforcer(): void {
  if (currentCount <= 0) return;

  const overflow = document.querySelector('[data-test-id="overflow-container"]');
  if (!overflow) {
    if (positionRetryTimer === null) {
      positionRetryTimer = window.setTimeout(() => {
        positionRetryTimer = null;
        setupPositionEnforcer();
      }, 500);
    }
    return;
  }
  if (positionRetryTimer !== null) {
    clearTimeout(positionRetryTimer);
    positionRetryTimer = null;
  }
  positionObserver?.disconnect();
  positionObserver = new MutationObserver(() => scheduleEnforce());
  positionObserver.observe(overflow, { childList: true, subtree: true });
  scheduleEnforce();
}

function teardownPositionEnforcer(): void {
  if (positionObserver) {
    positionObserver.disconnect();
    positionObserver = null;
  }
  if (enforceRafId !== null) {
    cancelAnimationFrame(enforceRafId);
    enforceRafId = null;
  }
  if (positionRetryTimer !== null) {
    clearTimeout(positionRetryTimer);
    positionRetryTimer = null;
  }
}

function refreshInjector(): void {
  if (currentCount <= 0) {
    cleanupSection();
    teardownPositionEnforcer();
    return;
  }

  setupPositionEnforcer();
  renderSection();
}

function clampCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  return Math.max(0, Math.min(MAX_COUNT, Math.floor(n)));
}

/** Narrow a raw storage value to the pinned-ids shape (string[]). */
export function sanitizePinnedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

async function loadInitialState(): Promise<void> {
  try {
    const sync = await browser.storage.sync.get({
      [StorageKeys.GV_GEMS_SIDEBAR_COUNT]: DEFAULT_COUNT,
      [StorageKeys.GV_GEMS_PINNED]: [],
    });
    currentCount = clampCount(sync[StorageKeys.GV_GEMS_SIDEBAR_COUNT]);
    currentPinned = sanitizePinnedIds(sync[StorageKeys.GV_GEMS_PINNED]);
  } catch (error) {
    console.warn('[GemsSidebar] Failed to load sidebar count:', error);
    currentCount = DEFAULT_COUNT;
    currentPinned = [];
  }

  try {
    const local = await browser.storage.local.get({ [EXPANDED_STORAGE_KEY]: true });
    expanded = (local as Record<string, unknown>)[EXPANDED_STORAGE_KEY] !== false;
  } catch {
    expanded = true;
  }

  currentCache = await loadCache();
  currentMru = await loadMru();
}

function setupStorageListener(): void {
  storageListener = (changes, areaName) => {
    if (areaName === 'sync' && changes[StorageKeys.GV_GEMS_SIDEBAR_COUNT]) {
      const next = clampCount(changes[StorageKeys.GV_GEMS_SIDEBAR_COUNT].newValue);
      if (next !== currentCount) {
        currentCount = next;
        refreshInjector();
      }
    }
    if (areaName === 'sync' && changes[StorageKeys.GV_GEMS_PINNED]) {
      currentPinned = sanitizePinnedIds(changes[StorageKeys.GV_GEMS_PINNED].newValue);
      refreshInjector();
    }
    if (areaName === 'local' && changes[StorageKeys.GV_GEMS_LIST_CACHE]) {
      const raw = changes[StorageKeys.GV_GEMS_LIST_CACHE].newValue as GemCacheEnvelope | undefined;
      if (raw && Array.isArray(raw.items)) {
        currentCache = raw;
        refreshInjector();
      }
    }
    if (areaName === 'local' && changes[StorageKeys.GV_GEMS_MRU]) {
      // Cross-tab sync: another tab opened a gem.
      const raw = changes[StorageKeys.GV_GEMS_MRU].newValue as GemMruEnvelope | undefined;
      if (raw && Array.isArray(raw.entries)) {
        currentMru = raw.entries;
        refreshInjector();
      }
    }
    if (areaName === 'local' && changes[EXPANDED_STORAGE_KEY]) {
      // Cross-tab sync: another tab toggled the chevron.
      const next = changes[EXPANDED_STORAGE_KEY].newValue !== false;
      if (next !== expanded) {
        expanded = next;
        refreshExpandedState();
      }
    }
  };
  browser.storage.onChanged.addListener(storageListener);
}

// -----------------------------------------------------------------------------
// Public entry
// -----------------------------------------------------------------------------

let started = false;

export async function startGemsSidebar(): Promise<() => void> {
  if (started) return () => {};
  started = true;

  await loadInitialState();
  setupStorageListener();
  const unlistenPinnedChanges = listenPinnedChanges();

  // Scrape only when we're on the gems management page; the injector runs on
  // every Gemini page (it's keyed off the cache, not the page).
  if (isOnGemsViewPage()) {
    setupScrapeObserver();
  }

  refreshInjector();
  // Capture the gem if we loaded directly onto a /gem/<id> page.
  recordGemUsageFromPage();

  stopRouteWatcher = watchRouteChanges(handleNavigation);

  return () => {
    started = false;
    teardownScrapeObserver();
    teardownPositionEnforcer();
    clearMruRetry();
    stopRouteWatcher?.();
    stopRouteWatcher = null;
    cleanupSection();
    if (storageListener) {
      browser.storage.onChanged.removeListener(storageListener);
      storageListener = null;
    }
    unlistenPinnedChanges();
  };
}

function handleNavigation(): void {
  // Wait a tick for the new page to render before re-checking which observers
  // should be active.
  window.setTimeout(() => {
    if (isOnGemsViewPage()) {
      setupScrapeObserver();
    } else {
      teardownScrapeObserver();
    }
    refreshInjector();
    // Record the gem when navigating into a /gem/<id> page (custom or premade).
    recordGemUsageFromPage();
  }, 250);
}
