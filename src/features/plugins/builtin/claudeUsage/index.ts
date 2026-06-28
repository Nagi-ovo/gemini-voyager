import { StorageKeys } from '@/core/types/common';

const PILL_ID = 'gv-claude-usage-pill';
const CLAUDE_ORIGIN = 'https://claude.ai';
const SCRAPE_DELAY_MS = 250;
const OPEN_RELOAD_DELAY_MS = 700;
const REFRESH_INTERVAL_MS = 5 * 60_000;
const COUNTDOWN_REFRESH_MS = 30_000;
const REFRESH_LOCK_TTL_MS = 30_000;
const STALE_MS = 60_000;
const MAX_METRICS = 2;

const OPEN_ICON = `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z"/></svg>`;

export interface ClaudeUsageMetric {
  label: string;
  percent: number;
  resetLabel?: string;
  resetEpoch?: number;
}

export interface ClaudeUsageSnapshot {
  metrics: ClaudeUsageMetric[];
  plan?: string;
  lastUpdatedLabel?: string;
  updatedAt: number;
}

interface ClaudeUsageRefreshLock {
  owner: string;
  expiresAt: number;
}

let pill: HTMLElement | null = null;
let snapshot: ClaudeUsageSnapshot | null = null;
let observer: MutationObserver | null = null;
let scrapeTimer: number | null = null;
let refreshTimer: number | null = null;
let countdownTimer: number | null = null;
let refreshInFlight = false;
let visibilityHandler: (() => void) | null = null;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
let dragging = false;
let dragMoved = false;
let dragPos: { x: number; y: number } | null = null;
let dragOffset = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0 };
let pillMoveHandler: ((ev: PointerEvent) => void) | null = null;
let openReloadTimer: number | null = null;
let reloadPage = (): void => location.reload();
const refreshOwnerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function claudeUsageUrl(pathname = location.pathname, search = location.search): string {
  return `${CLAUDE_ORIGIN}${pathname === '/' ? '/new' : pathname}${search}#settings/usage`;
}

export function isClaudeUsageSettings(hash = location.hash): boolean {
  return /^#settings\/usage(?:\b|$)/.test(hash);
}

export function setClaudeUsageReloadForTest(fn: (() => void) | null): void {
  reloadPage = fn ?? (() => location.reload());
}

function pageText(doc: Document): string {
  return (doc.body as HTMLElement | null)?.innerText ?? doc.body?.textContent ?? '';
}

function compactLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function percentValues(text: string): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*%\s*used/gi)]
    .map((match) => clampPercent(Number(match[1])))
    .filter((value) => Number.isFinite(value));
}

function extractPlan(lines: string[]): string | undefined {
  const line = lines.find((entry) => /^Plan usage limits\b/i.test(entry));
  return line?.replace(/^Plan usage limits\s*/i, '').trim() || undefined;
}

function extractLastUpdated(text: string): string | undefined {
  return text.match(/Last updated:\s*([^\n]+)/i)?.[1]?.trim();
}

function extractReset(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(`${escaped}\\s+Resets\\s+([^\\n%]+)`, 'i'))?.[1]?.trim();
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isUsageSnapshot(value: unknown): value is ClaudeUsageSnapshot {
  const data = asRecord(value);
  return Boolean(data && Array.isArray(data.metrics) && typeof data.updatedAt === 'number');
}

function sameSnapshotData(a: ClaudeUsageSnapshot, b: ClaudeUsageSnapshot): boolean {
  return (
    a.plan === b.plan &&
    a.lastUpdatedLabel === b.lastUpdatedLabel &&
    a.metrics.length === b.metrics.length &&
    a.metrics.every(
      (metric, index) =>
        metric.label === b.metrics[index]?.label &&
        metric.percent === b.metrics[index]?.percent &&
        metric.resetLabel === b.metrics[index]?.resetLabel &&
        metric.resetEpoch === b.metrics[index]?.resetEpoch,
    )
  );
}

function withFallbackPlan(
  next: ClaudeUsageSnapshot,
  fallback: ClaudeUsageSnapshot | null = snapshot,
): ClaudeUsageSnapshot {
  return next.plan || !fallback?.plan ? next : { ...next, plan: fallback.plan };
}

