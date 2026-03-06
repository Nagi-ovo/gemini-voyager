/**
 * StorageMonitor - Monitor browser storage quota and warn users when nearing limits
 *
 * This service monitors storage usage using the Storage API and provides warnings
 * when storage is running low. This helps prevent data loss from quota exceeded errors.
 *
 * Features:
 * - Periodic quota checks (configurable interval)
 * - Warning thresholds (default: 80%, 90%, 95%)
 * - User-friendly notifications with usage details
 * - Manual quota checking
 * - Automatic monitoring with cleanup
 */

export interface StorageQuotaInfo {
  usage: number; // Bytes used
  quota: number; // Total bytes available
  usagePercent: number; // Usage percentage (0-1)
  usageMB: number; // Usage in megabytes
  quotaMB: number; // Quota in megabytes
}

export interface StorageMonitorConfig {
  enabled: boolean;
  checkIntervalMs: number;
  warningThresholds: number[]; // Array of percentages (e.g., [0.8, 0.9, 0.95])
  showNotifications: boolean;
}

type NotificationCallback = (message: string, level: 'info' | 'warning' | 'error') => void;

export class StorageMonitor {
  private static instance: StorageMonitor | null = null;
  private config: StorageMonitorConfig;
  private monitorIntervalId: number | null = null;
  private lastWarningLevel: number = 0; // Track highest warning level shown
  private notificationCallback: NotificationCallback | null = null;

  // Default configuration
  private static readonly DEFAULT_CONFIG: StorageMonitorConfig = {
    enabled: true,
    checkIntervalMs: 60000, // Check every minute
    warningThresholds: [0.8, 0.9, 0.95], // 80%, 90%, 95%
    showNotifications: true,
  };

  private constructor(config?: Partial<StorageMonitorConfig>) {
    this.config = {
      ...StorageMonitor.DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<StorageMonitorConfig>): StorageMonitor {
    if (!StorageMonitor.instance) {
      StorageMonitor.instance = new StorageMonitor(config);
    }
    return StorageMonitor.instance;
  }

  /**
   * Set custom notification callback
   */
  setNotificationCallback(callback: NotificationCallback): void {
    this.notificationCallback = callback;
  }

  /**
   * Check if Storage API is available
   */
  static isStorageApiAvailable(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage.estimate === 'function'
    );
  }

  /**
   * Get current storage quota information
   */
  async checkQuota(): Promise<StorageQuotaInfo | null> {
    if (!StorageMonitor.isStorageApiAvailable()) {
      console.warn('[StorageMonitor] Storage API not available');
      return null;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;

      if (quota === 0) {
        console.warn('[StorageMonitor] Storage quota is 0, API may not be fully supported');
        return null;
      }

      const usagePercent = usage / quota;
      const usageMB = usage / (1024 * 1024);
      const quotaMB = quota / (1024 * 1024);

      return {
        usage,
        quota,
        usagePercent,
        usageMB,
        quotaMB,
      };
    } catch (error) {
      console.error('[StorageMonitor] Failed to check quota:', error);
      return null;
    }
  }

  /**
   * Check quota and show warnings if needed
   */
  async checkAndWarn(): Promise<StorageQuotaInfo | null> {
    const info = await this.checkQuota();
    if (!info) return null;

    // Find the highest threshold exceeded
    const exceededThresholds = this.config.warningThresholds.filter(
      (threshold) => info.usagePercent >= threshold,
    );

    if (exceededThresholds.length === 0) {
      // Usage is below all thresholds, reset warning level
      this.lastWarningLevel = 0;
      return info;
    }

    const highestThreshold = Math.max(...exceededThresholds);

    // Only show notification if this is a new or higher warning level
    if (highestThreshold > this.lastWarningLevel) {
      this.lastWarningLevel = highestThreshold;

      const message = this.formatWarningMessage(info);
      const level = this.getWarningLevel(info.usagePercent);

      console.warn(`[StorageMonitor] ${message}`);

      if (this.config.showNotifications) {
        this.showNotification(message, level);
      }
    }

    return info;
  }

  /**
   * Format warning message
   */
  private formatWarningMessage(info: StorageQuotaInfo): string {
    const usagePercent = Math.round(info.usagePercent * 100);
    const usageMB = info.usageMB.toFixed(2);
    const quotaMB = info.quotaMB.toFixed(2);

    return (
      `Storage usage is ${usagePercent}% (${usageMB} MB / ${quotaMB} MB). ` +
      `Consider exporting and cleaning old data to free up space.`
    );
  }

