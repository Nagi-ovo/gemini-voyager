import { parseSemver } from '@/features/plugins/semver';
import { isAppLanguage } from '@/utils/language';

import type {
  RemoteAnnouncement,
  RemoteAnnouncementFeed,
  RemoteAnnouncementLevel,
  RemoteAnnouncementLocale,
  RemoteAnnouncementLocaleKey,
  RemoteAnnouncementPlatform,
} from './types';

const MAX_ANNOUNCEMENTS = 50;
const MAX_ID_LENGTH = 120;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;
const MAX_LINK_LENGTH = 2048;
const MAX_LINK_LABEL_LENGTH = 60;

const LEVELS: ReadonlySet<RemoteAnnouncementLevel> = new Set(['info', 'warning', 'critical']);
const PLATFORMS: ReadonlySet<RemoteAnnouncementPlatform> = new Set([
  'chrome',
  'edge',
  'firefox',
  'safari',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function normalizeOptionalString(value: unknown, maxLength: number): string | undefined | null {
  if (typeof value === 'undefined') return undefined;
  return normalizeString(value, maxLength);
}

function normalizeHttpsUrl(value: unknown): string | undefined | null {
  if (typeof value === 'undefined') return undefined;
  const url = normalizeString(value, MAX_LINK_LENGTH);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeIsoDate(value: unknown): string | undefined | null {
  if (typeof value === 'undefined') return undefined;
  const raw = normalizeString(value, 64);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? raw : null;
}

function normalizeVersion(value: unknown): string | undefined | null {
  if (typeof value === 'undefined') return undefined;
  const raw = normalizeString(value, 32);
  if (!raw) return null;
  return parseSemver(raw) ? raw : null;
}

function normalizePlatforms(value: unknown): readonly RemoteAnnouncementPlatform[] | undefined | null {
  if (typeof value === 'undefined') return undefined;
  if (!Array.isArray(value)) return null;
  const platforms: RemoteAnnouncementPlatform[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !PLATFORMS.has(entry as RemoteAnnouncementPlatform)) {
      return null;
    }
    if (!platforms.includes(entry as RemoteAnnouncementPlatform)) {
      platforms.push(entry as RemoteAnnouncementPlatform);
    }
  }
  return platforms;
}

function isLocaleKey(value: string): value is RemoteAnnouncementLocaleKey {
  return value === 'default' || isAppLanguage(value);
}

function normalizeLocale(value: unknown): RemoteAnnouncementLocale | null {
  if (!isRecord(value)) return null;
  const title = normalizeString(value.title, MAX_TITLE_LENGTH);
  const body = normalizeString(value.body, MAX_BODY_LENGTH);
  const link = normalizeHttpsUrl(value.link);
  const linkLabel = normalizeOptionalString(value.linkLabel, MAX_LINK_LABEL_LENGTH);
  if (!title || !body || link === null || linkLabel === null) return null;
  return {
    title,
    body,
    ...(link ? { link } : {}),
    ...(linkLabel ? { linkLabel } : {}),
  };
}

function normalizeLocales(value: unknown): RemoteAnnouncement['locales'] | null {
  if (!isRecord(value)) return null;
  const locales: Partial<Record<RemoteAnnouncementLocaleKey, RemoteAnnouncementLocale>> = {};
  for (const [key, rawLocale] of Object.entries(value)) {
    if (!isLocaleKey(key)) continue;
    const locale = normalizeLocale(rawLocale);
    if (locale) locales[key] = locale;
  }
  return Object.keys(locales).length > 0 ? locales : null;
}

function normalizeAnnouncement(value: unknown): RemoteAnnouncement | null {
  if (!isRecord(value)) return null;

  const id = normalizeString(value.id, MAX_ID_LENGTH);
  if (!id || !/^[A-Za-z0-9._:-]+$/.test(id)) return null;

  const rawLevel = value.level;
  const level: RemoteAnnouncementLevel =
    typeof rawLevel === 'string' && LEVELS.has(rawLevel as RemoteAnnouncementLevel)
      ? (rawLevel as RemoteAnnouncementLevel)
      : 'info';

  const startsAt = normalizeIsoDate(value.startsAt);
  const endsAt = normalizeIsoDate(value.endsAt);
  const minExtensionVersion = normalizeVersion(value.minExtensionVersion);
  const maxExtensionVersion = normalizeVersion(value.maxExtensionVersion);
  const platforms = normalizePlatforms(value.platforms);
  const requiresAction =
    typeof value.requiresAction === 'boolean' ? value.requiresAction : undefined;
  const locales = normalizeLocales(value.locales);

  if (
    startsAt === null ||
    endsAt === null ||
    minExtensionVersion === null ||
    maxExtensionVersion === null ||
    platforms === null ||
    !locales
  ) {
    return null;
  }

  return {
    id,
    level,
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
    ...(minExtensionVersion ? { minExtensionVersion } : {}),
    ...(maxExtensionVersion ? { maxExtensionVersion } : {}),
    ...(platforms ? { platforms } : {}),
    ...(typeof requiresAction === 'boolean' ? { requiresAction } : {}),
    locales,
  };
}

export function validateAnnouncementFeed(value: unknown): RemoteAnnouncementFeed | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.announcements)) {
    return null;
  }

  const announcements = value.announcements
    .slice(0, MAX_ANNOUNCEMENTS)
    .map(normalizeAnnouncement)
    .filter((item): item is RemoteAnnouncement => item !== null);

  return {
    version: 1,
    announcements,
  };
}
