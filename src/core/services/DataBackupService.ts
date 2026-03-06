/**
 * DataBackupService - Robust multi-layer backup system for preventing data loss
 *
 * This service provides a reliable backup mechanism using localStorage instead of sessionStorage.
 * It implements multiple backup layers with timestamp validation to prevent data loss in scenarios
 * like network disconnections, page refreshes, and browser crashes.
 *
 * Backup Strategy:
 * 1. Primary Backup - Updated on every successful save
 * 2. Emergency Backup - Snapshot before each save operation
 * 3. BeforeUnload Backup - Created when user leaves the page
 *
 * Recovery Priority:
 * 1. Primary backup (most recent)
 * 2. Emergency backup (pre-save snapshot)
 * 3. BeforeUnload backup (page exit snapshot)
 * 4. In-memory data (current session)
 */

export interface BackupMetadata {
  timestamp: string;
  version: string;
  dataSize: number;
  itemCount: number;
}

export interface BackupData<T> {
  data: T;
  metadata: BackupMetadata;
}

export class DataBackupService<T = unknown> {
  private readonly primaryKey: string;
  private readonly emergencyKey: string;
  private readonly beforeUnloadKey: string;
  private readonly metadataKey: string;
  private readonly maxBackupAge: number = 7 * 24 * 60 * 60 * 1000; // 7 days
  private beforeUnloadHandler: (() => void) | null = null;

  constructor(
    private readonly namespace: string,
    private readonly validateData: (data: T) => boolean = () => true,
  ) {
    this.primaryKey = `gvBackup_${namespace}_primary`;
    this.emergencyKey = `gvBackup_${namespace}_emergency`;
    this.beforeUnloadKey = `gvBackup_${namespace}_beforeUnload`;
    this.metadataKey = `gvBackup_${namespace}_metadata`;
  }

  /**
   * Create a primary backup (called after successful save)
   */
  createPrimaryBackup(data: T): boolean {
    try {
      const backup = this.createBackupData(data);
      localStorage.setItem(this.primaryKey, JSON.stringify(backup));
      this.updateMetadata('primary', backup.metadata);
      console.log(`[BackupService:${this.namespace}] Primary backup created`);
      return true;
    } catch (error) {
      console.error(`[BackupService:${this.namespace}] Failed to create primary backup:`, error);
      return false;
    }
  }

  /**
   * Create an emergency backup (called before save operation)
   */
  createEmergencyBackup(data: T): boolean {
    try {
      const backup = this.createBackupData(data);
      localStorage.setItem(this.emergencyKey, JSON.stringify(backup));
      console.log(`[BackupService:${this.namespace}] Emergency backup created`);
      return true;
    } catch (error) {
      console.error(`[BackupService:${this.namespace}] Failed to create emergency backup:`, error);
      return false;
    }
  }

  /**
   * Create a beforeUnload backup (called when page is about to close)
   */
  private createBeforeUnloadBackup(data: T): boolean {
    try {
      const backup = this.createBackupData(data);
      localStorage.setItem(this.beforeUnloadKey, JSON.stringify(backup));
      console.log(`[BackupService:${this.namespace}] BeforeUnload backup created`);
      return true;
    } catch (error) {
      console.error(
        `[BackupService:${this.namespace}] Failed to create beforeUnload backup:`,
        error,
      );
      return false;
    }
  }

  /**
   * Setup automatic beforeUnload backup
   */
  setupBeforeUnloadBackup(getDataFn: () => T): void {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }

    this.beforeUnloadHandler = () => {
      try {
        const data = getDataFn();
        this.createBeforeUnloadBackup(data);
      } catch (error) {
        console.error(`[BackupService:${this.namespace}] BeforeUnload handler error:`, error);
      }
    };

    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  /**
   * Attempt to recover data from backups
   * Priority: primary > emergency > beforeUnload
   */
  recoverFromBackup(): T | null {
    console.warn(`[BackupService:${this.namespace}] Attempting data recovery...`);

    // Try primary backup first
    const primary = this.loadBackup(this.primaryKey, 'primary');
    if (primary) return primary;

    // Try emergency backup
    const emergency = this.loadBackup(this.emergencyKey, 'emergency');
    if (emergency) return emergency;

    // Try beforeUnload backup
    const beforeUnload = this.loadBackup(this.beforeUnloadKey, 'beforeUnload');
    if (beforeUnload) return beforeUnload;

    console.error(`[BackupService:${this.namespace}] All backup recovery attempts failed`);
    return null;
  }

