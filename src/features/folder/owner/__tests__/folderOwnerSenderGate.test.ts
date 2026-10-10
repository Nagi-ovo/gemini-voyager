import { describe, expect, it } from 'vitest';

import type { FolderAuthority } from '../authority';
import type { FolderSite } from '../folderOwnerPolicy';
import { type FolderOwnerSender, checkFolderOwnerSender } from '../folderOwnerSenderGate';

const ID = 'voyager-id';
const BASE = 'chrome-extension://voyager-id/';
const OWNER: Record<FolderSite, FolderAuthority> = {
  gemini: 'owner',
  aistudio: 'owner',
  chatgpt: 'owner',
};
const env = { extensionId: ID, extensionBaseUrl: BASE, authority: OWNER };

const tab = (url: string, extra: Partial<FolderOwnerSender> = {}): FolderOwnerSender => ({
  id: ID,
  url,
  frameId: 0,
  tab: { url },
  ...extra,
});
const GEMINI = 'https://gemini.google.com/app/abc';
const allowed = (site: FolderSite) => ({ ok: true, site });
const denied = { ok: false, reason: 'sender_not_allowed' };

// T15: exactly the §6.8 decisions.
describe('checkFolderOwnerSender', () => {
  it.each<[string, FolderOwnerSender, string, object]>([
    ['the Gemini top frame', tab(GEMINI), 'gvFolderData', allowed('gemini')],
    ['an account-scoped Gemini key', tab(GEMINI), 'gvFolderData:acct:1a2b', allowed('gemini')],
    ['another extension', tab(GEMINI, { id: 'other' }), 'gvFolderData', denied],
    ['a subframe', tab(GEMINI, { frameId: 2 }), 'gvFolderData', denied],
    [
      'no frameId and a URL other than the tab',
      { id: ID, url: 'https://evil.example/', tab: { url: GEMINI } },
      'gvFolderData',
      denied,
    ],
    [
      'no frameId and the tab URL',
      { id: ID, url: GEMINI, tab: { url: GEMINI } },
      'gvFolderData',
      allowed('gemini'),
    ],
    [
      'no tab (Firefox without tab access)',
      { id: ID, url: GEMINI, frameId: 0 },
      'gvFolderData',
      allowed('gemini'),
    ],
    ['http', tab('http://gemini.google.com/app'), 'gvFolderData', denied],
    ['no URL at all', { id: ID, frameId: 0 }, 'gvFolderData', denied],
    ['Gemini Business', tab('https://business.gemini.google/'), 'gvFolderData', allowed('gemini')],
    [
      'AI Studio China',
      tab('https://aistudio.google.cn/prompts/1'),
      'gvFolderDataAIStudio',
      allowed('aistudio'),
    ],
    ['a Gemini tab naming the ChatGPT key', tab(GEMINI), 'gvFolderDataChatGPT', denied],
    [
      'an AI Studio sidecar key',
      tab('https://aistudio.google.com/'),
      'gvFolderDataAIStudio:legacySyncImported',
      denied,
    ],
    [
      'ChatGPT on its own key',
      tab('https://chatgpt.com/c/1'),
      'gvFolderDataChatGPT',
      allowed('chatgpt'),
    ],
    [
      'the options page on any folder key',
      { id: ID, url: `${BASE}options.html` },
      'gvFolderDataChatGPT',
      allowed('chatgpt'),
    ],
    [
      'a tab showing an extension URL',
      { id: ID, url: `${BASE}options.html`, frameId: 0, tab: { url: `${BASE}options.html` } },
      'gvFolderData',
      denied,
    ],
  ])('%s', (_name, sender, key, decision) => {
    expect(checkFolderOwnerSender(sender, key, env)).toEqual(decision);
  });

  it('refuses an allowed sender while the site is still under legacy authority', () => {
    const authority = { ...OWNER, aistudio: 'legacy' as const };

    expect(
      checkFolderOwnerSender(tab('https://aistudio.google.com/'), 'gvFolderDataAIStudio', {
        ...env,
        authority,
      }),
    ).toEqual({ ok: false, reason: 'not_owner' });
  });
});
