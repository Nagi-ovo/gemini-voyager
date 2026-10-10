/**
 * Writes the pages' legacy backup copies inside the background's storage budget
 * (addendum P3P4 R6.1). A page never holds a permit: the budget measures, admits
 * and writes in one step, and replies `saved` or `skipped`.
 */
import { parseDataBackupKey } from '@/core/services/dataBackupKeys';
import { readAuthorityFence } from '@/features/folder/owner/authorityFence';
import { siteOfFolderKey } from '@/features/folder/owner/folderOwnerPolicy';
import { FOLDER_PLATFORMS, isFolderPlatform } from '@/features/folder/platforms';
import { isWriteCopyMessage, type WriteCopyReply } from '@/features/storage/budgetCopyMessage';
import {
  type StorageBudget,
  storageBudget,
  storedItemBytes,
} from '@/features/storage/storageBudget';

const FOLDER_BACKUP_NAMESPACE = /^([a-z]+)-folders(?::acct:[0-9a-z]{1,7})?$/;

export interface BudgetCopyDeps {
  budget: StorageBudget;
  write(items: Record<string, string>): Promise<void>;
}

const defaultDeps = (): BudgetCopyDeps => ({
  budget: storageBudget,
  write: (items) => chrome.storage.local.set(items),
});

export async function writeBudgetCopy(
  key: string,
  value: string,
  deps: BudgetCopyDeps = defaultDeps(),
): Promise<WriteCopyReply> {
  try {
    const admission = await deps.budget.run(
      { kind: 'copy', keys: [key], bytes: storedItemBytes(key, value) },
      async () => {
        const namespace = parseDataBackupKey(key)?.namespace;
        const platform = namespace && FOLDER_BACKUP_NAMESPACE.exec(namespace)?.[1];
        const site = isFolderPlatform(platform)
          ? siteOfFolderKey(FOLDER_PLATFORMS[platform].folderStorageKey)
          : null;
        // Admission may wait behind owner writes; recheck at the physical copy boundary.
        if (site && (await readAuthorityFence(chrome.storage.local, site)) !== 'legacy')
          return false;
        await deps.write({ [key]: value });
        return true;
      },
    );
    return { status: admission.admitted && admission.value ? 'saved' : 'skipped' };
  } catch {
    return { status: 'skipped' };
  }
}

export function startBudgetCopies(deps?: BudgetCopyDeps): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isWriteCopyMessage(message)) return undefined;
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ status: 'skipped' } satisfies WriteCopyReply);
      return undefined;
    }
    void writeBudgetCopy(message.key, message.value, deps).then(sendResponse);
    return true;
  });
}