  /**
   * Load a specific backup
   */
  private loadBackup(key: string, type: string): T | null {
    try {
      const backupStr = localStorage.getItem(key);
      if (!backupStr) {
        console.log(`[BackupService:${this.namespace}] No ${type} backup found`);
        return null;
      }

      const backup: BackupData<T> = JSON.parse(backupStr);

      // Validate timestamp
      if (!this.isBackupValid(backup)) {
        console.warn(`[BackupService:${this.namespace}] ${type} backup is too old or invalid`);
        return null;
      }

      // Validate data structure
      if (!this.validateData(backup.data)) {
        console.warn(`[BackupService:${this.namespace}] ${type} backup data validation failed`);
        return null;
      }

      console.log(
        `[BackupService:${this.namespace}] Successfully loaded ${type} backup from ${backup.metadata.timestamp}`,
      );
      return backup.data;
    } catch (error) {
      console.error(`[BackupService:${this.namespace}] Failed to load ${type} backup:`, error);
      return null;
    }
  }

  /**
   * Create backup data with metadata
   */
  private createBackupData(data: T): BackupData<T> {
    const dataStr = JSON.stringify(data);
    const itemCount = this.getItemCount(data);

    return {
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        dataSize: dataStr.length,
        itemCount,
      },
    };
  }

  /**
   * Check if backup is within valid time range
   */
  private isBackupValid(backup: BackupData<T>): boolean {
    try {
      const backupTime = new Date(backup.metadata.timestamp).getTime();
      const age = Date.now() - backupTime;

      if (age < 0) {
        console.warn(`[BackupService:${this.namespace}] Backup has future timestamp`);
        return false;
      }

      if (age > this.maxBackupAge) {
        console.warn(
          `[BackupService:${this.namespace}] Backup is too old: ${Math.floor(age / (24 * 60 * 60 * 1000))} days`,
        );
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get item count from data (for logging)
   */
  private getItemCount(data: T): number {
    try {
      if (typeof data === 'object' && data !== null) {
        if ('folders' in data && Array.isArray((data as Record<string, unknown>).folders)) {
          return ((data as Record<string, unknown>).folders as unknown[]).length;
        }
        if (Array.isArray(data)) {
          return data.length;
        }
        return Object.keys(data).length;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Update metadata tracking
   */
  private updateMetadata(type: string, metadata: BackupMetadata): void {
    try {
      const allMetadata = this.getAllMetadata();
      allMetadata[type] = metadata;
      localStorage.setItem(this.metadataKey, JSON.stringify(allMetadata));
    } catch (error) {
      console.warn(`[BackupService:${this.namespace}] Failed to update metadata:`, error);
    }
  }

  /**
   * Get all backup metadata
   */
  getAllMetadata(): Record<string, BackupMetadata> {
    try {
      const metadataStr = localStorage.getItem(this.metadataKey);
      return metadataStr ? JSON.parse(metadataStr) : {};
    } catch {
      return {};
    }
  }

  /**
   * Clear all backups (for testing or cleanup)
   */
  clearAllBackups(): void {
    try {
      localStorage.removeItem(this.primaryKey);
      localStorage.removeItem(this.emergencyKey);
      localStorage.removeItem(this.beforeUnloadKey);
      localStorage.removeItem(this.metadataKey);
      console.log(`[BackupService:${this.namespace}] All backups cleared`);
    } catch (error) {
      console.error(`[BackupService:${this.namespace}] Failed to clear backups:`, error);
    }
  }

  /**
   * Cleanup - remove event listeners
   */
  destroy(): void {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }
}
