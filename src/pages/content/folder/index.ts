import { FolderManager } from './manager';

export async function startFolderManager(): Promise<void> {
  try {
    const manager = new FolderManager();
    await manager.init();
  } catch (error) {
    console.error('[FolderManager] Start error:', error);
  }
}
