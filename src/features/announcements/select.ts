import { parseSemver } from '@/features/plugins/semver';
import type { AppLanguage } from '@/utils/language';

import type {
  PresentedRemoteAnnouncement,
  RemoteAnnouncement,
  RemoteAnnouncementFeed,
  RemoteAnnouncementPlatform,
} from './types';

export interface RemoteAnnouncementSelectionContext {
  readonly now: number;
  readonly language: AppLanguage;
  readonly platform: RemoteAnnouncementPlatform;
  readonly extensionVersion: string;
  readonly shownIds: ReadonlySet<string>;
}

const LEVEL_PRIORITY: Record<RemoteAnnouncement['level'], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function compareVersions(a: string, b: string): number | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function isWithinVersionRange(
  announcement: RemoteAnnouncement,
  extensionVersion: string,
): boolean {
  if (announcement.minExtensionVersion) {
    const compared = compareVersions(extensionVersion, announcement.minExtensionVersion);
    if (compared === null || compared < 0) return false;
  }
  if (announcement.maxExtensionVersion) {
    const compared = compareVersions(extensionVersion, announcement.maxExtensionVersion);
    if (compared === null || compared > 0) return false;
  }
  return true;
}

function isActiveNow(announcement: RemoteAnnouncement, now: number): boolean {
  if (announcement.startsAt && now < Date.parse(announcement.startsAt)) return false;
  if (announcement.endsAt && now > Date.parse(announcement.endsAt)) return false;
  return true;
}

function isForPlatform(
  announcement: RemoteAnnouncement,
  platform: RemoteAnnouncementPlatform,
): boolean {
  return !announcement.platforms?.length || announcement.platforms.includes(platform);
}

function toPresentedAnnouncement(
  announcement: RemoteAnnouncement,
  context: RemoteAnnouncementSelectionContext,
): PresentedRemoteAnnouncement | null {
  const locale =
    announcement.locales[context.language] ??
    announcement.locales.default ??
    announcement.locales.en ??
    Object.values(announcement.locales)[0];
  if (!locale) return null;

  return {
    id: announcement.id,
    level: announcement.level,
    title: locale.title,
    body: locale.body,
    ...(locale.link ? { link: locale.link } : {}),
    ...(locale.linkLabel ? { linkLabel: locale.linkLabel } : {}),
    ...(announcement.requiresAction ? { requiresAction: true } : {}),
    createdAt: context.now,
  };
}

export function selectRemoteAnnouncements(
  feed: RemoteAnnouncementFeed,
  context: RemoteAnnouncementSelectionContext,
): PresentedRemoteAnnouncement[] {
  return feed.announcements
    .filter((announcement) => !context.shownIds.has(announcement.id))
    .filter((announcement) => isActiveNow(announcement, context.now))
    .filter((announcement) => isForPlatform(announcement, context.platform))
    .filter((announcement) => isWithinVersionRange(announcement, context.extensionVersion))
    .sort((a, b) => {
      const levelDiff = LEVEL_PRIORITY[b.level] - LEVEL_PRIORITY[a.level];
      if (levelDiff !== 0) return levelDiff;
      const aTime = a.startsAt ? Date.parse(a.startsAt) : 0;
      const bTime = b.startsAt ? Date.parse(b.startsAt) : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.id.localeCompare(b.id);
    })
    .map((announcement) => toPresentedAnnouncement(announcement, context))
    .filter((item): item is PresentedRemoteAnnouncement => item !== null);
}
