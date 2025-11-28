/**
 * Service for managing starred messages across all conversations
 * Implements Singleton pattern for centralized state management
 */

import { eventBus } from './EventBus';
import type { StarredMessage, StarredMessagesData } from './starredTypes';

import { StorageKeys } from '@/core/types/common';

export class StarredMessagesService {
  private static readonly STORAGE_KEY = StorageKeys.TIMELINE_STARRED_MESSAGES;

  /**
   * Get all starred messages from storage
   */
  static async getAllStarredMessages(): Promise<StarredMessagesData> {
    try {
      const result = await this.getFromStorage();
      return result || { messages: {} };
    } catch (error) {
      console.error('[StarredMessagesService] Failed to get starred messages:', error);
      return { messages: {} };
    }
  }

  /**
   * Get starred messages for a specific conversation
   */
  static async getStarredMessagesForConversation(
    conversationId: string
  ): Promise<StarredMessage[]> {
    const data = await this.getAllStarredMessages();
    return data.messages[conversationId] || [];
  }

  /**
   * Add a starred message
   */
  static async addStarredMessage(message: StarredMessage): Promise<void> {
    try {
      const data = await this.getAllStarredMessages();

      if (!data.messages[message.conversationId]) {
        data.messages[message.conversationId] = [];
      }

      // Check if message already exists
      const exists = data.messages[message.conversationId].some(
        (m) => m.turnId === message.turnId
      );

      if (!exists) {
        data.messages[message.conversationId].push(message);
        await this.saveToStorage(data);

        // Emit event for cross-component synchronization
        eventBus.emit('starred:added', {
          conversationId: message.conversationId,
          turnId: message.turnId,
        });

        // Also update localStorage for backward compatibility
        this.updateLegacyStorage(message.conversationId, message.turnId, 'add');
      }
    } catch (error) {
      console.error('[StarredMessagesService] Failed to add starred message:', error);
    }
  }

  /**
   * Remove a starred message
   */
  static async removeStarredMessage(
    conversationId: string,
    turnId: string
  ): Promise<void> {
    try {
      const data = await this.getAllStarredMessages();

      if (data.messages[conversationId]) {
        const initialLength = data.messages[conversationId].length;
        data.messages[conversationId] = data.messages[conversationId].filter(
          (m) => m.turnId !== turnId
        );

        // Only save and emit if actually removed
        if (data.messages[conversationId].length < initialLength) {
          // Remove conversation key if no messages left
          if (data.messages[conversationId].length === 0) {
            delete data.messages[conversationId];
          }

          await this.saveToStorage(data);

          // Emit event for cross-component synchronization
          eventBus.emit('starred:removed', {
            conversationId,
            turnId,
          });

          // Also update localStorage for backward compatibility
          this.updateLegacyStorage(conversationId, turnId, 'remove');
        }
      }
    } catch (error) {
      console.error('[StarredMessagesService] Failed to remove starred message:', error);
    }
  }

  /**
   * Update legacy localStorage format for backward compatibility
   * This ensures TimelineManager's storage event listener works
   */
  private static updateLegacyStorage(
    conversationId: string,
    turnId: string,
    action: 'add' | 'remove'
  ): void {
    try {
      const key = `geminiTimelineStars:${conversationId}`;
      const raw = localStorage.getItem(key);
      let ids: string[] = [];

      if (raw) {
        try {
          ids = JSON.parse(raw);
          if (!Array.isArray(ids)) ids = [];
        } catch {
          ids = [];
        }
      }

      if (action === 'add') {
        if (!ids.includes(turnId)) {
          ids.push(turnId);
        }
      } else {
        ids = ids.filter((id) => id !== turnId);
      }

      localStorage.setItem(key, JSON.stringify(ids));
    } catch (error) {
      console.debug('[StarredMessagesService] Failed to update legacy storage:', error);
    }
  }

  /**
   * Check if a message is starred
   */
  static async isMessageStarred(conversationId: string, turnId: string): Promise<boolean> {
    const messages = await this.getStarredMessagesForConversation(conversationId);
    return messages.some((m) => m.turnId === turnId);
  }

  /**
   * Get all starred messages sorted by timestamp (newest first)
   */
  static async getAllStarredMessagesSorted(): Promise<StarredMessage[]> {
    const data = await this.getAllStarredMessages();
    const allMessages: StarredMessage[] = [];

    Object.values(data.messages).forEach((messages) => {
      allMessages.push(...messages);
    });

    return allMessages.sort((a, b) => b.starredAt - a.starredAt);
  }

  /**
   * Get from chrome.storage.local or localStorage fallback
   */
  private static async getFromStorage(): Promise<StarredMessagesData | null> {
    try {
      // Try chrome.storage.local first
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get([this.STORAGE_KEY], (result) => {
            resolve(result[this.STORAGE_KEY] || null);
          });
        });
      }

      // Fallback to localStorage
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[StarredMessagesService] Failed to get from storage:', error);
      return null;
    }
  }

  /**
   * Save to chrome.storage.local or localStorage fallback
   */
  private static async saveToStorage(data: StarredMessagesData): Promise<void> {
    try {
      // Try chrome.storage.local first
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await new Promise<void>((resolve, reject) => {
          chrome.storage.local.set({ [this.STORAGE_KEY]: data }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        return;
      }

      // Fallback to localStorage
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[StarredMessagesService] Failed to save to storage:', error);
      throw error;
    }
  }
}
