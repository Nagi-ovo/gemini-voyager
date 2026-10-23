/** Auto sync is deprecated: switch a legacy "auto" sync mode to "manual". */
export async function migrateLegacySyncMode(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('gvSyncMode');
    if (result.gvSyncMode === 'auto') {
      console.log('[FolderManager] Migrating legacy "auto" sync mode to "manual"');
      await chrome.storage.local.set({ gvSyncMode: 'manual' });
    }
  } catch (error) {
    console.error('[FolderManager] Migration failed:', error);
  }
}
