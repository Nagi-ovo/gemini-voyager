import { StorageKeys } from '@/core/types/common';
import { hashString } from '@/core/utils/hash';

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PROFILE_MAP_VERSION = 1;
const ACCOUNT_ISOLATION_KEY_BY_PLATFORM = {
  gemini: StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI,
  aistudio: StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO,
} as const;

interface AccountProfileRecord {
  id: number;
  createdAt: number;
  updatedAt: number;
  routeUserId?: string;
  emailHash?: string;
}

interface AccountProfileMap {
  version: number;
  nextId: number;
  profiles: Record<string, AccountProfileRecord>;
  routeAliases: Record<string, string>;
  emailAliases: Record<string, string>;
}

export interface AccountScope {
  accountKey: string;
  accountId: number;
  routeUserId: string | null;
  emailHash: string | null;
}

export interface AccountScopeHints {
  pageUrl?: string | null;
  routeUserId?: string | null;
  email?: string | null;
}

export interface AccountContext {
  routeUserId: string | null;
  email: string | null;
}

export type AccountPlatform = 'gemini' | 'aistudio';

function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAIStudioHost(hostname: string | null): boolean {
  return hostname === 'aistudio.google.com' || hostname === 'aistudio.google.cn';
}

function isGeminiHost(hostname: string | null): boolean {
  return hostname === 'gemini.google.com' || hostname === 'business.gemini.google';
}

export function detectAccountPlatformFromUrl(pageUrl: string | null | undefined): AccountPlatform {
  const hostname = parseHostname(pageUrl || '');
  if (isAIStudioHost(hostname)) return 'aistudio';
  return 'gemini';
}

export function getAccountIsolationStorageKey(platform: AccountPlatform): string {
  return ACCOUNT_ISOLATION_KEY_BY_PLATFORM[platform];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'string',
    ),
  );
}

function toProfileRecord(value: unknown): AccountProfileRecord | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return null;

  const routeUserId = typeof value.routeUserId === 'string' ? value.routeUserId : undefined;
  const emailHash = typeof value.emailHash === 'string' ? value.emailHash : undefined;
  return {
    id,
    createdAt,
    updatedAt,
    routeUserId,
    emailHash,
  };
}

function createDefaultProfileMap(): AccountProfileMap {
  return {
    version: PROFILE_MAP_VERSION,
    nextId: 1,
    profiles: {},
    routeAliases: {},
    emailAliases: {},
  };
}

function parseProfileMap(value: unknown): AccountProfileMap {
  if (!isRecord(value)) return createDefaultProfileMap();

  const nextId =
    typeof value.nextId === 'number' && Number.isFinite(value.nextId) ? value.nextId : 1;
  const profilesRaw = isRecord(value.profiles) ? value.profiles : {};

  const profiles: Record<string, AccountProfileRecord> = {};
  for (const [key, recordRaw] of Object.entries(profilesRaw)) {
    if (typeof key !== 'string') continue;
    const record = toProfileRecord(recordRaw);
    if (!record) continue;
    profiles[key] = record;
  }

  return {
    version: PROFILE_MAP_VERSION,
    nextId: Math.max(1, Math.floor(nextId)),
    profiles,
    routeAliases: toStringRecord(value.routeAliases),
    emailAliases: toStringRecord(value.emailAliases),
  };
}

export function extractRouteUserIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/u\/(\d+)\//);
  return match?.[1] ?? null;
}

export function extractRouteUserIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return extractRouteUserIdFromPath(parsed.pathname);
  } catch {
    return null;
  }
}

export function normalizeEmailAddress(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

export function extractEmailFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(EMAIL_PATTERN);
  if (!match) return null;
  return normalizeEmailAddress(match[0]);
}

function extractEmailFromElement(element: Element): string | null {
  const candidates = [
    element.getAttribute('data-email'),
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.textContent,
  ];

  if (element instanceof HTMLAnchorElement) {
    candidates.push(element.href);
  }

  for (const candidate of candidates) {
    const email = extractEmailFromText(candidate);
    if (email) return email;
  }

  return null;
}

function findEmailBySelectors(
  doc: Document,
  selectors: string[],
  limitPerSelector: number = 40,
): string | null {
  for (const selector of selectors) {
    const elements = Array.from(doc.querySelectorAll(selector)).slice(0, limitPerSelector);
    for (const element of elements) {
      const email = extractEmailFromElement(element);
      if (email) return email;
    }
  }

  return null;
}

