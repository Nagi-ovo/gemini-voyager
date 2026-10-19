import { describe, expect, it } from 'vitest';

import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';

import { CLAUDE_TRANSFER } from '../../claudeFolders/claudeIdentity';
import { DEEPSEEK_IDENTITY, DEEPSEEK_TRANSFER } from '../deepseekIdentity';

const ID = '08d7829d-6c6c-4ea9-b796-1274249b885b';

describe('DeepSeek conversation identity', () => {
  it.each([
    ['a conversation', `https://chat.deepseek.com/a/chat/s/${ID}`],
    ['a conversation with a query', `https://chat.deepseek.com/a/chat/s/${ID}?x=1#y`],
  ])('keys %s by its bare id', (_name, href) => {
    expect(DEEPSEEK_IDENTITY.read(href)).toEqual({
      id: ID,
      conversationId: `deepseek:conv:${ID}`,
      url: `https://chat.deepseek.com/a/chat/s/${ID}`,
      path: `/a/chat/s/${ID}`,
    });
  });

  it.each([
    ['the home page', 'https://chat.deepseek.com/'],
    ['another DeepSeek host', `https://www.deepseek.com/a/chat/s/${ID}`],
    ['a path that only contains the route', `https://chat.deepseek.com/x/a/chat/s/${ID}`],
    ['a Claude conversation', `https://claude.ai/chat/${ID}`],
  ])('reads no conversation from %s', (_name, href) => {
    expect(DEEPSEEK_IDENTITY.read(href)).toBeNull();
  });

  it.each([
    [`/a/chat/s/${ID}`, { id: ID, path: `/a/chat/s/${ID}` }],
    ['/', null],
    [`//evil.example/a/chat/s/${ID}`, null],
  ])('reads sidebar link %s', (href, expected) => {
    expect(DEEPSEEK_IDENTITY.readPath(href)).toEqual(expected);
  });
});

describe('DeepSeek folder file', () => {
  const data: FolderData = {
    folders: [],
    folderContents: {
      [ROOT_CONVERSATIONS_ID]: [
        {
          conversationId: `deepseek:conv:${ID}`,
          title: 'Notes',
          url: `https://chat.deepseek.com/a/chat/s/${ID}`,
          addedAt: 1,
        },
      ],
    },
  };

  it('round-trips its own export, marked as DeepSeek', async () => {
    const payload = JSON.parse(JSON.stringify(DEEPSEEK_TRANSFER.export(data)));
    expect(payload.platform).toBe('deepseek');
    const outcome = await DEEPSEEK_TRANSFER.importInto(payload, {
      folders: [],
      folderContents: {},
    });
    expect(outcome.ok && outcome.data).toEqual(data);
  });

  it('refuses a Claude file as another site', () => {
    expect(DEEPSEEK_TRANSFER.read(CLAUDE_TRANSFER.export(data))).toEqual({
      ok: false,
      reason: 'wrong-site',
    });
  });
});
