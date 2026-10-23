import { describe, expect, it } from 'vitest';

import { requireBundledSiteAdapter } from '../../catalog/sites';
import { redactRoute } from './route';

const pattern = (site: string) => requireBundledSiteAdapter(site).conversationIdPattern;

describe('site check route redaction', () => {
  it.each([
    [
      'ChatGPT',
      'chatgpt',
      'https://chatgpt.com/c/6812a0f4-77aa-8000-b2c1-3d9e5f00aa11?model=x#top',
      '/c/:id',
    ],
    [
      'Claude',
      'claude',
      'https://claude.ai/chat/2b7c1e8a-4f3d-4a51-9f0e-8c7d6b5a4e3f',
      '/chat/:id',
    ],
    ['DeepSeek', 'deepseek', 'https://chat.deepseek.com/a/chat/s/9f8e7d6c-5b4a', '/a/chat/s/:id'],
  ])(
    'replaces the conversation id %s’s pattern captures, and drops host, query and hash',
    (_name, site, url, route) => {
      expect(redactRoute(url, pattern(site))).toEqual({ route, conversation: true });
    },
  );

  it('keeps a page route that names no conversation', () => {
    expect(redactRoute('https://chatgpt.com/', pattern('chatgpt'))).toEqual({
      route: '/',
      conversation: false,
    });
    expect(redactRoute('https://claude.ai/new', pattern('claude')).route).toBe('/new');
  });

  it('redacts a project slug that carries its name, even outside the conversation pattern', () => {
    const url =
      'https://chatgpt.com/g/g-p-0123456789abcdef0123456789abcdef-my-private-plans/project';
    expect(redactRoute(url, pattern('chatgpt'))).toEqual({
      route: '/g/:id/project',
      conversation: false,
    });
  });

  it('keeps the account slot but hides Gemini and AI Studio ids, which have no site pattern', () => {
    expect(redactRoute('https://gemini.google.com/u/1/app/4f2a9c0d1e7b3a55')).toEqual({
      route: '/u/1/app/:id',
      conversation: true,
    });
    expect(redactRoute('https://gemini.google.com/gem/9a8b7c6d5e4f/1a2b3c4d5e6f').route).toBe(
      '/gem/:id/:id',
    );
    expect(
      redactRoute('https://aistudio.google.com/prompts/1AbCdEf_gHiJkLmNoPqRsTuVwXyZ').route,
    ).toBe('/prompts/:id');
    expect(redactRoute('https://gemini.google.com/app')).toEqual({
      route: '/app',
      conversation: false,
    });
  });

  it('reports `/` for a URL it cannot parse', () => {
    expect(redactRoute('not a url')).toEqual({ route: '/', conversation: false });
  });
});
