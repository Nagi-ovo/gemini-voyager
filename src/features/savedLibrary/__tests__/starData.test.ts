import { describe, expect, it } from 'vitest';

import { decodeStarredSnapshot, mergeStarredMessages, normalizeStarredMessages } from '../starData';
import type { StarredMessage } from '../starTypes';

const star = (turnId: string, starredAt = 1): StarredMessage => ({
  turnId,
  starredAt,
  conversationId: 'chat',
  content: `preview ${turnId}`,
  conversationUrl: 'https://gemini.google.com/u/2/app/chat',
});
const data = (...items: StarredMessage[]) => ({ messages: { chat: items } });

describe('Saved Library star data', () => {
  it('complete sparse snapshots hydrate through the shared codec', () => {
    const raw = { messages: { chat: [{ turnId: 'sparse', account: 'opaque' }] } };
    expect(decodeStarredSnapshot(raw)).toEqual(normalizeStarredMessages(raw));
    expect(decodeStarredSnapshot({ messages: {} })).toEqual({ messages: {} });
  });

  it.each([
    undefined,
    null,
    {},
    { messages: [] },
    { messages: { chat: null } },
    { messages: { chat: [star('valid')], broken: null } },
    { messages: { chat: [star('valid'), null] } },
    { messages: { chat: [{ content: 'missing id' }] } },
  ])('a malformed or partial snapshot cannot hydrate from recovered siblings: %j', (value) =>
    expect(decodeStarredSnapshot(value)).toBeUndefined(),
  );
  it('recovers sparse identifiable records without dropping valid siblings or opaque fields', () => {
    expect(
      normalizeStarredMessages({
        messages: {
          chat: [null, 3, {}, { turnId: '' }, star('rich'), { turnId: 'u-7', account: 'opaque' }],
        },
      }),
    ).toEqual(
      data(star('rich'), {
        turnId: 'u-7',
        conversationId: 'chat',
        starredAt: 0,
        content: '',
        conversationUrl: '',
        account: 'opaque',
      } as StarredMessage),
    );
  });

  it.each([null, [], {}, { messages: [] }, { messages: { chat: null } }])(
    'ignores shapes that cannot contain a star without preventing recovery: %j',
    (value) => expect(normalizeStarredMessages(value)).toEqual({ messages: {} }),
  );

  it('a corrupt title cannot make an identifiable star unusable to a Library renderer', () => {
    const result = normalizeStarredMessages({
      messages: {
        chat: [
          {
            ...star('corrupt-title'),
            conversationTitle: { bad: true },
            opaqueField: { kept: true },
          },
          { ...star('valid-title'), conversationTitle: 'Saved title' },
        ],
      },
    });
    expect(result.messages.chat).toEqual([
      { ...star('corrupt-title'), opaqueField: { kept: true } },
      { ...star('valid-title'), conversationTitle: 'Saved title' },
    ]);
  });

  it('unions conversations and turns in first-seen order and never mutates either input', () => {
    const local = data(star('first'), star('shared', 2));
    const cloud = {
      messages: { chat: [star('shared', 3), star('last')], other: [star('first')] },
    };
    const before = structuredClone([local, cloud]);
    expect(mergeStarredMessages(local, cloud)).toEqual({
      messages: { chat: [star('shared', 3), star('last'), star('first')], other: [star('first')] },
    });
    expect([local, cloud]).toEqual(before);
    expect(mergeStarredMessages(local, { messages: {} })).toEqual(local);
    expect(mergeStarredMessages({ messages: {} }, cloud)).toEqual(cloud);
    expect(mergeStarredMessages({ messages: {} }, { messages: {} })).toEqual({ messages: {} });
  });

  it.each([1, 2, 3])('prefers the newer timestamp and local content on ties: %s', (cloudTime) => {
    const local = { ...star('shared', 2), content: 'local' };
    const cloud = { ...star('shared', cloudTime), content: 'cloud' };
    expect(mergeStarredMessages(data(local), data(cloud)).messages.chat[0].content).toBe(
      cloudTime > 2 ? 'cloud' : 'local',
    );
  });

  it('a sparse newer row preserves rich previews, titles and generic metadata', () => {
    const rich = {
      ...star('shared', 1),
      conversationTitle: 'Title',
      account: 'opaque-account',
      extensionMetadata: { tag: 'kept' },
    };
    const sparse = normalizeStarredMessages({
      messages: { chat: [{ turnId: 'shared', starredAt: 9, conversationTitle: '' }] },
    });
    expect(mergeStarredMessages(data(rich), sparse).messages.chat).toEqual([
      { ...rich, starredAt: 9 },
    ]);
  });
});
