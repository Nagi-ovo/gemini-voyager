import { describe, expect, it } from 'vitest';

import { FOLDER_PLATFORMS, FROZEN_FOLDER_PLATFORM_IDS } from '@/features/folder/platforms';
import { BUNDLED_SITE_ADAPTERS } from '@/features/plugins/catalog/sites';
import { validateSiteAdapterData } from '@/features/plugins/sites/siteAdapterData';
import type { SiteAdapter } from '@/features/plugins/types';

import { deriveFolderSites } from '../derivedFolderSites';

const FROZEN = Object.fromEntries(
  FROZEN_FOLDER_PLATFORM_IDS.map((id) => [id, FOLDER_PLATFORMS[id]]),
);

/** A bundled site.json with a folders section, as a new site would ship it. */
function site(id: string, matches: string[], extra: Record<string, unknown> = {}): SiteAdapter {
  const result = validateSiteAdapterData({
    id,
    label: id,
    matches,
    selectors: {},
    theme: { hostSelector: 'body', lightSelector: 'body.light', darkSelector: 'body.dark' },
    conversationIdPattern: '^/c/([A-Za-z0-9-]+)',
    folders: {
      format: 1,
      sidebar: 'nav',
      rows: { row: 'li', drag: 'link' },
      mount: { anchors: [{ id: 'top', steps: [{ find: 'ul' }] }] },
      page: { placeholderTitles: { any: ['New chat'] } },
    },
    ...extra,
  });
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data;
}

const derive = (...sites: SiteAdapter[]) =>
  deriveFolderSites([...BUNDLED_SITE_ADAPTERS, ...sites], FROZEN);

describe('derived folder sites', () => {
  it("names a new site's bucket, backups, Drive file and sync times after its id, on its first exact host", () => {
    const derived = derive(site('orbit', ['https://*.orbit.test/*', 'https://chat.orbit.test/*']));

    expect([...derived.keys()]).toEqual(['orbit']);
    const orbit = derived.get('orbit' as never)!;
    expect(orbit.origin).toBe('https://chat.orbit.test');
    expect({ ...orbit.definition, folderExport: orbit.definition.folderExport.platform }).toEqual({
      hosts: ['chat.orbit.test'],
      folderStorageKey: 'gvFolderData:orbit',
      accountIsolationStorageKey: null,
      syncsSharedData: false,
      folderExport: 'orbit',
      driveFoldersFileName: 'gemini-voyager-orbit-folders.json',
      syncsConversationExtras: false,
      backupNamespace: 'orbit-folders',
      lastUploadTimeField: 'lastUploadTime:orbit',
      lastUploadTimeStorageKey: 'gvLastUploadTime:orbit',
      lastSyncTimeField: 'lastSyncTime:orbit',
      lastSyncTimeStorageKey: 'gvLastSyncTime:orbit',
    });
  });

  it('gives the bundled five no derived bucket of their own', () => {
    expect(derive().size).toBe(0);
  });

  it('gives nothing to a site whose id could pass for a frozen site', () => {
    const spoofs = ['chat-gpt', 'deep-seek', 'ai-studio', 'gemini-pro', 'my-claude'].map((id, i) =>
      site(id, [`https://chat${i}.spoof.test/*`]),
    );
    expect(derive(...spoofs).size).toBe(0);
  });

  it("gives nothing to a site on a frozen site's host, even one its bucket never names", () => {
    const hosts = [
      'https://claude.ai/*',
      'https://chat.openai.com/*',
      'https://gemini.google.com/*',
    ];
    expect(derive(...hosts.map((match, i) => site(`taker${i}`, [match]))).size).toBe(0);
  });

  it('gives nothing to a site with no exact https host, no folders or no conversation route', () => {
    const { folders: _folders, ...withoutFolders } = site('nofolders', ['https://a.none.test/*']);
    const { conversationIdPattern: _route, ...withoutRoute } = site('noroute', [
      'https://b.none.test/*',
    ]);
    expect(
      derive(
        site('wildcard', ['https://*.wild.test/*', 'http://plain.wild.test/*']),
        withoutFolders,
        withoutRoute,
      ).size,
    ).toBe(0);
  });

  it('gives nothing to two sites that claim one host, since neither can own it', () => {
    expect(
      derive(
        site('first', ['https://chat.shared.test/*']),
        site('second', ['https://chat.shared.test/*']),
      ).size,
    ).toBe(0);
  });
});
