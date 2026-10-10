import { describe, expect, it } from 'vitest';

import { ABSENT_HASH, hashValue } from '@/core/utils/canonicalHash';

import { ownerBackupKey, ownerMetaKey, resolveOwnerState } from '../folderOwnerState';
import { createFaultyStorage } from './faultyStorage';
import { ALL_OWNER, KEY, conversation, folder, folderData } from './ownerHarness';

// T22: one hash per value, whatever the key order or storage form.
describe('canonical hash', () => {
  it('gives permuted key insertion orders one hash', async () => {
    const data = folderData([folder('F', 'F', { color: 'red' })], { F: [conversation('c')] });
    const { url } = data.folderContents.F[0];
    const permuted = {
      folderContents: { F: [{ addedAt: 1, url, title: 'c', conversationId: 'c' }] },
      folders: [
        {
          color: 'red',
          updatedAt: 1,
          createdAt: 1,
          sortIndex: 0,
          isExpanded: true,
          parentId: null,
          name: 'F',
          id: 'F',
        },
      ],
    };

    expect(await hashValue(permuted)).toBe(await hashValue(data));
  });

  it('keeps a bucket named __proto__ in the hash', async () => {
    const withProto: unknown = JSON.parse(
      '{"folders":[],"folderContents":{"__proto__":[{"conversationId":"x"}]}}',
    );

    expect(await hashValue(withProto)).not.toBe(
      await hashValue({ folders: [], folderContents: {} }),
    );
  });

  it('hashes an absent value as absent', async () => {
    expect(await hashValue(undefined)).toBe(ABSENT_HASH);
  });

  it('classifies K stored as a string of the same data as clean, not foreign', async () => {
    const data = folderData([folder('F')]);
    const storage = createFaultyStorage({ [KEY]: data });
    await resolveOwnerState(storage.area, KEY, 1, () => 'epoch', ALL_OWNER);
    storage.write(KEY, JSON.stringify(data));

    const again = await resolveOwnerState(storage.area, KEY, 2, () => 'unused', ALL_OWNER);

    expect(again).toMatchObject({ kind: 'ready', data, meta: { epoch: 'epoch', rev: 1 } });
    expect(storage.read(ownerBackupKey(KEY, 'foreign'))).toBeUndefined();
    expect(storage.read(ownerMetaKey(KEY))).not.toHaveProperty('foreignAt');
  });
});
