import { describe, expect, it } from 'vitest';

import type { FolderData } from '@/core/types/folder';

import { filterLegacyFolderDataByCurrentAccount } from '../platformFolderConfig';

/** Storage hands data back through JSON, which makes `__proto__` an own key. */
function stored(contents: Record<string, unknown>): FolderData {
  const folders = Object.keys(contents).map((id, sortIndex) => ({
    id,
    name: id,
    parentId: null,
    isExpanded: true,
    createdAt: 1,
    updatedAt: 1,
    sortIndex,
  }));
  return JSON.parse(
    JSON.stringify({ folders, folderContents: contents }).replaceAll('PROTO', '__proto__'),
  ) as FolderData;
}

const conv = (id: string, url = `https://gemini.google.com/u/1/app/${id}`) => ({
  conversationId: id,
  title: id,
  url,
  addedAt: 1,
});

describe('rebuilding folder buckets before the load normalizes them', () => {
  it('keeps an empty __proto__ folder through the account route filter', () => {
    const data = stored({ PROTO: [], g: [conv('a')] });
    data.folders[1].parentId = '__proto__'; // visible as the parent of a matching folder

    const filtered = filterLegacyFolderDataByCurrentAccount(data, {
      accountKey: 'k',
      routeUserId: '1',
    } as Parameters<typeof filterLegacyFolderDataByCurrentAccount>[1]);

    expect(Object.getPrototypeOf(filtered.folderContents)).toBe(Object.prototype);
    expect(Object.hasOwn(filtered.folderContents, '__proto__')).toBe(true);
    expect(filtered.folderContents['__proto__']).toEqual([]);
  });

  it('fails the account route filter on a malformed bucket, so the load recovers a backup', () => {
    expect(() =>
      filterLegacyFolderDataByCurrentAccount(stored({ f: 'garbage' }), {
        accountKey: 'k',
        routeUserId: '1',
      } as Parameters<typeof filterLegacyFolderDataByCurrentAccount>[1]),
    ).toThrow(TypeError);
  });
});
