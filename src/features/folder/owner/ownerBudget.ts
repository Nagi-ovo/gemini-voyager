/**
 * The owner's writes inside the background StorageBudget (addendum P3P4 R6.1):
 * a backup copy is a `copy` step, skipped near the soft cap; a commit is one
 * `data` step for its intent, K and meta, refused only past a hard quota.
 * Each step admits and writes together; they run one after another inside a
 * queue turn, never nested.
 */
import {
  type StorageBudget,
  storedItemBytes,
  storedItemsBytes,
} from '@/features/storage/storageBudget';

import type { CommitGate, FolderOwnerStorageArea } from './folderOwnerState';
import type { WriteCopy } from './ownerBackups';

type Budget = Pick<StorageBudget, 'run'>;

export const budgetedCopy =
  (budget: Budget, area: FolderOwnerStorageArea): WriteCopy =>
  async (slotKey, entry) => {
    const request = {
      kind: 'copy' as const,
      keys: [slotKey],
      bytes: storedItemBytes(slotKey, entry),
    };
    const admission = await budget.run(request, () => area.set({ [slotKey]: entry }));
    return admission.admitted;
  };

export const budgetedCommit =
  (budget: Budget): CommitGate =>
  async (writes, commit) => {
    const request = {
      kind: 'data' as const,
      keys: Object.keys(writes),
      bytes: storedItemsBytes(writes),
    };
    const admission = await budget.run(request, commit);
    return admission.admitted ? admission.value : { kind: 'failed' };
  };
