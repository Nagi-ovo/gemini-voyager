import { describe, expect, it } from 'vitest';

import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';

import { exportChatGptFolders } from '../../chatgptFolders/transfer';
import { DEEPSEEK_TRANSFER } from '../../deepseekFolders/deepseekIdentity';
import { CLAUDE_IDENTITY, CLAUDE_TRANSFER } from '../claudeIdentity';

const ID = '7d33a785-f3df-4f6e-b536-f875148e3766';
const OTHER = '42a21e95-5936-4ba5-926a-ad14973f9231';

describe('Claude conversation identity', () => {
  it.each([
    ['a conversation', `https://claude.ai/chat/${ID}`],
    ['a conversation with a query and hash', `https://claude.ai/chat/${ID}?artifact=1#end`],
  ])('keys %s by its bare id', (_name, href) => {
    expect(CLAUDE_IDENTITY.read(href)).toEqual({
      id: ID,
      conversationId: `claude:conv:${ID}`,
      url: `https://claude.ai/chat/${ID}`,
      path: `/chat/${ID}`,
    });
  });

  it.each([
    ['the new chat page', 'https://claude.ai/new'],
    ['Recents', 'https://claude.ai/recents'],
    ['a Project page', `https://claude.ai/project/${ID}`],
    ['an artifact frame', `https://abc.frame.claudeusercontent.com/chat/${ID}`],
    ['a look-alike host', `https://claude.ai.evil.example/chat/${ID}`],
    ['plain http', `http://claude.ai/chat/${ID}`],
    ['a ChatGPT conversation', `https://chatgpt.com/c/${ID}`],
    ['garbage', 'not a url'],
  ])('reads no conversation from %s', (_name, href) => {
    expect(CLAUDE_IDENTITY.read(href)).toBeNull();
  });

  it.each([
    [`/chat/${ID}`, { id: ID, path: `/chat/${ID}` }],
    [`/chat/${ID}?x=1`, { id: ID, path: `/chat/${ID}` }],
    ['/recents', null],
    [`//evil.example/chat/${ID}`, null],
    [`https://claude.ai/chat/${ID}`, null],
    [null, null],
  ])('reads sidebar link %s', (href, expected) => {
    expect(CLAUDE_IDENTITY.readPath(href)).toEqual(expected);
  });

  it('strips only its own prefix from a stored id', () => {
    expect(CLAUDE_IDENTITY.bareId(`claude:conv:${ID}`)).toBe(ID);
    expect(CLAUDE_IDENTITY.bareId(`chatgpt:conv:${ID}`)).toBe(`chatgpt:conv:${ID}`);
  });
});

function ref(id: string, origin = 'https://claude.ai', path = `/chat/${id}`) {
  return { conversationId: `claude:conv:${id}`, title: id, url: `${origin}${path}`, addedAt: 1 };
}

const DATA: FolderData = {
  folders: [
    { id: 'f1', name: 'Thesis', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: { f1: [ref(ID)], [ROOT_CONVERSATIONS_ID]: [ref(OTHER)] },
};
const EMPTY: FolderData = { folders: [], folderContents: {} };

describe('Claude folder file', () => {
  it('round-trips its own export, marked as Claude', async () => {
    const payload = JSON.parse(JSON.stringify(CLAUDE_TRANSFER.export(DATA)));
    expect(payload.platform).toBe('claude');
    const outcome = await CLAUDE_TRANSFER.importInto(payload, EMPTY);
    expect(outcome.ok && outcome.data).toEqual(DATA);
  });

  it.each([
    ['a ChatGPT file', () => exportChatGptFolders(EMPTY)],
    ['a DeepSeek file', () => DEEPSEEK_TRANSFER.export(EMPTY)],
    [
      'an unmarked file holding a foreign entry',
      () => {
        const { platform: _platform, ...rest } = CLAUDE_TRANSFER.export({
          ...DATA,
          folderContents: { f1: [ref(ID, 'https://claude.ai.evil.example')] },
        });
        return rest;
      },
    ],
  ])('refuses %s as another site', async (_name, file) => {
    const outcome = await CLAUDE_TRANSFER.importInto(file(), DATA);
    expect(outcome).toEqual({ ok: false, reason: 'wrong-site' });
  });

  it('names the file after the site and the moment', () => {
    expect(CLAUDE_TRANSFER.filename(new Date(2026, 9, 19, 8, 5, 3))).toBe(
      'voyager-claude-folders-20261019-080503.json',
    );
  });
});
