/**
 * The storage owners that share `backgroundWriteQueue`: the prompt library and
 * the (dormant) folder owner. Started together so the queue's participants
 * are listed in one place, beside the storage budget's copy writer.
 */
import { startBudgetCopies } from './budgetCopies';
import { startFolderOwner } from './folderOwner';
import { startPromptLibraryOwner } from './promptLibraryOwner';

export { promptLibraryOwner } from './promptLibraryOwner';

export function startQueueOwners(): void {
  startBudgetCopies();
  startPromptLibraryOwner();
  startFolderOwner();
}
