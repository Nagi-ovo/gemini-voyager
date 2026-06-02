import { isEdge } from '@/core/utils/browser';

import { FolderManager } from './manager';

export async function startFolderManager(): Promise<FolderManager | null> {
  try {
    if (isEdge()) {
      console.warn('[FolderManager] Disabled on Edge pending compatibility update');
      return null;
    }

    const manager = new FolderManager();
    await manager.init();
    return manager;
  } catch (error) {
    console.error('[FolderManager] Start error:', error);
    return null;
  }
}
