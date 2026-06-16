import type { AppLanguage } from '@/utils/language';

export type RemoteAnnouncementLevel = 'info' | 'warning' | 'critical';
export type RemoteAnnouncementPlatform = 'chrome' | 'edge' | 'firefox' | 'safari';
export type RemoteAnnouncementLocaleKey = AppLanguage | 'default';

export interface RemoteAnnouncementLocale {
  readonly title: string;
  readonly body: string;
  readonly link?: string;
  readonly linkLabel?: string;
}

export interface RemoteAnnouncement {
  readonly id: string;
  readonly level: RemoteAnnouncementLevel;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly minExtensionVersion?: string;
  readonly maxExtensionVersion?: string;
  readonly platforms?: readonly RemoteAnnouncementPlatform[];
  readonly requiresAction?: boolean;
  readonly locales: Partial<Record<RemoteAnnouncementLocaleKey, RemoteAnnouncementLocale>>;
}

export interface RemoteAnnouncementFeed {
  readonly version: 1;
  readonly announcements: readonly RemoteAnnouncement[];
}

export interface PresentedRemoteAnnouncement {
  readonly id: string;
  readonly level: RemoteAnnouncementLevel;
  readonly title: string;
  readonly body: string;
  readonly link?: string;
  readonly linkLabel?: string;
  readonly requiresAction?: boolean;
  readonly createdAt: number;
}

export interface RemoteAnnouncementCache {
  readonly feed: RemoteAnnouncementFeed;
  readonly fetchedAt: number;
}

export interface RemoteAnnouncementState {
  readonly shownIds: readonly string[];
  readonly lastCheckedAt?: number;
  readonly lastSuccessAt?: number;
  readonly failureCount?: number;
  readonly nextAllowedFetchAt?: number;
  readonly cache?: RemoteAnnouncementCache;
  readonly notificationLinks?: Readonly<Record<string, string>>;
}
