import { describe, expect, it } from 'vitest';

import type { EditOutcome } from '@/features/folder/commands/folderCommands';

import { FolderClient } from '../client/folderClient';
import { INTERRUPTED, type StoredOutcome } from '../folderOps';
import type { FolderOwnerRequest, FolderOwnerResponse } from '../folderOwnerMessages';
import { FOLDER_SITE_POLICIES } from '../folderOwnerPolicy';
import { acknowledge } from '../ownerProcess';
import { KEY, rename } from './ownerHarness';

const TTL = 30 * 60 * 1000;
const PENDING: StoredOutcome = { kind: 'bundle_pending', txId: 'tx-1' };

describe('bundle_pending is never terminal (addendum P3P4 R4.1)', () => {
  it('an ack drops delivered outcomes but never a pending one', () => {
    const client = {
      applied: 3,
      acked: 0,
      outcomes: { 1: PENDING, 2: { kind: 'saved' as const }, 3: { kind: 'saved' as const } },
      lastSeenAt: 0,
    };

    expect(acknowledge(client, 2, 10).outcomes).toEqual({ 1: PENDING, 3: { kind: 'saved' } });
  });

  it('leaves the edit unsettled while pending and delivers the outcome it settles as', async () => {
    const answers: StoredOutcome[] = [PENDING, PENDING, INTERRUPTED];
    const timers: Array<() => void> = [];
    let applies = 0;
    const client = new FolderClient({
      key: KEY,
      policy: FOLDER_SITE_POLICIES.gemini,
      area: {
        get: async () => ({}),
        getAll: async () => ({}),
        set: async () => {},
        remove: async () => {},
      },
      subscribe: () => () => {},
      newId: () => 'client',
      setTimer: (run) => {
        timers.push(run);
        return () => {};
      },
      send: async (request: FolderOwnerRequest): Promise<FolderOwnerResponse> => {
        if (request.type === 'gv.folderOwner.open') {
          return {
            kind: 'empty',
            epoch: 'e',
            rev: 1,
            applied: 0,
            held: [],
            legacySync: false,
            allowanceTtlMs: TTL,
          };
        }
        const outcome = answers[Math.min(applies++, answers.length - 1)];
        return {
          kind: 'ok',
          epoch: 'e',
          rev: 1,
          applied: 1,
          outcomes: { 1: outcome },
          allowanceTtlMs: TTL,
        };
      },
    });
    await client.open();
    let delivered: EditOutcome | null = null;
    void client.run(rename('F', 'B') as never).then((outcome) => (delivered = outcome));

    await expect.poll(() => applies).toBe(1);
    expect(delivered).toBeNull();
    // The client asks again only on its back-off timer, never in a tight loop.
    expect(timers).toHaveLength(1);
    timers.shift()!();
    await expect.poll(() => applies).toBe(2);
    expect(delivered).toBeNull();
    timers.shift()!();

    await expect.poll(() => delivered).toEqual(INTERRUPTED);
    expect(applies).toBe(3);
  });
});
