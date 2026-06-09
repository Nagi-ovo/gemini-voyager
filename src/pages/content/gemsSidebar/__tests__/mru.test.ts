import { describe, expect, it } from 'vitest';

import {
  type GemMruEntry,
  orderGemsByRecency,
  readGemMetadata,
  upsertMru,
} from '../index';
import type { GemMetadata } from '../index';

const gem = (id: string, name = id): GemMetadata => ({ id, name, href: `/gem/${id}` });
const mru = (id: string, lastUsedAt: number, name = id): GemMruEntry => ({
  ...gem(id, name),
  lastUsedAt,
});

describe('gemsSidebar MRU ordering', () => {
  it('falls back to catalog order when the MRU is empty (original behavior)', () => {
    const catalog = [gem('a'), gem('b'), gem('c')];
    expect(orderGemsByRecency([], catalog).map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('ranks recently-used gems first, newest first', () => {
    const catalog = [gem('a'), gem('b'), gem('c')];
    const recent = [mru('c', 200), mru('a', 100)];
    // c (200) and a (100) used; b never used → padded last in catalog order.
    expect(orderGemsByRecency(recent, catalog).map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('includes used gems that are absent from the catalog (e.g. premade)', () => {
    const catalog = [gem('a')];
    const recent = [mru('premade-x', 500, 'Brainstormer'), mru('a', 100)];
    const ordered = orderGemsByRecency(recent, catalog);
    expect(ordered.map((g) => g.id)).toEqual(['premade-x', 'a']);
    expect(ordered[0].name).toBe('Brainstormer');
  });

  it('prefers richer catalog metadata (description) for shared ids', () => {
    const catalog: GemMetadata[] = [{ id: 'a', name: 'A', href: '/gem/a', description: 'rich' }];
    const recent = [mru('a', 100)];
    expect(orderGemsByRecency(recent, catalog)[0].description).toBe('rich');
  });

  it('never emits duplicates', () => {
    const catalog = [gem('a'), gem('b')];
    const recent = [mru('a', 100), mru('a', 50)];
    expect(orderGemsByRecency(recent, catalog).map((g) => g.id)).toEqual(['a', 'b']);
  });
});

describe('gemsSidebar upsertMru', () => {
  it('moves a re-used gem to the front and refreshes its timestamp', () => {
    const list: GemMruEntry[] = [mru('a', 100), mru('b', 90)];
    const next = upsertMru(list, gem('b'), 200);
    expect(next.map((e) => e.id)).toEqual(['b', 'a']);
    expect(next[0].lastUsedAt).toBe(200);
  });

  it('preserves prior description when the new capture lacks one', () => {
    const list: GemMruEntry[] = [{ id: 'a', name: 'A', href: '/gem/a', description: 'd', lastUsedAt: 1 }];
    const next = upsertMru(list, gem('a'), 2);
    expect(next[0].description).toBe('d');
  });

  it('caps history at 20 entries', () => {
    let list: GemMruEntry[] = [];
    for (let i = 0; i < 25; i++) list = upsertMru(list, gem(`g${i}`), i);
    expect(list).toHaveLength(20);
    expect(list[0].id).toBe('g24'); // newest first
  });
});

describe('gemsSidebar readGemMetadata', () => {
  const heroDoc = (name: string | null, letter?: string): Document => {
    const root = document.implementation.createHTMLDocument('');
    if (name !== null) {
      const n = root.createElement('div');
      n.className = 'bot-name-container';
      n.textContent = name;
      root.body.appendChild(n);
    }
    if (letter) {
      const l = root.createElement('div');
      l.className = 'bot-logo-text';
      l.textContent = letter;
      root.body.appendChild(l);
    }
    return root;
  };

  it('reads id/name/icon from a /gem/<id> hero', () => {
    const meta = readGemMetadata('/gem/abc123', heroDoc('Resume Coach', 'R'));
    expect(meta).toEqual({ id: 'abc123', href: '/gem/abc123', name: 'Resume Coach', iconLetter: 'R' });
  });

  it('handles the /u/<n>/gem/<id> multi-account path', () => {
    expect(readGemMetadata('/u/1/gem/xyz', heroDoc('Coder'))?.id).toBe('xyz');
  });

  it('returns null off a gem page', () => {
    expect(readGemMetadata('/app/5fe7f933', heroDoc('Whatever'))).toBeNull();
  });

  it('returns null when the hero name has not rendered yet', () => {
    expect(readGemMetadata('/gem/abc', heroDoc(null))).toBeNull();
  });
});
