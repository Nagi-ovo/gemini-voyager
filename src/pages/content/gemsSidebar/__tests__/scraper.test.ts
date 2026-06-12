import { afterEach, describe, expect, it } from 'vitest';

import { isGemsViewPathname, scrapeGemsFromDocument } from '../index';

/**
 * Build a JSDOM fragment that mirrors Gemini's actual /gems/view structure.
 * Captured via Chrome MCP probe in May 2026 — when Gemini changes the layout,
 * these mocks need to follow.
 */
function buildGemsListFragment(
  gems: Array<{
    id: string;
    name: string;
    description?: string;
    iconLetter?: string;
  }>,
): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-test-id', 'your-gems-list');

  gems.forEach((gem) => {
    const row = document.createElement('bot-list-row');

    const anchor = document.createElement('a');
    anchor.className = 'bot-row';
    anchor.setAttribute('href', `/gem/${gem.id}`);

    if (gem.iconLetter) {
      const logo = document.createElement('bot-logo');
      logo.className = 'bot-logo';
      const logoText = document.createElement('div');
      logoText.className = 'bot-logo-text';
      logoText.textContent = gem.iconLetter;
      logo.appendChild(logoText);
      anchor.appendChild(logo);
    }

    const info = document.createElement('div');
    info.className = 'bot-info-container';

    const titleOuter = document.createElement('div');
    titleOuter.className = 'bot-title';
    const titleInner = document.createElement('div');
    titleInner.className = 'bot-title-inner';
    const titleContainer = document.createElement('div');
    titleContainer.className = 'title-container';
    titleContainer.textContent = gem.name;
    titleInner.appendChild(titleContainer);
    titleOuter.appendChild(titleInner);
    info.appendChild(titleOuter);

    if (gem.description) {
      const descContainer = document.createElement('div');
      descContainer.className = 'bot-desc-container';
      const desc = document.createElement('span');
      desc.className = 'bot-desc';
      desc.textContent = gem.description;
      descContainer.appendChild(desc);
      info.appendChild(descContainer);
    }

    anchor.appendChild(info);
    row.appendChild(anchor);
    root.appendChild(row);
  });

  return root;
}

describe('gemsSidebar scraper', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns an empty array when the gems list is not on the page', () => {
    expect(scrapeGemsFromDocument()).toEqual([]);
  });

  it('parses gem metadata out of bot-list-row entries', () => {
    document.body.appendChild(
      buildGemsListFragment([
        { id: 'e93af280eb39', name: 'Resume Coach', description: 'Career advice', iconLetter: 'R' },
        { id: 'abc123', name: 'Code Reviewer' },
      ]),
    );

    const result = scrapeGemsFromDocument();
    expect(result).toEqual([
      {
        id: 'e93af280eb39',
        href: '/gem/e93af280eb39',
        name: 'Resume Coach',
        description: 'Career advice',
        iconLetter: 'R',
      },
      {
        id: 'abc123',
        href: '/gem/abc123',
        name: 'Code Reviewer',
      },
    ]);
  });

  it('normalizes account-scoped gem hrefs to an account-relative path', () => {
    // The cache is shared across every window of the browser profile, so the
    // scraped href must not carry the account that happened to scrape it.
    document.body.appendChild(buildGemsListFragment([{ id: 'scoped', name: 'Scoped Gem' }]));
    document.querySelector('a.bot-row')!.setAttribute('href', '/u/1/gem/scoped');

    expect(scrapeGemsFromDocument()).toEqual([
      {
        id: 'scoped',
        href: '/gem/scoped',
        name: 'Scoped Gem',
      },
    ]);
  });

  it('ignores rows whose href does not match /gem/<id>', () => {
    document.body.appendChild(buildGemsListFragment([{ id: 'real', name: 'Real Gem' }]));
    // Append a malformed row.
    const list = document.querySelector('[data-test-id="your-gems-list"]')!;
    const bogus = document.createElement('bot-list-row');
    const badAnchor = document.createElement('a');
    badAnchor.className = 'bot-row';
    badAnchor.setAttribute('href', '/not-a-gem');
    badAnchor.textContent = 'Should be ignored';
    bogus.appendChild(badAnchor);
    list.appendChild(bogus);

    const result = scrapeGemsFromDocument();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('real');
  });

  it('skips rows whose name is empty (transient Angular renders)', () => {
    document.body.appendChild(buildGemsListFragment([{ id: 'good', name: 'Has a name' }]));
    const list = document.querySelector('[data-test-id="your-gems-list"]')!;
    const empty = document.createElement('bot-list-row');
    const anchor = document.createElement('a');
    anchor.className = 'bot-row';
    anchor.setAttribute('href', '/gem/empty');
    const info = document.createElement('div');
    info.className = 'bot-info-container';
    const titleOuter = document.createElement('div');
    titleOuter.className = 'bot-title';
    const titleInner = document.createElement('div');
    titleInner.className = 'bot-title-inner';
    const titleContainer = document.createElement('div');
    titleContainer.className = 'title-container';
    // No textContent — simulates Angular mid-render.
    titleInner.appendChild(titleContainer);
    titleOuter.appendChild(titleInner);
    info.appendChild(titleOuter);
    anchor.appendChild(info);
    empty.appendChild(anchor);
    list.appendChild(empty);

    const result = scrapeGemsFromDocument();
    expect(result.map((g) => g.id)).toEqual(['good']);
  });
});

describe('gemsSidebar route matching', () => {
  it('matches both root and account-scoped Gems pages', () => {
    expect(isGemsViewPathname('/gems')).toBe(true);
    expect(isGemsViewPathname('/gems/view')).toBe(true);
    expect(isGemsViewPathname('/u/0/gems')).toBe(true);
    expect(isGemsViewPathname('/u/12/gems/view')).toBe(true);
  });

  it('does not match gem conversation routes or similarly named paths', () => {
    expect(isGemsViewPathname('/gem/custom-gem/conversation')).toBe(false);
    expect(isGemsViewPathname('/u/0/gem/custom-gem')).toBe(false);
    expect(isGemsViewPathname('/gems-old')).toBe(false);
  });
});
