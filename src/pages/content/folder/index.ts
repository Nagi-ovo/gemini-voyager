import { FolderManager } from './manager';

let managerInstance: FolderManager | null = null;

export async function startFolderManager(): Promise<FolderManager | null> {
  try {
    const manager = new FolderManager();
    await manager.init();
    managerInstance = manager;
    return manager;
  } catch (error) {
    console.error('[FolderManager] Start error:', error);
    return null;
  }
}

export function getFolderManager(): FolderManager | null {
  return managerInstance;
}
