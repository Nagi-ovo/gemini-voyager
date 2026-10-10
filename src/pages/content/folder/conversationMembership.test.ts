import { describe, expect, it } from 'vitest';

import type { ConversationReference } from '@/core/types/folder';

import {
  buildConversationMembership,
  createConversationMembershipLookup,
} from './conversationMembership';

type Contents = Record<string, ConversationReference[]>;

function ref(conversationId: string, url: string): ConversationReference {
  return { conversationId, url, title: conversationId, addedAt: 1 };
}

/** The per-row scan `isConversationInFolders` used before it was indexed. */
function scanMembership(contents: Contents, conversationId: string): boolean {
  return Object.values(contents).some((conversations) =>
    conversations.some((c) => {
      if (c.conversationId === conversationId) return true;
      const cleanId = conversationId.replace(/^c_/, '');
      if (cleanId && cleanId === c.conversationId.replace(/^c_/, '')) return true;
      return !!cleanId && cleanId.length > 8 && c.url.includes(cleanId);
    }),
  );
}

const contents: Contents = {
  inbox: [
    ref('c_aaaabbbbccccdddd', 'https://gemini.google.com/app/aaaabbbbccccdddd'),
    ref('1111222233334444', 'https://gemini.google.com/u/1/app/1111222233334444?hl=en'),
    ref('legacy', 'https://gemini.google.com/gem/writer/9999888877776666'),
    ref('', 'https://gemini.google.com/app/'),
  ],
  work: [ref('c_short', 'https://gemini.google.com/app/0123456789abcdef0123')],
};

describe('buildConversationMembership', () => {
  it.each([
    ['c_aaaabbbbccccdddd', 'direct id'],
    ['aaaabbbbccccdddd', 'stored id has the c_ prefix'],
    ['c_1111222233334444', 'sidebar id has the c_ prefix'],
    ['c_9999888877776666', 'gem URL contains the id'],
    ['1111222233334444', 'account URL with a query'],
    ['456789abcdef0', 'id inside a longer URL token'],
    ['short', 'unprefixed short id equality'],
    ['', 'empty id equal to an empty stored id'],
    ['c_', 'prefix only'],
    ['c_12345678', 'eight characters never match by URL'],
    ['gemini.google.com', 'non-token characters scan each URL'],
    ['app/aaaabbbbcccc', 'path fragment'],
    ['c_ffffeeeeddddcccc', 'unknown id'],
    ['google.com/u/1/app\n', 'separator character'],
  ])('matches the original scan for %s (%s)', (id) => {
    expect(buildConversationMembership(contents).has(id)).toBe(scanMembership(contents, id));
  });

  it('matches the original scan on generated ids and URLs', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const hex = (length: number) =>
      Array.from({ length }, () => '0123456789abcdef'[Math.floor(random() * 16)]).join('');
    const generated: Contents = { a: [], b: [] };
    const known: string[] = [];
    for (let i = 0; i < 200; i++) {
      const id = hex(random() < 0.2 ? 20 : 16);
      known.push(id);
      const prefix = random() < 0.5 ? 'c_' : '';
      const route = random() < 0.3 ? `gem/${hex(12)}/` : random() < 0.5 ? 'u/2/app/' : 'app/';
      generated[i % 2 ? 'a' : 'b'].push(ref(`${prefix}${id}`, `https://x.test/${route}${id}`));
    }
    const probes = [
      ...known.map((id) => `c_${id}`),
      ...known.map((id) => id.slice(2, 13)),
      ...known.map((id) => id.slice(0, 8)),
      ...Array.from({ length: 200 }, () => `c_${hex(16)}`),
    ];
    const membership = buildConversationMembership(generated);
    for (const probe of probes) {
      expect(membership.has(probe), probe).toBe(scanMembership(generated, probe));
    }
  });
});