function isPillNode(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement;
  return Boolean(el?.closest(`#${PILL_ID}`));
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function formatClaudePlan(plan: string): string | undefined {
  const normalized = plan.toLowerCase();
  if (normalized.includes('max') && normalized.includes('5x')) return 'Max (5x)';
  if (normalized.includes('max') && normalized.includes('20x')) return 'Max (20x)';
  if (normalized === 'claude_max_5x') return 'Max (5x)';
  if (normalized === 'claude_max_20x') return 'Max (20x)';
  if (normalized.includes('team')) return 'Team';
  if (normalized.includes('pro')) return 'Pro';
  if (normalized.includes('free')) return 'Free';
  return undefined;
}

export function planFromClaudeBootstrap(raw: unknown, orgId: string): string | undefined {
  const data = asRecord(raw);
  const account = asRecord(data?.account);
  const memberships = Array.isArray(account?.memberships) ? account.memberships : [];
  const membership = memberships
    .map(asRecord)
    .find((entry) => asRecord(entry?.organization)?.uuid === orgId);
  const organization = asRecord(membership?.organization);
  if (!organization) return undefined;

  const rateLimitTier =
    typeof organization.rate_limit_tier === 'string' ? organization.rate_limit_tier : '';
  const direct = formatClaudePlan(rateLimitTier);
  if (direct) return direct;

  const capabilities = stringArray(organization.capabilities);
  if (organization.raven_type) return 'Team';
  if (capabilities.includes('claude_max')) {
    return rateLimitTier.includes('5x') ? 'Max (5x)' : 'Max (20x)';
  }
  if (capabilities.includes('claude_pro')) return 'Pro';
  return undefined;
}

function metricFromApi(raw: unknown, label: string, scale = 1): ClaudeUsageMetric | null {
  const item = asRecord(raw);
  if (!item) return null;
  const utilization = item?.utilization;
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return null;
  const metric: ClaudeUsageMetric = { label, percent: clampPercent(utilization * scale) };
  if (typeof item.resets_at === 'string') {
    const resetMs = Date.parse(item.resets_at);
    if (Number.isFinite(resetMs)) {
      metric.resetEpoch = Math.floor(resetMs / 1000);
      metric.resetLabel = new Date(resetMs).toLocaleString();
    }
  }
  return metric;
}

export function snapshotFromClaudeUsageApi(
  raw: unknown,
  now = Date.now(),
): ClaudeUsageSnapshot | null {
  const data = asRecord(raw);
  if (!data) return null;
  const metrics = [
    metricFromApi(data.five_hour, '5h'),
    metricFromApi(data.seven_day, 'Week'),
  ].filter((metric): metric is ClaudeUsageMetric => metric !== null);
  if (!metrics.length) return null;
  const rawPlan = typeof data.plan_name === 'string' ? data.plan_name : undefined;
  return {
    metrics: metrics.slice(0, MAX_METRICS),
    plan: rawPlan ? (formatClaudePlan(rawPlan) ?? rawPlan) : undefined,
    lastUpdatedLabel: 'just now',
    updatedAt: now,
  };
}

export function scrapeClaudeUsageFromDocument(
  doc: Document = document,
  now = Date.now(),
): ClaudeUsageSnapshot | null {
  const text = pageText(doc);
  if (!/\bUsage\b/i.test(text) || !/%\s*used/i.test(text)) return null;

  const values = percentValues(text);
  if (!values.length) return null;

  const candidates: Array<{ label: string; percent?: number; resetLabel?: string }> = [
    { label: '5h', percent: values[0], resetLabel: extractReset(text, 'Current session') },
    { label: 'Week', percent: values[1], resetLabel: extractReset(text, 'All models') },
  ];
  const metrics = candidates.filter(
    (metric): metric is ClaudeUsageMetric => typeof metric.percent === 'number',
  );

  return {
    metrics: metrics.slice(0, MAX_METRICS),
    plan: extractPlan(compactLines(text)),
    lastUpdatedLabel: extractLastUpdated(text),
    updatedAt: now,
  };
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

  if (openReloadTimer !== null) clearTimeout(openReloadTimer);
  openReloadTimer = window.setTimeout(() => {
    openReloadTimer = null;
    if (isClaudeUsageSettings() && !hasClaudeUsageContent()) reloadPage();
  }, OPEN_RELOAD_DELAY_MS);
}

function metricTitle(metric: ClaudeUsageMetric): string {
  const label = metric.label === 'All' ? 'Week' : metric.label;
  return metric.resetLabel ? `${label} resets ${metric.resetLabel}` : label;
}

function formatResetCountdown(epochSec: number | undefined, now: number): string {
  if (typeof epochSec !== 'number') return '';
  const diffMs = epochSec * 1000 - now;
  if (diffMs <= 0) return '';
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const restMins = mins % 60;
  if (hours < 1) return `${mins}m`;
  if (hours < 24) return restMins > 0 ? `${hours}h${restMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days}d${rest}h`;
}

function buildMetric(doc: Document, metric: ClaudeUsageMetric): HTMLElement {
  const seg = doc.createElement('div');
  seg.className = 'gv-usage-metric';
  if (metric.percent >= 90) seg.classList.add('gv-usage-high');
  else if (metric.percent >= 70) seg.classList.add('gv-usage-mid');
  seg.title = metricTitle(metric);

  const name = doc.createElement('span');
  name.className = 'gv-usage-label';
  name.textContent = metric.label === 'All' ? 'Week' : metric.label;
  seg.appendChild(name);

  const track = doc.createElement('span');
  track.className = 'gv-usage-track';
  const fill = doc.createElement('span');
  fill.className = 'gv-usage-fill';
  fill.style.width = `${metric.percent}%`;
  track.appendChild(fill);
  seg.appendChild(track);

  const pct = doc.createElement('span');
  pct.className = 'gv-usage-pct';
  const reset = formatResetCountdown(metric.resetEpoch, Date.now());
  pct.textContent = `${metric.percent}%${reset ? ` (${reset})` : ''}`;
  seg.appendChild(pct);

  return seg;
}

export function buildClaudeUsagePill(doc: Document = document): HTMLElement {
  const el = doc.createElement('div');
  el.id = PILL_ID;
  el.className = 'gv-usage-pill gv-claude-usage-pill';
  el.setAttribute('role', 'group');
  el.addEventListener('pointerdown', onPillPointerDown);
  return el;
}

function ensurePill(): HTMLElement {
  const existing = document.getElementById(PILL_ID);
  if (existing instanceof HTMLElement) {
    pill = existing;
    return existing;
  }

  const el = buildClaudeUsagePill(document);
  document.body.appendChild(el);
  pill = el;
  return el;
}

function renderPill(): void {
  const el = ensurePill();
  el.textContent = '';
  el.setAttribute('aria-label', 'Claude usage limits');
  el.title = snapshot?.lastUpdatedLabel
    ? `Last updated: ${snapshot.lastUpdatedLabel}`
    : 'Open Claude usage';

  if (snapshot?.plan) {
    const tier = document.createElement('span');
    tier.className = 'gv-usage-tier';
    tier.textContent = snapshot.plan;
    el.appendChild(tier);
  }

  const metrics = snapshot?.metrics ?? [];
  if (metrics.length) {
    for (const metric of metrics) el.appendChild(buildMetric(document, metric));
  } else {
    const label = document.createElement('span');
    label.className = 'gv-usage-label';
    label.textContent = 'Open usage';
    el.appendChild(label);
  }

  const open = document.createElement('a');
  open.className = 'gv-usage-open';
  open.href = claudeUsageUrl();
  open.setAttribute('aria-label', 'Open Claude usage');
  open.title = 'Open Claude usage';
  open.innerHTML = OPEN_ICON;
  open.addEventListener('click', openClaudeUsage);
  el.appendChild(open);

  positionPill(el);
}

function clampPos(x: number, y: number): { x: number; y: number } {
  const width = pill?.offsetWidth ?? 240;
  const height = pill?.offsetHeight ?? 32;
  return {
    x: Math.max(8, Math.min(window.innerWidth - width - 8, x)),
    y: Math.max(8, Math.min(window.innerHeight - height - 8, y)),
  };
}

function positionPill(el: HTMLElement): void {
  if (dragging) return;
  if (dragPos) {
    const { x, y } = clampPos(dragPos.x, dragPos.y);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
    return;
  }
  el.style.left = '50%';
  el.style.top = 'auto';
  el.style.right = 'auto';
  el.style.bottom = '20px';
  el.style.transform = 'translateX(-50%)';
}

function onPillPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !pill) return;
  if ((event.target as Element | null)?.closest('.gv-usage-open')) return;
  dragging = true;
  dragMoved = false;
  const rect = pill.getBoundingClientRect();
  dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  dragStart = { x: event.clientX, y: event.clientY };
  try {
    pill.setPointerCapture(event.pointerId);
  } catch {
    // ignore
  }
  pill.classList.add('gv-usage-dragging');
  pillMoveHandler = onPillPointerMove;
  window.addEventListener('pointermove', pillMoveHandler);
  window.addEventListener('pointerup', onPillPointerUp, { once: true });
  event.preventDefault();
}

