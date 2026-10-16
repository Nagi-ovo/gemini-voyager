/** Official plugin lifecycle; native folders retain their drag/drop and archive handling. */
import { createToaster } from '@/core/ui/toast/toaster';
import { createTranslator } from '@/utils/i18n';

import { LibrarySelection } from '../folder/aistudioLibrarySelection';
import { getLibraryPromptRows, isLibraryPath } from '../folder/aistudioLibraryTable';

/** Shares the native library's successful attachment and table observer with selection. */
class AIStudioBatchDeleteService {
  private readonly owners = new Set<object>();
  private selection: LibrarySelection | null = null;

  attach(owner: object): void {
    this.owners.add(owner);
    this.refresh();
  }

  refresh(): void {
    if (!this.selection || this.owners.size === 0 || !isLibraryPath()) return;
    for (const row of getLibraryPromptRows()) this.selection.bindRow(row);
    this.selection.refresh();
  }

  reset(): void {
    this.selection?.invalidateContext();
  }

  detach(owner: object): void {
    this.owners.delete(owner);
    if (this.owners.size === 0) this.selection?.destroy();
  }

  start(): () => Promise<void> {
    const toaster = createToaster();
    const selection = new LibrarySelection(
      createTranslator(),
      (message, tone) => {
        toaster.show({ message, tone, durationMs: tone === 'warning' ? 7000 : 3000 });
      },
      toaster,
    );
    this.selection = selection;
    this.refresh();
    return () => {
      if (this.selection === selection) this.selection = null;
      selection.destroy();
      // Turning off removes every toast; the accepted run still drains without a post-delete reload.
      toaster.destroy();
      return selection.settled;
    };
  }
}

export const aistudioBatchDeleteService = new AIStudioBatchDeleteService();

export function startAIStudioBatchDelete(): () => Promise<void> {
  return aistudioBatchDeleteService.start();
}
