/* Background service worker - handles cross-origin image fetch for packaging and popup opening */

import { StorageKeys } from '@/core/types/common';
import type { StarredMessage, StarredMessagesData } from '@/pages/content/timeline/starredTypes';

/**
 * Centralized starred messages management to prevent race conditions.
 * All read-modify-write operations are serialized through this background script.
 */
class StarredMessagesManager {
  private operationQueue: Promise<any> = Promise.resolve();

  /**
   * Serialize all operations to prevent race conditions
   */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const promise = this.operationQueue.then(operation, operation);
    this.operationQueue = promise.catch(() => {}); // Prevent error propagation
    return promise;
  }

  private async getFromStorage(): Promise<StarredMessagesData> {
    try {
      const result = await chrome.storage.local.get([StorageKeys.TIMELINE_STARRED_MESSAGES]);
      return result[StorageKeys.TIMELINE_STARRED_MESSAGES] || { messages: {} };
    } catch (error) {
      console.error('[Background] Failed to get starred messages:', error);
      return { messages: {} };
    }
  }

  private async saveToStorage(data: StarredMessagesData): Promise<void> {
    await chrome.storage.local.set({ [StorageKeys.TIMELINE_STARRED_MESSAGES]: data });
  }

  async addStarredMessage(message: StarredMessage): Promise<boolean> {
    return this.serialize(async () => {
      const data = await this.getFromStorage();

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
        return true;
      }
      return false;
    });
  }

  async removeStarredMessage(conversationId: string, turnId: string): Promise<boolean> {
    return this.serialize(async () => {
      const data = await this.getFromStorage();

      if (data.messages[conversationId]) {
        const initialLength = data.messages[conversationId].length;
        data.messages[conversationId] = data.messages[conversationId].filter(
          (m) => m.turnId !== turnId
        );

        if (data.messages[conversationId].length < initialLength) {
          // Remove conversation key if no messages left
          if (data.messages[conversationId].length === 0) {
            delete data.messages[conversationId];
          }

          await this.saveToStorage(data);
          return true;
        }
      }
      return false;
    });
  }

  async getAllStarredMessages(): Promise<StarredMessagesData> {
    return this.getFromStorage();
  }

  async getStarredMessagesForConversation(conversationId: string): Promise<StarredMessage[]> {
    const data = await this.getFromStorage();
    return data.messages[conversationId] || [];
  }

  async isMessageStarred(conversationId: string, turnId: string): Promise<boolean> {
    const messages = await this.getStarredMessagesForConversation(conversationId);
    return messages.some((m) => m.turnId === turnId);
  }
}

const starredMessagesManager = new StarredMessagesManager();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      // Handle starred messages operations
      if (message && message.type && message.type.startsWith('gv.starred.')) {
        switch (message.type) {
          case 'gv.starred.add': {
            const added = await starredMessagesManager.addStarredMessage(message.payload);
            sendResponse({ ok: true, added });
            return;
          }
          case 'gv.starred.remove': {
            const removed = await starredMessagesManager.removeStarredMessage(
              message.payload.conversationId,
              message.payload.turnId
            );
            sendResponse({ ok: true, removed });
            return;
          }
          case 'gv.starred.getAll': {
            const data = await starredMessagesManager.getAllStarredMessages();
            sendResponse({ ok: true, data });
            return;
          }
          case 'gv.starred.getForConversation': {
            const messages = await starredMessagesManager.getStarredMessagesForConversation(
              message.payload.conversationId
            );
            sendResponse({ ok: true, messages });
            return;
          }
          case 'gv.starred.isStarred': {
            const isStarred = await starredMessagesManager.isMessageStarred(
              message.payload.conversationId,
              message.payload.turnId
            );
            sendResponse({ ok: true, isStarred });
            return;
          }
        }
      }

      // Handle popup opening request
      if (message && message.type === 'gv.openPopup') {
        try {
          await chrome.action.openPopup();
          sendResponse({ ok: true });
        } catch (e: any) {
          // Fallback: If openPopup fails, user can click the extension icon
          console.warn('[GV] Failed to open popup programmatically:', e);
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        return;
      }

      // Handle image fetch
      if (!message || message.type !== 'gv.fetchImage') return;
      const url = String(message.url || '');
      if (!/^https?:\/\//i.test(url)) {
        sendResponse({ ok: false, error: 'invalid_url' });
        return;
      }
      const resp = await fetch(url, { credentials: 'include', mode: 'cors' as RequestMode });
      if (!resp.ok) {
        sendResponse({ ok: false, status: resp.status });
        return;
      }
      const contentType = resp.headers.get('Content-Type') || '';
      const ab = await resp.arrayBuffer();
      // Convert to base64
      const b64 = arrayBufferToBase64(ab);
      sendResponse({ ok: true, contentType, base64: b64 });
    } catch (e: any) {
      try { sendResponse({ ok: false, error: String(e?.message || e) }); } catch {}
    }
  })();
  return true; // keep channel open for async sendResponse
});

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa on service worker context is available
  return btoa(binary);
}