function onPillPointerMove(event: PointerEvent): void {
  if (!dragging || !pill) return;
  if (Math.abs(event.clientX - dragStart.x) + Math.abs(event.clientY - dragStart.y) > 3) {
    dragMoved = true;
  }
  const { x, y } = clampPos(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
  pill.style.left = `${x}px`;
  pill.style.top = `${y}px`;
  pill.style.right = 'auto';
  pill.style.bottom = 'auto';
  pill.style.transform = 'none';
}

function onPillPointerUp(): void {
  if (!dragging) return;
  dragging = false;
  if (pillMoveHandler) {
    window.removeEventListener('pointermove', pillMoveHandler);
    pillMoveHandler = null;
  }
  pill?.classList.remove('gv-usage-dragging');
  if (!dragMoved || !pill) return;
  const rect = pill.getBoundingClientRect();
  dragPos = { x: Math.round(rect.left), y: Math.round(rect.top) };
  void saveDragPos(dragPos);
}

async function loadDragPos(): Promise<void> {
  try {
    const result = await chrome.storage?.local?.get({ [StorageKeys.GV_CLAUDE_USAGE_POS]: null });
    const raw = result?.[StorageKeys.GV_CLAUDE_USAGE_POS];
    const pos = asRecord(raw);
    if (typeof pos?.x === 'number' && typeof pos?.y === 'number') {
      dragPos = { x: pos.x, y: pos.y };
    }
  } catch {
    // ignore
  }
}

async function saveDragPos(pos: { x: number; y: number }): Promise<void> {
  try {
    await chrome.storage?.local?.set({ [StorageKeys.GV_CLAUDE_USAGE_POS]: pos });
  } catch {
    // ignore
  }
}

function onResize(): void {
  if (pill) positionPill(pill);
}

function applyStoredSnapshot(cached: ClaudeUsageSnapshot): void {
  if (!snapshot || cached.updatedAt > snapshot.updatedAt) snapshot = withFallbackPlan(cached);
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
  const cached = await readCache();
  if (!cached) return false;
  applyStoredSnapshot(cached);
  if (Date.now() - cached.updatedAt >= maxAgeMs) return false;
  if (!cached.plan) return false;
  renderPill();
  return true;
}

async function refreshFromApi(force = false): Promise<void> {
  if (!force && snapshot?.plan && Date.now() - snapshot.updatedAt < STALE_MS) return;
  if (await hasFreshSharedCache(force ? REFRESH_INTERVAL_MS : STALE_MS)) return;
  if (!force && (await hasFreshSharedCache(REFRESH_INTERVAL_MS))) return;
  if (refreshInFlight) return;
  const orgId = getLastActiveOrg();
  if (!orgId) return;
  if (!(await acquireRefreshLock())) return;
  refreshInFlight = true;
  try {
    const response = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const next = snapshotFromClaudeUsageApi(await response.json());
    if (!next) return;
    snapshot = {
      ...next,
      plan: next.plan ?? (await fetchPlanFromBootstrap(orgId)) ?? snapshot?.plan,
    };
    renderPill();
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
  const merged = withFallbackPlan(next);
  if (snapshot && sameSnapshotData(snapshot, merged)) return;
  snapshot = merged;
  renderPill();
  void saveCache(merged);
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
    if (snapshot) renderPill();
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
  if (pill) return;
  renderPill();
  void loadCache().then(() => renderPill());
  void loadDragPos().then(() => {
    if (pill) positionPill(pill);
  });
  refreshObserver();
  startRefreshLoop();
  window.addEventListener('resize', onResize);
  window.addEventListener('hashchange', refreshObserver);
  if (chrome.storage?.onChanged && !storageListener) {
    storageListener = (changes, areaName) => {
      if (areaName !== 'local') return;
      const change = changes[StorageKeys.GV_CLAUDE_USAGE_CACHE];
      if (change?.newValue) {
        const next = change.newValue as ClaudeUsageSnapshot;
        if (!snapshot || next.updatedAt > snapshot.updatedAt) {
          snapshot = next;
          renderPill();
        }
      }
      const posChange = changes[StorageKeys.GV_CLAUDE_USAGE_POS];
      if (posChange) {
        const pos = asRecord(posChange.newValue);
        dragPos =
          typeof pos?.x === 'number' && typeof pos?.y === 'number' ? { x: pos.x, y: pos.y } : null;
        if (pill) positionPill(pill);
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
  }
}

export function stopClaudeUsage(): void {
  if (scrapeTimer !== null) clearTimeout(scrapeTimer);
  scrapeTimer = null;
  if (openReloadTimer !== null) clearTimeout(openReloadTimer);
  openReloadTimer = null;
  if (pillMoveHandler) {
    window.removeEventListener('pointermove', pillMoveHandler);
    pillMoveHandler = null;
  }
  dragging = false;
  observer?.disconnect();
  observer = null;
  stopRefreshLoop();
  window.removeEventListener('resize', onResize);
  window.removeEventListener('hashchange', refreshObserver);
  if (storageListener && chrome.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(storageListener);
  }
  storageListener = null;
  pill?.remove();
  pill = null;
  snapshot = null;
  dragPos = null;
  document.getElementById(PILL_ID)?.remove();
}
