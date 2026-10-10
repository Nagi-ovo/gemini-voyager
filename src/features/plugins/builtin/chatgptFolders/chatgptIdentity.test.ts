import { describe, expect, it } from 'vitest';

import { readChatGptConversation, readChatGptConversationPath } from './chatgptIdentity';

const ID = '68a1f2c3-0b4d-8001-9e2f-1a2b3c4d5e6f';

describe('readChatGptConversation', () => {
  it.each([
    ['a plain conversation', `https://chatgpt.com/c/${ID}`, `/c/${ID}`],
    [
      'a Project conversation',
      `https://chatgpt.com/g/g-p-67ab12cd34-trip/c/${ID}`,
      `/g/g-p-67ab12cd34-trip/c/${ID}`,
    ],
    [
      'a GPT conversation',
      `https://chatgpt.com/g/g-2fkFE8rbu-dall-e/c/${ID}`,
      `/g/g-2fkFE8rbu-dall-e/c/${ID}`,
    ],
    ['a legacy host', `https://chat.openai.com/c/${ID}`, `/c/${ID}`],
  ])('keys %s by its bare id and keeps its path', (_name, href, path) => {
    const identity = readChatGptConversation(href);
    expect(identity?.id).toBe(ID);
    expect(identity?.conversationId).toBe(`chatgpt:conv:${ID}`);
    expect(identity?.path).toBe(path);
    expect(identity?.url).toBe(`${new URL(href).origin}${path}`);
  });

  it('gives the same identity to one conversation inside and outside a Project', () => {
    const plain = readChatGptConversation(`https://chatgpt.com/c/${ID}`);
    const project = readChatGptConversation(`https://chatgpt.com/g/g-p-abc/c/${ID}`);
    expect(project?.conversationId).toBe(plain?.conversationId);
  });

  it('drops the query and hash from the stored url', () => {
    const identity = readChatGptConversation(`https://chatgpt.com/c/${ID}?model=gpt-5#top`);
    expect(identity?.url).toBe(`https://chatgpt.com/c/${ID}`);
  });

  it.each([
    ['the home page', 'https://chatgpt.com/'],
    ['a temporary chat', 'https://chatgpt.com/?temporary-chat=true'],
    ['a Project overview', 'https://chatgpt.com/g/g-p-67ab12cd34-trip/project'],
    ['a GPT home', 'https://chatgpt.com/g/g-2fkFE8rbu-dall-e'],
    ['Codex', 'https://chatgpt.com/codex'],
    ['a Gemini conversation', 'https://gemini.google.com/app/abc123'],
    ['a look-alike host', `https://chatgpt.com.evil.example/c/${ID}`],
    ['plain http', `http://chatgpt.com/c/${ID}`],
    ['a path that only ends in /c/', `https://chatgpt.com/share/x/c/${ID}`],
    ['garbage', 'not a url'],
  ])('reads no conversation from %s', (_name, href) => {
    expect(readChatGptConversation(href)).toBeNull();
  });
});

describe('readChatGptConversationPath', () => {
  it.each([
    ['a plain link', `/c/${ID}`, `/c/${ID}`],
    ['a Project link', `/g/g-p-67ab12cd34-trip/c/${ID}`, `/g/g-p-67ab12cd34-trip/c/${ID}`],
    ['a link with a query and hash', `/c/${ID}?model=gpt-5#top`, `/c/${ID}`],
  ])('reads %s', (_name, href, path) => {
    expect(readChatGptConversationPath(href)).toEqual({ id: ID, path });
  });

  it.each([
    ['the home link', '/'],
    ['the GPTs link', '/gpts'],
    ['a protocol-relative link to another host', `//evil.example/c/${ID}`],
    ['an absolute link', `https://chatgpt.com/c/${ID}`],
    ['no href', null],
  ])('reads nothing from %s', (_name, href) => {
    expect(readChatGptConversationPath(href)).toBeNull();
  });
});
