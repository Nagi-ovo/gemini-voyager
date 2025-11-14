/**
 * Backup Scheduler
 * Manages periodic backup scheduling using chrome.alarms API
 */

import browser from 'webextension-polyfill';
import { BackupInterval } from '../types/backup';
import { backupService } from './BackupService';
import { logger as baseLogger } from '@/core/services/LoggerService';

const ALARM_NAME = 'gv-backup-alarm';

/**
 * Interval configurations in minutes
 */
const INTERVAL_MINUTES: Record<BackupInterval, number | null> = {
  [BackupInterval.DISABLED]: null,
  [BackupInterval.HOURLY]: 60,
  [BackupInterval.DAILY]: 60 * 24,
  [BackupInterval.WEEKLY]: 60 * 24 * 7,
};

export class BackupScheduler {
  private readonly logger = baseLogger.createChild('BackupScheduler');

  /**
   * Initialize scheduler (call from background script)
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing backup scheduler...');

      // Set up alarm listener
      if (typeof chrome !== 'undefined' && chrome.alarms) {
        chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
      }

      // Schedule based on current config
      await this.updateSchedule();

      this.logger.info('Backup scheduler initialized');
    } catch (error) {
      this.logger.error('Failed to initialize backup scheduler', { error });
    }
  }

  /**
   * Update schedule based on current configuration
   */
  async updateSchedule(): Promise<void> {
    try {
      const config = await backupService.getConfig();

      // Clear existing alarm
      await this.clearSchedule();

      // Schedule new alarm if enabled
      if (config.enabled && config.interval !== BackupInterval.DISABLED) {
        await this.scheduleBackup(config.interval);
        this.logger.info('Backup scheduled', { interval: config.interval });
      } else {
        this.logger.info('Backup scheduling disabled');
      }
    } catch (error) {
      this.logger.error('Failed to update backup schedule', { error });
    }
  }

  /**
   * Schedule periodic backup
   */
  private async scheduleBackup(interval: BackupInterval): Promise<void> {
    const minutes = INTERVAL_MINUTES[interval];

    if (!minutes) {
      this.logger.warn('Invalid interval for scheduling', { interval });
      return;
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.alarms) {
        await chrome.alarms.create(ALARM_NAME, {
          periodInMinutes: minutes,
          delayInMinutes: minutes, // First backup after one interval
        });

        this.logger.info('Alarm created', { alarm: ALARM_NAME, minutes });
      }
    } catch (error) {
      this.logger.error('Failed to create alarm', { error });
      throw error;
    }
  }

  /**
   * Clear scheduled backups
   */
  private async clearSchedule(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.alarms) {
        await chrome.alarms.clear(ALARM_NAME);
        this.logger.info('Alarm cleared', { alarm: ALARM_NAME });
      }
    } catch (error) {
      this.logger.error('Failed to clear alarm', { error });
    }
  }

  /**
   * Handle alarm trigger
   */
  private async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== ALARM_NAME) {
      return;
    }

    this.logger.info('Backup alarm triggered');

    try {
      const config = await backupService.getConfig();

      // Double-check if backup is still enabled
      if (!config.enabled) {
        this.logger.warn('Backup is disabled, skipping');
        await this.clearSchedule();
        return;
      }

      // Execute backup
      const result = await backupService.createBackup();

      if (result.success) {
        this.logger.info('Scheduled backup completed successfully', {
          filename: result.filename,
        });

        // Send notification (optional)
        await this.showNotification(
          'Backup Created',
          `Backup saved: ${result.filename}`
        );
      } else {
        this.logger.error('Scheduled backup failed', { error: result.error });

        // Send error notification
        await this.showNotification(
          'Backup Failed',
          result.error || 'Unknown error',
          'error'
        );
      }
    } catch (error) {
      this.logger.error('Error during scheduled backup', { error });
    }
  }

  /**
   * Show browser notification
   */
  private async showNotification(
    title: string,
    message: string,
    type: 'basic' | 'error' = 'basic'
  ): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.notifications) {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icon-128.png'),
          title: `Gemini Voyager - ${title}`,
          message,
          priority: type === 'error' ? 2 : 0,
        });
      }
    } catch (error) {
      this.logger.warn('Failed to show notification', { error });
    }
  }

  /**
   * Trigger immediate backup (for manual backup button)
   */
  async triggerImmediateBackup(): Promise<void> {
    this.logger.info('Manual backup triggered');

    try {
      const result = await backupService.createBackup();

      if (result.success) {
        this.logger.info('Manual backup completed successfully', {
          filename: result.filename,
        });
      } else {
        this.logger.error('Manual backup failed', { error: result.error });
        throw new Error(result.error);
      }
    } catch (error) {
      this.logger.error('Error during manual backup', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const backupScheduler = new BackupScheduler();
