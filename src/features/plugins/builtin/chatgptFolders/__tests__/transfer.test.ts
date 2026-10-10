import { describe, expect, it } from 'vitest';

import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';

import {
  chatgptFolderExportFilename,
  exportChatGptFolders,
  importChatGptFolders,
} from '../transfer';

const A = '68a1f2c3-0b4d-8001-9e2f-1a2b3c4d5e6f';
const B = '68a1f2c3-0b4d-8001-9e2f-bbbbbbbbbbbb';

function ref(id: string, path = `/c/${id}`) {
  return {
    conversationId: `chatgpt:conv:${id}`,
    title: id,
    url: `https://chatgpt.com${path}`,
    addedAt: 1,
  };
}

function folder(id: string, name: string) {
  return { id, name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 };
}

const CHATGPT_DATA: FolderData = {
  folders: [folder('f1', 'Work')],
  folderContents: { f1: [ref(A, `/g/g-p-abc/c/${A}`)], [ROOT_CONVERSATIONS_ID]: [ref(B)] },
};

const EMPTY: FolderData = { folders: [], folderContents: {} };

describe('ChatGPT folder transfer', () => {
  it('round-trips its own export', async () => {
    const payload = JSON.parse(JSON.stringify(exportChatGptFolders(CHATGPT_DATA)));
    expect(payload.platform).toBe('chatgpt');
    expect(payload.format).toBe('gemini-voyager.folders.v1');

    const outcome = await importChatGptFolders(payload, EMPTY);
    expect(outcome.ok && outcome.data).toEqual(CHATGPT_DATA);
  });

  it('merges into existing folders without removing any', async () => {
    const current: FolderData = { folders: [folder('f0', 'Mine')], folderContents: { f0: [] } };
    const outcome = await importChatGptFolders(exportChatGptFolders(CHATGPT_DATA), current);
    expect(outcome.ok && outcome.data.folders.map((f) => f.id)).toEqual(['f0', 'f1']);
  });

  it('merge imports keep local conversations when malformed buckets and entries are discarded', async () => {
    const payload = {
      ...exportChatGptFolders(CHATGPT_DATA),
      data: {
        ...CHATGPT_DATA,
        folderContents: { f1: null, [ROOT_CONVERSATIONS_ID]: [ref(B), { title: 'Broken' }] },
      },
    };
    const outcome = await importChatGptFolders(payload, CHATGPT_DATA);
    expect(outcome.ok && outcome.data).toEqual(CHATGPT_DATA);
  });

  it('names its file for ChatGPT', () => {
    expect(chatgptFolderExportFilename(new Date(2026, 9, 1, 8, 5, 9))).toBe(
      'voyager-chatgpt-folders-20261001-080509.json',
    );
  });

  it('rejects a folder whose id every object inherits', async () => {
    const payload = JSON.parse(
      JSON.stringify(
        exportChatGptFolders({ folders: [folder('__proto__', 'P')], folderContents: {} }),
      ),
    );
    expect(await importChatGptFolders(payload, EMPTY)).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rejects a file marked for another site', async () => {
    const payload = { ...exportChatGptFolders(CHATGPT_DATA), platform: 'gemini' };
    expect(await importChatGptFolders(payload, EMPTY)).toEqual({ ok: false, reason: 'wrong-site' });
  });

  it('rejects an unmarked Gemini export', async () => {
    const gemini = {
      format: 'gemini-voyager.folders.v1',
      exportedAt: '2026-01-01T00:00:00.000Z',
      version: '1.0.0',
      data: {
        folders: [folder('g', 'Gemini')],
        folderContents: {
          g: [
            {
              conversationId: 'c_1',
              title: 'x',
              url: 'https://gemini.google.com/app/1',
              addedAt: 1,
            },
          ],
        },
      },
    };
    expect(await importChatGptFolders(gemini, EMPTY)).toEqual({ ok: false, reason: 'wrong-site' });
  });

  it('rejects the whole file for one foreign entry, even in the root bucket', async () => {
    const payload = exportChatGptFolders({
      ...CHATGPT_DATA,
      folderContents: {
        ...CHATGPT_DATA.folderContents,
        [ROOT_CONVERSATIONS_ID]: [
          ref(B),
          { ...ref('x'), url: 'https://aistudio.google.com/prompts/x' },
        ],
      },
    });
    expect(await importChatGptFolders(payload, EMPTY)).toEqual({ ok: false, reason: 'wrong-site' });
  });

  it('rejects the legacy redirect host instead of importing it as chatgpt.com', async () => {
    const payload = exportChatGptFolders({
      folders: [folder('f1', 'Work')],
      folderContents: { f1: [{ ...ref(A), url: `https://chat.openai.com/c/${A}` }] },
    });
    expect(await importChatGptFolders(payload, EMPTY)).toEqual({ ok: false, reason: 'wrong-site' });
  });

  it('rejects an entry whose id is not the one its url names', async () => {
    const payload = exportChatGptFolders({
      folders: [folder('f1', 'Work')],
      folderContents: { f1: [{ ...ref(A), conversationId: `chatgpt:conv:${B}` }] },
    });
    expect(await importChatGptFolders(payload, EMPTY)).toEqual({ ok: false, reason: 'wrong-site' });
  });

  it('reports a malformed file as invalid', async () => {
    const outcome = await importChatGptFolders({ format: 'something-else' }, EMPTY);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.reason).toBe('invalid');
  });
});
