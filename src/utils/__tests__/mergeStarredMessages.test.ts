import { describe, expect, it } from 'vitest';

import { mergeStarredMessages } from '../merge';

describe('mergeStarredMessages', () => {
  it('should return empty messages when both inputs are empty', () => {
    const local = { messages: {} };
    const cloud = { messages: {} };
    const result = mergeStarredMessages(local, cloud);
    expect(result).toEqual({ messages: {} });
  });

  it('should return local messages when cloud is empty', () => {
    const local = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Hello',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 1000,
          },
        ],
      },
    };
    const cloud = { messages: {} };
    const result = mergeStarredMessages(local, cloud);
    expect(result.messages.conv1).toHaveLength(1);
    expect(result.messages.conv1[0].turnId).toBe('turn1');
  });

  it('should return cloud messages when local is empty', () => {
    const local = { messages: {} };
    const cloud = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Hello',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 1000,
          },
        ],
      },
    };
    const result = mergeStarredMessages(local, cloud);
    expect(result.messages.conv1).toHaveLength(1);
    expect(result.messages.conv1[0].turnId).toBe('turn1');
  });

  it('should merge messages from different conversations', () => {
    const local = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Local message',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 1000,
          },
        ],
      },
    };
    const cloud = {
      messages: {
        conv2: [
          {
            turnId: 'turn2',
            content: 'Cloud message',
            conversationId: 'conv2',
            conversationUrl: 'https://gemini.google.com/app/conv2',
            starredAt: 2000,
          },
        ],
      },
    };
    const result = mergeStarredMessages(local, cloud);
    expect(Object.keys(result.messages)).toHaveLength(2);
    expect(result.messages.conv1).toHaveLength(1);
    expect(result.messages.conv2).toHaveLength(1);
  });

  it('should prefer local message when same turnId and local starredAt is newer', () => {
    const local = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Updated local message',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 2000, // newer
          },
        ],
      },
    };
    const cloud = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Old cloud message',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 1000, // older
          },
        ],
      },
    };
    const result = mergeStarredMessages(local, cloud);
    expect(result.messages.conv1).toHaveLength(1);
    expect(result.messages.conv1[0].content).toBe('Updated local message');
  });

  it('should prefer cloud message when cloud starredAt is newer', () => {
    const local = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Old local message',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 1000, // older
          },
        ],
      },
    };
    const cloud = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Updated cloud message',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 2000, // newer
          },
        ],
      },
    };
    const result = mergeStarredMessages(local, cloud);
    expect(result.messages.conv1).toHaveLength(1);
    expect(result.messages.conv1[0].content).toBe('Updated cloud message');
  });

  it('should merge different turnIds within same conversation', () => {
    const local = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Local turn 1',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 1000,
          },
        ],
      },
    };
    const cloud = {
      messages: {
        conv1: [
          {
            turnId: 'turn2',
            content: 'Cloud turn 2',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 2000,
          },
        ],
      },
    };
    const result = mergeStarredMessages(local, cloud);
    expect(result.messages.conv1).toHaveLength(2);
    const turnIds = result.messages.conv1.map((m) => m.turnId);
    expect(turnIds).toContain('turn1');
    expect(turnIds).toContain('turn2');
  });

  it('should handle undefined/null inputs gracefully', () => {
    // @ts-expect-error Testing null input
    const result1 = mergeStarredMessages(null, { messages: {} });
    expect(result1).toEqual({ messages: {} });

    // @ts-expect-error Testing undefined input
    const result2 = mergeStarredMessages(undefined, { messages: {} });
    expect(result2).toEqual({ messages: {} });

    // @ts-expect-error Testing both undefined
    const result3 = mergeStarredMessages(undefined, undefined);
    expect(result3).toEqual({ messages: {} });
  });

  it('should prefer local when timestamps are equal', () => {
    const local = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Local message',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 1000, // same timestamp
          },
        ],
      },
    };
    const cloud = {
      messages: {
        conv1: [
          {
            turnId: 'turn1',
            content: 'Cloud message',
            conversationId: 'conv1',
            conversationUrl: 'https://gemini.google.com/app/conv1',
            starredAt: 1000, // same timestamp
          },
        ],
      },
    };
    const result = mergeStarredMessages(local, cloud);
    // Local should win when timestamps are equal
    expect(result.messages.conv1[0].content).toBe('Local message');
  });
});
