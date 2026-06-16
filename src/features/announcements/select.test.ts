import { describe, expect, it } from 'vitest';

import { selectRemoteAnnouncements } from './select';
import type { RemoteAnnouncementFeed } from './types';

const FEED: RemoteAnnouncementFeed = {
  version: 1,
  announcements: [
    {
      id: 'info-old',
      level: 'info',
      startsAt: '2026-06-01T00:00:00Z',
      locales: {
        default: { title: 'Info', body: 'Default body', link: 'https://voyager.nagi.fun/info' },
      },
    },
    {
      id: 'critical-new',
      level: 'critical',
      startsAt: '2026-06-10T00:00:00Z',
      maxExtensionVersion: '2.0.0',
      platforms: ['chrome'],
      requiresAction: true,
      locales: {
        default: { title: 'Critical', body: 'Default critical' },
        zh: { title: '重要公告', body: '中文正文' },
      },
    },
    {
      id: 'future',
      level: 'critical',
      startsAt: '2027-01-01T00:00:00Z',
      locales: { default: { title: 'Future', body: 'Not yet' } },
    },
    {
      id: 'expired',
      level: 'warning',
      endsAt: '2026-01-01T00:00:00Z',
      locales: { default: { title: 'Expired', body: 'Too late' } },
    },
    {
      id: 'firefox-only',
      level: 'warning',
      platforms: ['firefox'],
      locales: { default: { title: 'Firefox', body: 'Only Firefox' } },
    },
    {
      id: 'new-version-only',
      level: 'critical',
      minExtensionVersion: '9.0.0',
      locales: { default: { title: 'New version', body: 'Too new' } },
    },
  ],
};

describe('selectRemoteAnnouncements', () => {
  it('filters by shown ids, date, platform, version, then sorts by severity', () => {
    const result = selectRemoteAnnouncements(FEED, {
      now: Date.parse('2026-06-16T12:00:00Z'),
      language: 'zh',
      platform: 'chrome',
      extensionVersion: '1.4.9',
      shownIds: new Set(['info-old']),
    });

    expect(result.map((item) => item.id)).toEqual(['critical-new']);
    expect(result[0]).toMatchObject({
      title: '重要公告',
      body: '中文正文',
      level: 'critical',
      requiresAction: true,
    });
  });

  it('falls back to default locale and keeps HTTPS links', () => {
    const result = selectRemoteAnnouncements(FEED, {
      now: Date.parse('2026-06-16T12:00:00Z'),
      language: 'ja',
      platform: 'chrome',
      extensionVersion: '1.4.9',
      shownIds: new Set(['critical-new']),
    });

    expect(result[0]).toMatchObject({
      id: 'info-old',
      title: 'Info',
      body: 'Default body',
      link: 'https://voyager.nagi.fun/info',
    });
  });

  it('returns platform-specific announcements for matching browsers', () => {
    const result = selectRemoteAnnouncements(FEED, {
      now: Date.parse('2026-06-16T12:00:00Z'),
      language: 'en',
      platform: 'firefox',
      extensionVersion: '1.4.9',
      shownIds: new Set(),
    });

    expect(result.map((item) => item.id)).toEqual(['firefox-only', 'info-old']);
  });
});
