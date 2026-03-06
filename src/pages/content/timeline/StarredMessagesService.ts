/**
 * Service for managing starred messages across all conversations
 * Uses message passing to background script to prevent race conditions
 */
import { eventBus } from './EventBus';
import type { StarredMessage, StarredMessagesData } from './starredTypes';

export class StarredMessagesService {
  /**
   * Send message to background script and wait for response
   */
  private static async sendMessage<T>(type: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error(response?.error || 'Operation failed'));
          return;
        }
        resolve(response as T);
      });
    });
  }

  /**
   * Get all starred messages from storage
   */
  static async getAllStarredMessages(): Promise<StarredMessagesData> {
    try {
      const response = await this.sendMessage<{ ok: boolean; data: StarredMessagesData }>(
        'gv.starred.getAll',
      );
      return response.data || { messages: {} };
    } catch (error) {
      console.error('[StarredMessagesService] Failed to get starred messages:', error);
      return { messages: {} };
    }
  }

  /**
   * Get starred messages for a specific conversation
   */
  static async getStarredMessagesForConversation(
    conversationId: string,
  ): Promise<StarredMessage[]> {
    try {
      const response = await this.sendMessage<{ ok: boolean; messages: StarredMessage[] }>(
        'gv.starred.getForConversation',
        { conversationId },
      );
      return response.messages || [];
    } catch (error) {
      console.error('[StarredMessagesService] Failed to get starred messages:', error);
      return [];
    }
  }

  /**
   * Add a starred message - delegated to background script
   */
  static async addStarredMessage(message: StarredMessage): Promise<void> {
    try {
      const response = await this.sendMessage<{ ok: boolean; added: boolean }>(
        'gv.starred.add',
        message,
      );

      if (response.added) {
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
   * Remove a starred message - delegated to background script
   */
  static async removeStarredMessage(conversationId: string, turnId: string): Promise<void> {
    try {
      const response = await this.sendMessage<{ ok: boolean; removed: boolean }>(
        'gv.starred.remove',
        { conversationId, turnId },
      );

      if (response.removed) {
        // Emit event for cross-component synchronization
        eventBus.emit('starred:removed', {
          conversationId,
          turnId,
        });

        // Also update localStorage for backward compatibility
        this.updateLegacyStorage(conversationId, turnId, 'remove');
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
    action: 'add' | 'remove',
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
}
