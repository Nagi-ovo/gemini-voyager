import { describe, expect, it } from 'vitest';

import { AISTUDIO_ROOT_BUCKET_ID, ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import type { AddVia } from '@/features/folder/owner/folderOwnerPolicy';
import { FOLDER_PLATFORM_IDS } from '@/features/folder/platforms';
import type { FolderData } from '@/pages/content/folder/types';

import { FOLDER_SITE_TABLE, type FolderSiteRow, folderSiteOf } from '../folderSiteTable';
import pinned from './fixtures/folderSiteTable.json';

const VIAS: readonly AddVia[] = ['native-menu', 'project', 'picker', 'outside-drop'];

/** A legacy global bucket with one conversation of route user 1 and one of user 2. */
function legacyBucket(): FolderData {
  const conversation = (id: string, user: string) => ({
    conversationId: id,
    title: id,
    url: `https://gemini.google.com/u/${user}/app/${id}`,
    addedAt: 1,
  });
  return {
    folders: [{ id: 'f', name: 'F', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
    folderContents: { f: [conversation('one', '1'), conversation('two', '2')] },
  };
}

/** What a scoped account inherits from the legacy bucket: by route user, all of it, or nothing. */
function legacyMigration(row: FolderSiteRow): string {
  const migrated = row.config.migrateLegacyData(legacyBucket(), {
    accountKey: 'k',
    accountId: 1,
    routeUserId: '1',
    emailHash: null,
  });
  const kept = Object.values(migrated.folderContents).flat().length;
  return kept === 2 ? 'copy' : kept === 1 ? 'filter-by-route-user' : 'none';
}

/** Whether loads and saves repair the data (seed `sortIndex`, dedupe) or keep it byte for byte. */
function normalizes(row: FolderSiteRow): boolean {
  const unsorted = legacyBucket();
  return JSON.stringify(row.config.normalize(unsorted)) !== JSON.stringify(legacyBucket());
}

/** Every literal of a row: keys, namespaces, file names, flags and the per-site choices. */
function snapshot(row: FolderSiteRow) {
  const { folderExport, ...platform } = row.platform;
  const { normalize: _normalize, migrateLegacyData: _migrate, ...config } = row.config;
  const { keysOf: _keysOf, idKey: _idKey, addPlacement, ...policy } = row.policy;
  return {
    platform: { ...platform, folderExport: folderExport?.platform ?? null },
    config: { ...config, normalizes: normalizes(row), legacyMigration: legacyMigration(row) },
    policy: {
      ...policy,
      addPlacement: Object.fromEntries(VIAS.map((via) => [via, addPlacement(via)])),
    },
    storage: row.storage,
    identity: row.identity,
    tree: row.tree,
    prefs: row.prefs,
    activity: row.activity,
    messages: row.messages,
    guideId: row.guideId,
    importStrategies: row.importStrategies,
    extension: row.extension,
  };
}

describe('folder site table', () => {
  it('keeps every key, namespace, file name and data rule each site stores under', () => {
    // A changed literal here silently orphans the folders users already have.
    const current = Object.fromEntries(
      FOLDER_PLATFORM_IDS.map((site) => [site, snapshot(FOLDER_SITE_TABLE[site])]),
    );
    expect(JSON.parse(JSON.stringify(current))).toEqual(pinned);
  });

  it('has a row for every folder site and none for any other site', () => {
    for (const site of FOLDER_PLATFORM_IDS) expect(folderSiteOf(site)?.site).toBe(site);
    expect(folderSiteOf('perplexity')).toBe(null);
    expect(folderSiteOf('constructor')).toBe(null);
  });

  it('keeps one root bucket per site between the bucket config and the owner policy', () => {
    for (const site of FOLDER_PLATFORM_IDS) {
      const row = FOLDER_SITE_TABLE[site];
      expect(row.policy.rootBucketId).toBe(row.config.rootBucketId);
      expect(row.config.rootBucketId).toBe(
        site === 'aistudio' ? AISTUDIO_ROOT_BUCKET_ID : ROOT_CONVERSATIONS_ID,
      );
      expect(row.config.storageKey).toBe(row.platform.folderStorageKey);
      expect(row.config.backupNamespace).toBe(row.platform.backupNamespace);
    }
  });

  it('cannot be changed at run time', () => {
    const row = FOLDER_SITE_TABLE.chatgpt as { storage: string };
    expect(() => {
      row.storage = 'local+pageMirror';
    }).toThrow(TypeError);
    expect(Object.isFrozen(FOLDER_SITE_TABLE.aistudio.tree.refusedOps)).toBe(true);
  });
});