export function detectAccountContextFromDocument(pageUrl: string, doc: Document): AccountContext {
  const routeUserId = extractRouteUserIdFromUrl(pageUrl);
  const hostname = parseHostname(pageUrl);

  if (isAIStudioHost(hostname)) {
    const aiStudioEmail = findEmailBySelectors(doc, [
      '.account-switcher-text',
      '#account-switcher-button .button-container[aria-label]',
      'alkali-accountswitcher [aria-label*="@"]',
      '.account-switcher-container [aria-label*="@"]',
    ]);
    if (aiStudioEmail) {
      return { routeUserId, email: aiStudioEmail };
    }
  }

  if (isGeminiHost(hostname)) {
    const geminiEmail = findEmailBySelectors(doc, [
      '[aria-label*="@"]',
      '[data-email]',
      '[title*="@"]',
      'a[href^="mailto:"]',
    ]);
    if (geminiEmail) {
      return { routeUserId, email: geminiEmail };
    }
  }

  const fallbackEmail = findEmailBySelectors(doc, [
    '[data-email]',
    '[aria-label*="@"]',
    '[title*="@"]',
    'a[href^="mailto:"]',
    'img[alt*="@"]',
  ]);
  if (fallbackEmail) {
    return { routeUserId, email: fallbackEmail };
  }

  return { routeUserId, email: null };
}

export function buildScopedStorageKey(baseKey: string, accountKey: string): string {
  return `${baseKey}:acct:${hashString(accountKey)}`;
}

export function buildScopedFolderStorageKey(accountKey: string): string {
  return buildScopedStorageKey(StorageKeys.FOLDER_DATA, accountKey);
}

export class AccountIsolationService {
  private operationQueue: Promise<unknown> = Promise.resolve();

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(operation, operation);
    this.operationQueue = next.catch(() => undefined);
    return next;
  }

  async isIsolationEnabled(options?: {
    platform?: AccountPlatform;
    pageUrl?: string | null;
  }): Promise<boolean> {
    try {
      const platform = options?.platform ?? detectAccountPlatformFromUrl(options?.pageUrl ?? null);
      const platformKey = getAccountIsolationStorageKey(platform);
      const result = await chrome.storage.sync.get([
        platformKey,
        StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED,
      ]);

      if (typeof result[platformKey] === 'boolean') {
        return result[platformKey] === true;
      }

      // Backward compatibility: fall back to legacy single flag.
      if (typeof result[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] === 'boolean') {
        return result[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] === true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async resolveAccountScope(hints: AccountScopeHints = {}): Promise<AccountScope> {
    return this.serialize(async () => {
      const routeUserId =
        hints.routeUserId ?? (hints.pageUrl ? extractRouteUserIdFromUrl(hints.pageUrl) : null);
      const normalizedEmail = normalizeEmailAddress(hints.email ?? null);
      const emailHash = normalizedEmail ? hashString(normalizedEmail) : null;
      const now = Date.now();

      const map = await this.readProfileMap();

      const keyFromEmail = emailHash ? map.emailAliases[emailHash] : null;
      const keyFromRoute = routeUserId ? map.routeAliases[routeUserId] : null;

      const accountKey =
        keyFromEmail ??
        keyFromRoute ??
        (emailHash ? `email:${emailHash}` : routeUserId ? `route:${routeUserId}` : 'default');

      let profile = map.profiles[accountKey];
      if (!profile) {
        profile = {
          id: map.nextId,
          createdAt: now,
          updatedAt: now,
          routeUserId: routeUserId ?? undefined,
          emailHash: emailHash ?? undefined,
        };
        map.nextId += 1;
      } else {
        profile = {
          ...profile,
          updatedAt: now,
          routeUserId: routeUserId ?? profile.routeUserId,
          emailHash: emailHash ?? profile.emailHash,
        };
      }

      if (routeUserId) {
        map.routeAliases[routeUserId] = accountKey;
      }
      if (emailHash) {
        map.emailAliases[emailHash] = accountKey;
      }

      map.profiles[accountKey] = profile;
      await this.writeProfileMap(map);

      return {
        accountKey,
        accountId: profile.id,
        routeUserId: routeUserId ?? null,
        emailHash,
      };
    });
  }

  private async readProfileMap(): Promise<AccountProfileMap> {
    try {
      const result = await chrome.storage.local.get([StorageKeys.GV_ACCOUNT_PROFILE_MAP]);
      return parseProfileMap(result[StorageKeys.GV_ACCOUNT_PROFILE_MAP]);
    } catch {
      return createDefaultProfileMap();
    }
  }

  private async writeProfileMap(map: AccountProfileMap): Promise<void> {
    await chrome.storage.local.set({
      [StorageKeys.GV_ACCOUNT_PROFILE_MAP]: map,
    });
  }
}

export const accountIsolationService = new AccountIsolationService();
