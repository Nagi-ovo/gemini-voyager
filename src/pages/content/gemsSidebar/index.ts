/**
 * Gems Sidebar — hangs a thin list of recently-used gems off Gemini's native
 * `gem-nav-list-item[data-test-id="gems-side-nav-entry-button"]` so the
 * sidebar reads as if Gemini's own Gems entry expanded inline.
 *
 * Three responsibilities live in this module:
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
 * The popup exposes a single `GV_GEMS_SIDEBAR_COUNT` (0-10). `count=0` is the
 * disabled state: the injector tears down its UI and exits. `count>0` shows
 * that many cached items. No expand/collapse, no "view all" — clicking
 * Gemini's own Gems entry already opens the full list.
 */
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

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
interface GemCacheEnvelope {
  items: GemMetadata[];
  cachedAt: number;
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
const NAV_POLL_MS = 600;
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
let mruRetryTimer: number | null = null;
let mruCaptureAttempts = 0;
let navPollTimer: number | null = null;
let lastPolledPath = '';
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

function parseGemHref(href: string): { id: string; path: string } | null {
  try {
    const url = new URL(href, location.origin);
    const match = url.pathname.match(/^\/(?:u\/\d+\/)?gem\/([^/?#]+)/);
    if (!match) return null;
    return { id: match[1], path: `${url.pathname}${url.search}${url.hash}` };
  } catch {
    return null;
  }
}

export function isGemsViewPathname(pathname: string): boolean {
  return /^\/(?:u\/\d+\/)?gems(?:\/|$)/.test(pathname);
}

/** Are we currently on the Gems management page? */
function isOnGemsViewPage(): boolean {
  return isGemsViewPathname(location.pathname);
}

async function saveCache(items: GemMetadata[]): Promise<void> {
  const envelope: GemCacheEnvelope = { items, cachedAt: Date.now() };
  try {
    await browser.storage.local.set({ [StorageKeys.GV_GEMS_LIST_CACHE]: envelope });
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
  currentMru = upsertMru(currentMru, meta, Date.now());
  void saveMru(currentMru);
  refreshInjector();
}

function scheduleScrape(): void {
  if (scrapeTimer !== null) return;
  scrapeTimer = window.setTimeout(() => {
    scrapeTimer = null;
    const items = scrapeGemsFromDocument();
    if (items.length === 0) return; // don't clobber cache on transient empty render
    void saveCache(items);
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

  scrapeObserver?.disconnect();
  scrapeObserver = new MutationObserver(() => scheduleScrape());
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
function buildGemsList(items: GemMetadata[], count: number): HTMLElement | null {
  if (items.length === 0) return null;

  const list = document.createElement('div');
  list.className = LIST_CLASS;
  if (!expanded) list.classList.add('gv-collapsed');
  // role=list keeps assistive tech happy since we're not using <ul>; nav
  // semantics already live on the parent mat-nav-list.
  list.setAttribute('role', 'list');

  items.slice(0, count).forEach((gem) => list.appendChild(buildItem(gem)));
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

/** Gems to render, ordered by recent use then catalog order. */
function orderedGems(): GemMetadata[] {
  return orderGemsByRecency(currentMru, currentCache.items);
}

/** Mount / re-mount the chevron on the current Gems nav entry. */
function ensureExpandToggle(): void {
  if (currentCount <= 0 || orderedGems().length === 0) {
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
  item.href = `https://gemini.google.com${gem.href}`;
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

  const fresh = buildGemsList(orderedGems(), currentCount);
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

async function loadInitialState(): Promise<void> {
  try {
    const sync = await browser.storage.sync.get({
      [StorageKeys.GV_GEMS_SIDEBAR_COUNT]: DEFAULT_COUNT,
    });
    currentCount = clampCount(sync[StorageKeys.GV_GEMS_SIDEBAR_COUNT]);
  } catch (error) {
    console.warn('[GemsSidebar] Failed to load sidebar count:', error);
    currentCount = DEFAULT_COUNT;
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
      if (next === currentCount) return;
      currentCount = next;
      refreshInjector();
      return;
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

  // Scrape only when we're on the gems management page; the injector runs on
  // every Gemini page (it's keyed off the cache, not the page).
  if (isOnGemsViewPage()) {
    setupScrapeObserver();
  }

  refreshInjector();
  // Capture the gem if we loaded directly onto a /gem/<id> page.
  recordGemUsageFromPage();

  // Back/forward fire a real `popstate` event we can hear.
  window.addEventListener('popstate', handleNavigation);
  // Patch pushState/replaceState as a fast-path for same-world programmatic
  // navigation. NOTE: this can't catch Gemini's OWN router — Angular runs in the
  // page's main world and calls the unpatched main-world history, so an in-app
  // click to a gem never reaches this wrapper. The poll below is the reliable
  // catch-all for those forward SPA navigations.
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const r = origPush.apply(this, args);
    handleNavigation();
    return r;
  };
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    const r = origReplace.apply(this, args);
    handleNavigation();
    return r;
  };

  // Reliable navigation detector. Because the pushState wrapper above is blind to
  // Gemini's main-world router, poll the pathname so opening a gem via an in-app
  // click (the common case) still records MRU + re-checks the scraper.
  lastPolledPath = location.pathname;
  navPollTimer = window.setInterval(() => {
    if (location.pathname === lastPolledPath) return;
    lastPolledPath = location.pathname;
    handleNavigation();
  }, NAV_POLL_MS);

  return () => {
    started = false;
    teardownScrapeObserver();
    teardownPositionEnforcer();
    clearMruRetry();
    if (navPollTimer !== null) {
      clearInterval(navPollTimer);
      navPollTimer = null;
    }
    cleanupSection();
    window.removeEventListener('popstate', handleNavigation);
    history.pushState = origPush;
    history.replaceState = origReplace;
    if (storageListener) {
      browser.storage.onChanged.removeListener(storageListener);
      storageListener = null;
    }
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
