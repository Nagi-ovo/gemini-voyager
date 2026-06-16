import { describe, expect, it } from 'vitest';

import { validateAnnouncementFeed } from './validate';

const VALID_ANNOUNCEMENT = {
  id: 'gemini-settings-change-2026-06',
  level: 'warning',
  startsAt: '2026-06-16T00:00:00Z',
  endsAt: '2026-06-30T00:00:00Z',
  minExtensionVersion: '1.4.9',
  maxExtensionVersion: '1.9.9',
  platforms: ['chrome', 'firefox'],
  requiresAction: true,
  locales: {
    default: {
      title: 'Gemini settings changed',
      body: 'Open Voyager docs for the workaround.',
      link: 'https://voyager.nagi.fun/guide/settings',
      linkLabel: 'Open guide',
    },
    zh: {
      title: 'Gemini 设置发生变化',
      body: '请查看 Voyager 文档中的临时解决方案。',
      link: 'https://voyager.nagi.fun/guide/settings',
    },
  },
};

describe('validateAnnouncementFeed', () => {
  it('normalizes a valid feed and localized announcements', () => {
    const result = validateAnnouncementFeed({
      version: 1,
      announcements: [VALID_ANNOUNCEMENT],
    });

    expect(result?.announcements).toHaveLength(1);
    expect(result?.announcements[0]).toMatchObject({
      id: 'gemini-settings-change-2026-06',
      level: 'warning',
      platforms: ['chrome', 'firefox'],
      requiresAction: true,
      locales: {
        default: {
          title: 'Gemini settings changed',
          body: 'Open Voyager docs for the workaround.',
          link: 'https://voyager.nagi.fun/guide/settings',
          linkLabel: 'Open guide',
        },
      },
    });
  });

  it('treats malformed feed shapes as invalid', () => {
    expect(validateAnnouncementFeed(null)).toBeNull();
    expect(validateAnnouncementFeed({ version: 2, announcements: [] })).toBeNull();
    expect(validateAnnouncementFeed({ version: 1, announcements: 'nope' })).toBeNull();
  });

  it('skips malformed announcement items without rejecting the whole feed', () => {
    const result = validateAnnouncementFeed({
      version: 1,
      announcements: [
        { ...VALID_ANNOUNCEMENT, id: '' },
        { ...VALID_ANNOUNCEMENT, locales: {} },
        { ...VALID_ANNOUNCEMENT, startsAt: 'not-a-date' },
        VALID_ANNOUNCEMENT,
      ],
    });

    expect(result?.announcements.map((item) => item.id)).toEqual([
      'gemini-settings-change-2026-06',
    ]);
  });

  it('rejects non-HTTPS links and invalid platform values', () => {
    const result = validateAnnouncementFeed({
      version: 1,
      announcements: [
        {
          ...VALID_ANNOUNCEMENT,
          id: 'bad-link',
          locales: {
            default: {
              title: 'Bad',
              body: 'Bad link',
              link: 'javascript:alert(1)',
            },
          },
        },
        {
          ...VALID_ANNOUNCEMENT,
          id: 'bad-platform',
          platforms: ['chrome', 'opera'],
        },
      ],
    });

    expect(result?.announcements).toHaveLength(0);
  });

  it('caps the number of parsed announcements', () => {
    const result = validateAnnouncementFeed({
      version: 1,
      announcements: Array.from({ length: 55 }, (_, index) => ({
        ...VALID_ANNOUNCEMENT,
        id: `announcement-${index}`,
      })),
    });

    expect(result?.announcements).toHaveLength(50);
  });
});
