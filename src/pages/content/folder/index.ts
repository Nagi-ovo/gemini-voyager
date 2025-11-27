import { FolderManager } from './manager';

export async function startFolderManager(): Promise<FolderManager | null> {
  try {
    const manager = new FolderManager();
    await manager.init();
    return manager;
  } catch (error) {
    console.error('[FolderManager] Start error:', error);
    return null;
  }
}