  /**
   * Get warning level based on usage percentage
   */
  private getWarningLevel(usagePercent: number): 'info' | 'warning' | 'error' {
    if (usagePercent >= 0.95) return 'error';
    if (usagePercent >= 0.9) return 'warning';
    return 'info';
  }

  /**
   * Show notification (uses callback if set, otherwise uses default)
   */
  private showNotification(message: string, level: 'info' | 'warning' | 'error'): void {
    if (this.notificationCallback) {
      this.notificationCallback(message, level);
      return;
    }

    // Default notification implementation
    this.showDefaultNotification(message, level);
  }

  /**
   * Default notification implementation (DOM-based)
   */
  private showDefaultNotification(message: string, level: 'info' | 'warning' | 'error'): void {
    try {
      const notification = document.createElement('div');
      notification.className = `gv-notification gv-notification-${level}`;
      notification.textContent = `[Gemini Voyager] ${message}`;

      // Color based on level
      const colors = {
        info: '#2196F3',
        warning: '#FF9800',
        error: '#F44336',
      };

      const style = notification.style;
      style.position = 'fixed';
      style.top = '20px';
      style.right = '20px';
      style.padding = '12px 20px';
      style.background = colors[level];
      style.color = 'white';
      style.borderRadius = '4px';
      style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      style.zIndex = String(2147483647);
      style.maxWidth = '400px';
      style.fontSize = '14px';
      style.fontFamily = 'system-ui, -apple-system, sans-serif';
      style.lineHeight = '1.4';

      document.body.appendChild(notification);

      // Auto-remove after timeout (longer for errors)
      const timeout = level === 'error' ? 10000 : 5000;
      setTimeout(() => {
        try {
          document.body.removeChild(notification);
        } catch {
          // Element might already be removed
        }
      }, timeout);
    } catch (error) {
      console.error('[StorageMonitor] Failed to show notification:', error);
    }
  }

  /**
   * Start automatic monitoring
   */
  startMonitoring(): void {
    if (!this.config.enabled) {
      console.log('[StorageMonitor] Monitoring is disabled');
      return;
    }

    if (!StorageMonitor.isStorageApiAvailable()) {
      console.warn('[StorageMonitor] Storage API not available, cannot start monitoring');
      return;
    }

    if (this.monitorIntervalId !== null) {
      console.log('[StorageMonitor] Monitoring already started');
      return;
    }

    console.log(
      `[StorageMonitor] Starting automatic monitoring (interval: ${this.config.checkIntervalMs}ms)`,
    );

    // Check immediately
    this.checkAndWarn().catch((error) => {
      console.error('[StorageMonitor] Initial check failed:', error);
    });

    // Then check periodically
    this.monitorIntervalId = window.setInterval(() => {
      this.checkAndWarn().catch((error) => {
        console.error('[StorageMonitor] Periodic check failed:', error);
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop automatic monitoring
   */
  stopMonitoring(): void {
    if (this.monitorIntervalId !== null) {
      console.log('[StorageMonitor] Stopping automatic monitoring');
      window.clearInterval(this.monitorIntervalId);
      this.monitorIntervalId = null;
      this.lastWarningLevel = 0; // Reset warning level
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StorageMonitorConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Restart monitoring if enabled state changed
    if (wasEnabled !== this.config.enabled) {
      if (this.config.enabled) {
        this.startMonitoring();
      } else {
        this.stopMonitoring();
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): StorageMonitorConfig {
    return { ...this.config };
  }

  /**
   * Get formatted storage info for display
   */
  async getFormattedInfo(): Promise<string | null> {
    const info = await this.checkQuota();
    if (!info) return null;

    const usagePercent = Math.round(info.usagePercent * 100);
    const usageMB = info.usageMB.toFixed(2);
    const quotaMB = info.quotaMB.toFixed(2);

    return `Storage: ${usageMB} MB / ${quotaMB} MB (${usagePercent}%)`;
  }

  /**
   * Cleanup - stop monitoring and reset
   */
  destroy(): void {
    this.stopMonitoring();
    this.notificationCallback = null;
    this.lastWarningLevel = 0;
  }

  /**
   * Reset singleton instance (mainly for testing)
   */
  static resetInstance(): void {
    if (StorageMonitor.instance) {
      StorageMonitor.instance.destroy();
      StorageMonitor.instance = null;
    }
  }
}

/**
 * Convenience function to get storage monitor instance
 */
export function getStorageMonitor(config?: Partial<StorageMonitorConfig>): StorageMonitor {
  return StorageMonitor.getInstance(config);
}