describe('createConversationMembershipLookup', () => {
  function countingContents(size: number): { contents: Contents; reads: () => number } {
    let reads = 0;
    const conversations = Array.from({ length: size }, (_, i) => {
      const id = `c_${i.toString(16).padStart(16, '0')}`;
      const url = `https://gemini.google.com/app/${id.slice(2)}`;
      return {
        title: id,
        addedAt: 1,
        get conversationId() {
          reads += 1;
          return id;
        },
        url,
      } as ConversationReference;
    });
    return { contents: { inbox: conversations }, reads: () => reads };
  }

  it('indexes once for a batch of rows instead of once per row', () => {
    const lookup = createConversationMembershipLookup();
    const { contents: data, reads } = countingContents(500);

    for (let i = 0; i < 500; i++) lookup(data).has(`c_${(9000 + i).toString(16)}`);

    // Building the index reads each stored id a constant number of times;
    // the per-row scan read every stored id for every row (500 x 500).
    expect(reads()).toBeLessThanOrEqual(500 * 3);
  });

  it('sees conversations added in place during the same task', () => {
    const lookup = createConversationMembershipLookup();
    const data: Contents = { inbox: [] };
    expect(lookup(data).has('c_aaaabbbbccccdddd')).toBe(false);

    data.inbox.push(ref('c_aaaabbbbccccdddd', 'https://gemini.google.com/app/aaaabbbbccccdddd'));
    expect(lookup(data).has('c_aaaabbbbccccdddd')).toBe(true);

    data.inbox = data.inbox.filter(() => false);
    expect(lookup(data).has('c_aaaabbbbccccdddd')).toBe(false);
  });

  it('sees in-place edits to stored entries after the current task', async () => {
    const lookup = createConversationMembershipLookup();
    const entry = ref('c_aaaabbbbccccdddd', 'https://gemini.google.com/app/aaaabbbbccccdddd');
    const data: Contents = { inbox: [entry] };
    expect(lookup(data).has('c_aaaabbbbccccdddd')).toBe(true);

    entry.conversationId = 'c_1111222233334444';
    entry.url = 'https://gemini.google.com/app/1111222233334444';
    await Promise.resolve();

    expect(lookup(data).has('c_aaaabbbbccccdddd')).toBe(false);
    expect(lookup(data).has('c_1111222233334444')).toBe(true);
  });

  /** Folder contents whose bucket reads are counted, as the shape check makes them. */
  function countingBuckets(buckets: number): { contents: Contents; reads: () => number } {
    let reads = 0;
    const target: Contents = {};
    for (let i = 0; i < buckets; i++) {
      const id = `${i.toString(16).padStart(16, '0')}`;
      target[`f${i}`] = [ref(`c_${id}`, `https://gemini.google.com/app/${id}`)];
    }
    const contents = new Proxy(target, {
      get(object, key, receiver) {
        if (typeof key === 'string' && key.startsWith('f')) reads += 1;
        return Reflect.get(object, key, receiver);
      },
    });
    return { contents, reads: () => reads };
  }

  it('checks the folder shape once for a pass that shares a revision', () => {
    const lookup = createConversationMembershipLookup();
    const { contents: data, reads } = countingBuckets(200);
    const pass = {};
    lookup(data, pass);
    const afterFirstRow = reads();

    for (let i = 0; i < 500; i++) lookup(data, pass).has(`c_${(9000 + i).toString(16)}`);

    expect(reads()).toBe(afterFirstRow);
    // Without a revision every row re-reads every bucket.
    lookup(data).has('c_1');
    expect(reads()).toBeGreaterThanOrEqual(afterFirstRow + 200);
  });

  it('adopts a pass for an index another caller built in the same task', () => {
    const lookup = createConversationMembershipLookup();
    const { contents: data, reads } = countingBuckets(200);
    lookup(data).has('c_1');
    const pass = {};
    lookup(data, pass);
    const afterFirstRow = reads();

    for (let i = 0; i < 100; i++) lookup(data, pass).has(`c_${i}`);

    expect(reads()).toBe(afterFirstRow);
  });

  it('checks the shape again for a new pass and sees what changed in between', () => {
    const lookup = createConversationMembershipLookup();
    const data: Contents = { inbox: [] };
    expect(lookup(data, {}).has('c_aaaabbbbccccdddd')).toBe(false);

    data.inbox.push(ref('c_aaaabbbbccccdddd', 'https://gemini.google.com/app/aaaabbbbccccdddd'));
    expect(lookup(data, {}).has('c_aaaabbbbccccdddd')).toBe(true);
    expect(lookup(data).has('c_aaaabbbbccccdddd')).toBe(true);
  });

  it('never reuses a pass across different folder contents', () => {
    const lookup = createConversationMembershipLookup();
    const pass = {};
    const filed = { inbox: [ref('c_aaaabbbbccccdddd', '/app/aaaabbbbccccdddd')] };
    expect(lookup({ inbox: [] }, pass).has('c_aaaabbbbccccdddd')).toBe(false);
    expect(lookup(filed, pass).has('c_aaaabbbbccccdddd')).toBe(true);
  });

  it('keeps URL-derived legacy matches within a pass', () => {
    const lookup = createConversationMembershipLookup();
    const pass = {};
    for (const id of [
      'c_aaaabbbbccccdddd',
      'c_9999888877776666',
      '456789abcdef0',
      'c_unknown00000',
    ]) {
      expect(lookup(contents, pass).has(id), id).toBe(scanMembership(contents, id));
    }
  });
});
