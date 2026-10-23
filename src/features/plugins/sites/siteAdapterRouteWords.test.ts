import { describe, expect, it, vi } from 'vitest';

import { check, siteSchema } from '../manifest/__tests__/jsonSchemaCheck';
import type { SiteAdapter } from '../types';
import { redactRoute } from '../verbs/siteCheck/route';
import { siteAdapterToData, validateSiteAdapterData } from './siteAdapterData';

const KIMI = vi.hoisted(() => ({
  id: 'kimi',
  label: 'Kimi',
  matches: ['https://www.kimi.com/*'],
  theme: { hostSelector: 'html', lightSelector: 'html.light', darkSelector: 'html.dark' },
  conversationIdPattern: '^/chat/([^/?#]+)',
  routeWords: ['chat', 'new', 'my-library'],
}));

vi.mock('../catalog/sites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/sites')>();
  const { validateSiteAdapterData: validate } = await import('./siteAdapterData');
  const parsed = validate(KIMI);
  if (!parsed.success) throw new Error('invalid Kimi fixture');
  return { ...actual, BUNDLED_SITE_ADAPTERS: [...actual.BUNDLED_SITE_ADAPTERS, parsed.data] };
});

function kimi(): SiteAdapter {
  const result = validateSiteAdapterData(KIMI);
  if (!result.success) throw new Error('invalid Kimi fixture');
  return result.data;
}

describe('site check route words from site.json', () => {
  it('keeps a bundled site’s route words while hiding every other segment', () => {
    expect(
      redactRoute('https://www.kimi.com/chat/alice/my-library?token=secret#private', kimi()),
    ).toEqual({ route: '/chat/:id/my-library', conversation: true });
    // Encoded and differently cased words are not the exact configured static segments.
    expect(redactRoute('https://www.kimi.com/%63hat/CHAT/private', kimi()).route).toBe(
      '/:id/:id/:id',
    );
  });

  it('does not reveal a segment that a remote site record names as a route word', () => {
    const remote = { ...kimi(), routeWords: ['alice'] };
    expect(redactRoute('https://www.kimi.com/chat/alice', remote).route).toBe('/chat/:id');
  });

  it('retains route words through publishing and cache serialization', () => {
    const serialized = JSON.parse(JSON.stringify(siteAdapterToData(kimi()))) as unknown;
    expect(check(serialized, siteSchema, { strictProperties: true })).toEqual([]);
    expect(validateSiteAdapterData(serialized)).toEqual(validateSiteAdapterData(KIMI));
  });

  it.each([
    'chat',
    ['Chat'],
    ['chat/id'],
    Array.from({ length: 65 }, (_, index) => `route-${index}`),
  ])(
    'rejects invalid static route words %j in both schema and runtime validation',
    (routeWords) => {
      const raw = { ...KIMI, routeWords };
      const result = validateSiteAdapterData(raw);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.some((issue) => issue.path === 'routeWords')).toBe(true);
      expect(check(raw, siteSchema).length).toBeGreaterThan(0);
    },
  );
});
